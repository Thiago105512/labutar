import { validarEmail, validarTelefone, somenteDigitos } from "../../core/src/validacao.js";
import { ehDiaUtil, somarDias } from "../../core/src/datas.js";
import { URGENCIA } from "./constantes.js";
import { paraInstante, minutosDaHora, instanteCivil } from "./instantes.js";

export const CANAIS = Object.freeze({
  EMAIL: "EMAIL",
  WHATSAPP: "WHATSAPP",
  SMS: "SMS",
  PUSH: "PUSH",
  MURAL: "MURAL",
});

/**
 * corpoMaximo: limite que o próprio provedor impõe (WhatsApp 4096 na API oficial;
 * SMS 1530 = 10 segmentos concatenados, acima disso as operadoras brasileiras
 * recusam; PUSH 1780 = payload de alerta do APNs).
 * custoRelativo: custo aproximado por mensagem tendo o e-mail como 1 — SMS é o
 * mais caro e por isso é fallback, nunca preferência.
 * intrusivo: canais intrusivos são os que a política de horário restringe;
 * e-mail e mural são assíncronos e podem ser entregues a qualquer hora.
 */
export const LIMITES_CANAL = Object.freeze({
  EMAIL: Object.freeze({ corpoMaximo: 102_400, suportaAnexo: true, suportaAssunto: true, custoRelativo: 1, intrusivo: false }),
  WHATSAPP: Object.freeze({ corpoMaximo: 4_096, suportaAnexo: true, suportaAssunto: false, custoRelativo: 2, intrusivo: true }),
  SMS: Object.freeze({ corpoMaximo: 1_530, suportaAnexo: false, suportaAssunto: false, custoRelativo: 8, intrusivo: true }),
  PUSH: Object.freeze({ corpoMaximo: 1_780, suportaAnexo: false, suportaAssunto: true, custoRelativo: 1, intrusivo: true }),
  MURAL: Object.freeze({ corpoMaximo: 20_000, suportaAnexo: true, suportaAssunto: true, custoRelativo: 0, intrusivo: false }),
});

/**
 * Ordem de fallback documentada: WhatsApp tem a maior taxa de abertura no
 * recrutamento brasileiro; e-mail é o fallback universal (rico, gratuito, sem
 * restrição de horário); SMS só quando não há WhatsApp (e custa caro); push
 * exige usuário logado no portal; mural é passivo e por isso é o último recurso.
 */
export const ORDEM_FALLBACK = Object.freeze([
  CANAIS.WHATSAPP,
  CANAIS.EMAIL,
  CANAIS.SMS,
  CANAIS.PUSH,
  CANAIS.MURAL,
]);

/** Janela usada quando o tenant define política sem dizer o intervalo. */
export const JANELA_PADRAO = Object.freeze({ de: "08:00", ate: "20:00" });

/** Mesmo fuso de referência do core/datas.js (América/São_Paulo), que não o exporta. */
export const FUSO_PADRAO_MIN = -180;

const CHAVES_DESTINO = Object.freeze({
  EMAIL: Object.freeze(["EMAIL", "email"]),
  WHATSAPP: Object.freeze(["WHATSAPP", "whatsapp", "celular", "telefone"]),
  SMS: Object.freeze(["SMS", "sms", "celular", "telefone"]),
  PUSH: Object.freeze(["PUSH", "push", "pushToken", "token"]),
  MURAL: Object.freeze(["MURAL", "mural", "usuarioId", "id"]),
});

const VALOR_CANAIS = Object.values(CANAIS);

export function limites(canal) {
  return LIMITES_CANAL[String(canal ?? "").toUpperCase()] ?? null;
}

function destinoInvalido(canal, motivo) {
  return { valido: false, motivo, canal, normalizado: null };
}

function extrairCampo(destino, chaves) {
  if (destino === null || destino === undefined) return null;
  if (typeof destino === "string" || typeof destino === "number") {
    const texto = String(destino).trim();
    return texto === "" ? null : texto;
  }
  for (const chave of chaves) {
    const valor = destino[chave];
    if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
      return typeof valor === "object" ? valor : String(valor).trim();
    }
  }
  return null;
}

/**
 * Valida o destino no formato do canal e devolve o valor normalizado que o
 * servidor deve usar na entrega (e-mail minúsculo, telefone só dígitos).
 */
export function validarDestino(canal, destino) {
  const nomeCanal = String(canal ?? "").toUpperCase();
  if (!VALOR_CANAIS.includes(nomeCanal)) {
    return destinoInvalido(nomeCanal, `Canal desconhecido: "${canal}"`);
  }

  if (nomeCanal === CANAIS.EMAIL) {
    const texto = extrairCampo(destino, CHAVES_DESTINO.EMAIL);
    const resultado = validarEmail(texto);
    return resultado.valido
      ? { valido: true, motivo: null, canal: nomeCanal, normalizado: String(texto).toLowerCase() }
      : destinoInvalido(nomeCanal, resultado.motivo);
  }

  if (nomeCanal === CANAIS.WHATSAPP || nomeCanal === CANAIS.SMS) {
    const texto = extrairCampo(destino, CHAVES_DESTINO[nomeCanal]);
    const resultado = validarTelefone(texto);
    if (!resultado.valido) return destinoInvalido(nomeCanal, resultado.motivo);
    // Fixo não recebe WhatsApp e, na prática, não recebe SMS de operadora brasileira.
    if (!resultado.celular) {
      return destinoInvalido(nomeCanal, `${nomeCanal} exige número de celular; o número informado é fixo`);
    }
    return { valido: true, motivo: null, canal: nomeCanal, normalizado: somenteDigitos(texto) };
  }

  if (nomeCanal === CANAIS.PUSH) {
    const token = extrairCampo(destino, CHAVES_DESTINO.PUSH);
    const valor = token && typeof token === "object" ? extrairCampo(token, ["token", "pushToken"]) : token;
    if (!valor || typeof valor !== "string") {
      return destinoInvalido(nomeCanal, "PUSH exige um token de dispositivo");
    }
    return { valido: true, motivo: null, canal: nomeCanal, normalizado: valor };
  }

  const usuarioId = extrairCampo(destino, CHAVES_DESTINO.MURAL);
  const valor = usuarioId && typeof usuarioId === "object" ? extrairCampo(usuarioId, ["usuarioId", "id"]) : usuarioId;
  if (!valor || typeof valor !== "string") {
    return destinoInvalido(nomeCanal, "MURAL exige um usuarioId");
  }
  return { valido: true, motivo: null, canal: nomeCanal, normalizado: valor };
}

// --- SMS -------------------------------------------------------------------

const GSM7_BASICO = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
);
/** Caractere da tabela estendida ocupa 2 posições no segmento. */
const GSM7_ESTENDIDO = new Set("^{}\\[]~|€\f");

function pesoGSM7(texto) {
  let peso = 0;
  for (const caractere of texto) peso += GSM7_ESTENDIDO.has(caractere) ? 2 : 1;
  return peso;
}

export function ehCompativelGSM7(texto) {
  return [...String(texto ?? "")].every((c) => GSM7_BASICO.has(c) || GSM7_ESTENDIDO.has(c));
}

/**
 * Conta segmentos de SMS. Texto 100% GSM-7 usa 160 caracteres por segmento;
 * a partir do segundo, o cabeçalho de concatenação come 7 e sobram 153.
 * Qualquer caractere fora da tabela GSM-7 (á, õ, ç, emoji) força UCS-2, que
 * corta o limite para 70/67 — por isso vale a pena tirar acento de SMS.
 */
export function contarSegmentosSMS(texto) {
  const conteudo = String(texto ?? "");
  if (conteudo.length === 0) {
    return { caracteres: 0, segmentos: 0, porSegmento: 0, codificacao: "GSM7" };
  }
  const gsm7 = ehCompativelGSM7(conteudo);
  const caracteres = gsm7 ? pesoGSM7(conteudo) : conteudo.length;
  const unico = gsm7 ? 160 : 70;
  const concatenado = gsm7 ? 153 : 67;
  const segmentos = caracteres <= unico ? 1 : Math.ceil(caracteres / concatenado);
  return { caracteres, segmentos, porSegmento: segmentos === 1 ? unico : concatenado, codificacao: gsm7 ? "GSM7" : "UCS2" };
}

// --- Janela de envio -------------------------------------------------------

function janelaDoCanal(canal, horarios) {
  if (!horarios) return null;
  if (Object.hasOwn(horarios, canal)) return horarios[canal];
  return horarios.permitido;
}

function fusoDe(horarios, janela) {
  if (Number.isFinite(horarios?.fusoMinutos)) return horarios.fusoMinutos;
  if (Number.isFinite(janela?.fusoMinutos)) return janela.fusoMinutos;
  return FUSO_PADRAO_MIN;
}

/** Próxima abertura da janela: avança dia a dia até achar um dia permitido. */
function proximaAbertura(janela, diaCivil, minutosAgora, fuso, feriados) {
  const de = minutosDaHora(janela?.de ?? "00:00");
  const exigirDiaUtil = janela?.diasUteis === true;
  for (let i = 0; i <= 31; i++) {
    const dia = somarDias(diaCivil, i);
    if (exigirDiaUtil && !ehDiaUtil(dia, feriados)) continue;
    if (i === 0 && minutosAgora >= de) continue;
    return instanteCivil(dia, de, fuso);
  }
  return null;
}

/**
 * Diz se o canal pode ser usado neste instante e, quando não pode, para quando
 * adiar. Nunca devolve "descarte": `adiarPara` é o contrato de que a mensagem
 * volta para a fila.
 */
export function janelaPermitida(canal, horarios = null, referencia = new Date()) {
  const limite = limites(canal);
  if (!limite) return { permitido: false, motivo: `Canal desconhecido: "${canal}"`, adiarPara: null };

  const janela = janelaDoCanal(String(canal).toUpperCase(), horarios);
  if (janela === undefined || janela === null || janela === true) {
    return { permitido: true, motivo: null, adiarPara: null };
  }
  if (janela === false) {
    return { permitido: false, motivo: `${canal} bloqueado pela política de horários`, adiarPara: null };
  }
  if (!limite.intrusivo) {
    return { permitido: true, motivo: "Canal assíncrono: sem restrição de horário", adiarPara: null };
  }

  const fuso = fusoDe(horarios, janela);
  const feriados = janela.feriados ?? horarios.feriados ?? [];
  const instante = referencia instanceof Date ? referencia : new Date(paraInstante(referencia));
  const civil = new Date(instante.getTime() + fuso * 60_000);
  const diaCivil = civil.toISOString().slice(0, 10);
  const minutosAgora = civil.getUTCHours() * 60 + civil.getUTCMinutes();

  if (janela.diasUteis && !ehDiaUtil(diaCivil, feriados)) {
    return {
      permitido: false,
      motivo: `${canal} restrito a dias úteis`,
      adiarPara: proximaAbertura(janela, diaCivil, -1, fuso, feriados),
    };
  }

  const de = minutosDaHora(janela.de ?? "00:00");
  const ate = minutosDaHora(janela.ate ?? "23:59");
  // `ate` é exclusivo: às 20:00 em ponto a janela 08:00–20:00 já fechou.
  const dentro = de <= ate ? minutosAgora >= de && minutosAgora < ate : minutosAgora >= de || minutosAgora < ate;
  if (dentro) return { permitido: true, motivo: null, adiarPara: null };

  const rotulo = `${janela.de ?? "00:00"}–${janela.ate ?? "23:59"}`;
  return {
    permitido: false,
    motivo: `${canal} fora da janela permitida (${rotulo})`,
    adiarPara: proximaAbertura(janela, diaCivil, minutosAgora, fuso, feriados),
  };
}

// --- Roteamento ------------------------------------------------------------

function ordemDeCanais(preferencia) {
  const brutos =
    preferencia === null || preferencia === undefined ? [] : Array.isArray(preferencia) ? preferencia : [preferencia];
  const pedidos = brutos
    .map((c) => String(c ?? "").toUpperCase())
    .filter((c) => VALOR_CANAIS.includes(c));
  return [...new Set([...pedidos, ...ORDEM_FALLBACK])];
}

function destinoParaCanal(canal, destino, preferencia) {
  if (destino === null || destino === undefined) return null;
  if (typeof destino === "string" || typeof destino === "number") {
    // Destino solto só vale para o canal preferido — senão um telefone viraria e-mail.
    const unico = Array.isArray(preferencia)
      ? preferencia.length === 1
        ? String(preferencia[0]).toUpperCase()
        : null
      : String(preferencia ?? "").toUpperCase();
    return unico === canal ? destino : null;
  }
  for (const chave of CHAVES_DESTINO[canal]) {
    const valor = destino[chave];
    if (valor !== null && valor !== undefined && String(typeof valor === "object" ? JSON.stringify(valor) : valor).trim() !== "") {
      return valor;
    }
  }
  return null;
}

/**
 * Escolhe por onde enviar. Regras, nesta ordem:
 * 1. percorre a preferência e completa com ORDEM_FALLBACK;
 * 2. descarta canal sem destino válido;
 * 3. urgência CRITICA ignora a janela de horário (cancelamento de entrevista,
 *    bloqueio de admissão);
 * 4. canal fora da janela é adiado e a tentativa segue para o próximo canal —
 *    se nenhum puder sair agora, devolve o canal preferido com `adiarPara`.
 */
export function escolherCanal({
  preferencia = null,
  destino = {},
  urgencia = URGENCIA.NORMAL,
  horarios = null,
  referencia = new Date(),
} = {}) {
  const ordem = ordemDeCanais(preferencia);
  const semPreferencia =
    preferencia === null ||
    preferencia === undefined ||
    (Array.isArray(preferencia) && preferencia.length === 0);
  const tentativas = [];
  let adiado = null;
  const critico = String(urgencia).toUpperCase() === URGENCIA.CRITICA;

  for (const canal of ordem) {
    const alvo = destinoParaCanal(canal, destino, preferencia);
    const validacao = validarDestino(canal, alvo);
    if (!validacao.valido) {
      tentativas.push({ canal, aceito: false, motivo: validacao.motivo });
      continue;
    }

    const janela = janelaPermitida(canal, horarios, referencia);
    if (!janela.permitido && !critico) {
      tentativas.push({ canal, aceito: false, motivo: janela.motivo });
      if (janela.adiarPara && (!adiado || janela.adiarPara < adiado.adiarPara)) {
        adiado = { canal, destino: validacao.normalizado, motivo: janela.motivo, adiarPara: janela.adiarPara };
      }
      continue;
    }

    const preferido = canal === ordem[0];
    const bloqueios = tentativas.map((t) => `${t.canal}: ${t.motivo}`).join("; ");
    let motivo;
    if (semPreferencia) {
      motivo = `Sem preferência declarada: ${canal} é o primeiro canal viável da ordem padrão`;
    } else if (!preferido) {
      motivo = `Preferência inviável (${bloqueios}); enviado por ${canal}`;
    } else {
      motivo =
        critico && !janela.permitido
          ? `Urgência crítica: janela de horário ignorada (${canal})`
          : "Canal preferido disponível";
    }
    return {
      canal,
      destino: validacao.normalizado,
      motivo,
      adiarPara: null,
      urgencia: String(urgencia).toUpperCase(),
      tentativas,
    };
  }

  if (adiado) {
    return {
      canal: adiado.canal,
      destino: adiado.destino,
      motivo: `${adiado.motivo}; envio adiado, não descartado`,
      adiarPara: adiado.adiarPara,
      urgencia: String(urgencia).toUpperCase(),
      tentativas,
    };
  }

  return {
    canal: null,
    destino: null,
    motivo: `Nenhum canal com destino válido (${tentativas.map((t) => `${t.canal}: ${t.motivo}`).join("; ")})`,
    adiarPara: null,
    urgencia: String(urgencia).toUpperCase(),
    tentativas,
  };
}
