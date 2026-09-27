import { novoId } from "../../core/src/ids.js";
import { normalizar } from "../../core/src/texto.js";
import { somenteDigitos, validarCPF, validarEmail } from "../../core/src/validacao.js";
import { diferencaDias, hoje } from "../../core/src/datas.js";
import { chaveCompetencia } from "./triagem.js";

const RETENCAO_PADRAO_MESES = 24;

function chaveCpf(candidato) {
  const cpf = somenteDigitos(candidato?.dados?.cpf);
  if (cpf.length !== 11) return null;
  return validarCPF(cpf).valido ? `cpf:${cpf}` : null;
}

function chaveEmail(candidato) {
  const email = String(candidato?.contato?.email ?? "").trim().toLowerCase();
  if (!email) return null;
  return validarEmail(email).valido ? `email:${email}` : null;
}

function chaveTelefone(candidato) {
  const digits = somenteDigitos(candidato?.contato?.telefone);
  if (digits.length < 10) return null;
  const semDDI = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return `tel:${semDDI}`;
}

/**
 * Ordem de deduplicação: CPF → e-mail → telefone.
 * Nunca sobrescreve: conflito marca `duplicadoDe` e a decisão fica com o
 * recrutador, porque fundir duas pessoas diferentes é irreversível e é dado
 * pessoal de terceiro.
 */
export function chavesDeDeduplicacao(candidato) {
  return [chaveCpf(candidato), chaveEmail(candidato), chaveTelefone(candidato)].filter(Boolean);
}

export function encontrarDuplicado(candidato, existentes = []) {
  const chaves = new Set(chavesDeDeduplicacao(candidato));
  if (chaves.size === 0) return null;

  for (const existente of existentes) {
    if (existente.id === candidato?.id) continue;
    for (const chave of chavesDeDeduplicacao(existente)) {
      if (chaves.has(chave)) {
        return { candidato: existente, chave };
      }
    }
  }
  return null;
}

export function criarCandidato(dados = {}, { agora } = {}) {
  const nome = String(dados.dados?.nome ?? "").trim();
  if (!nome) throw new Error("candidato exige dados.nome");

  const quando = agora ?? new Date().toISOString();
  const cpf = somenteDigitos(dados.dados?.cpf);
  if (cpf && !validarCPF(cpf).valido) {
    throw new Error(`CPF inválido: ${validarCPF(cpf).motivo}`);
  }
  const email = dados.contato?.email;
  if (email && !validarEmail(email).valido) {
    throw new Error(`e-mail inválido: ${validarEmail(email).motivo}`);
  }

  return {
    id: dados.id ?? novoId("CAND"),
    tenantId: dados.tenantId ?? null,
    contaUid: dados.contaUid ?? null,
    dados: {
      nome,
      nomeSocial: dados.dados?.nomeSocial ?? null,
      cpf: cpf || null,
      nascimento: dados.dados?.nascimento ?? null,
      genero: dados.dados?.genero ?? null,
      pcd: dados.dados?.pcd ?? false,
      tipoDeficiencia: dados.dados?.tipoDeficiencia ?? null,
    },
    contato: {
      email: email?.trim().toLowerCase() ?? null,
      telefone: dados.contato?.telefone ?? null,
      cidade: dados.contato?.cidade ?? null,
      uf: dados.contato?.uf ? normalizar(dados.contato.uf).toUpperCase() : null,
      links: dados.contato?.links ?? {},
    },
    formacao: dados.formacao ?? [],
    experiencias: dados.experiencias ?? [],
    competencias: dados.competencias ?? [],
    idiomas: dados.idiomas ?? [],
    pretensaoSalarial: dados.pretensaoSalarial ?? null,
    disponibilidadeInicio: dados.disponibilidadeInicio ?? null,
    curriculoTexto: dados.curriculoTexto ?? "",
    consentimento: dados.consentimento ?? null,
    origem: dados.origem ?? null,
    duplicadoDe: dados.duplicadoDe ?? null,
    criadoEm: quando,
    atualizadoEm: quando,
  };
}

/**
 * Base legal do tratamento de currículo é o consentimento (LGPD art. 7º, I).
 * Consentimento vencido não autoriza manter o currículo no banco de talentos.
 */
export function validarConsentimento(candidato, { referencia = hoje(), retencaoMeses = RETENCAO_PADRAO_MESES } = {}) {
  const consentimento = candidato?.consentimento;
  if (!consentimento?.aceito) {
    return { valido: false, motivo: "consentimento não registrado", situacao: "AUSENTE" };
  }
  if (!consentimento.em) {
    return { valido: false, motivo: "consentimento sem data", situacao: "SEM_DATA" };
  }

  const dias = diferencaDias(String(consentimento.em).slice(0, 10), String(referencia).slice(0, 10));
  const limiteDias = retencaoMeses * 30;
  if (dias > limiteDias) {
    return {
      valido: false,
      motivo: `consentimento com ${dias} dias; retenção configurada é de ${retencaoMeses} meses`,
      situacao: "VENCIDO",
      dias,
    };
  }
  return { valido: true, motivo: null, situacao: "VALIDO", dias };
}

function mesclarLista(base = [], novo = [], campos = []) {
  const mapa = new Map();
  for (const item of [...base, ...novo]) {
    if (!item) continue;
    // Chave composta: dois empregos com o mesmo cargo em empresas diferentes
    // são experiências distintas e não podem colapsar num registro só.
    const chave = campos.length
      ? campos.map((campo) => chaveCompetencia(item[campo] ?? "")).join("|")
      : JSON.stringify(item);
    mapa.set(chave, { ...(mapa.get(chave) ?? {}), ...item });
  }
  return [...mapa.values()];
}

/**
 * Revogação sempre vence concessão: permitir que um registro mais novo
 * ressuscitasse um consentimento revogado violaria o art. 8º, §5º da LGPD.
 */
function consentimentoMaisRestritivo(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;

  const revogadoA = a.aceito === false && !!a.revogadoEm;
  const revogadoB = b.aceito === false && !!b.revogadoEm;
  if (revogadoA && !revogadoB) return a;
  if (revogadoB && !revogadoA) return b;
  if (revogadoA && revogadoB) return String(a.revogadoEm) >= String(b.revogadoEm) ? a : b;

  if (a.aceito && !b.aceito) return b;
  if (b.aceito && !a.aceito) return a;
  return String(a.em ?? "") >= String(b.em ?? "") ? a : b;
}

/**
 * Campo a campo: o mais recente não-nulo vence. Um spread simples apagaria
 * dado do registro antigo, porque criarCandidato materializa `null` explícito
 * em todo campo ausente — e perder o CPF de alguém na fusão é irreversível.
 */
function mesclarObjeto(antigo, recente) {
  const resultado = { ...(antigo ?? {}) };
  for (const [chave, valor] of Object.entries(recente ?? {})) {
    if (valor !== null && valor !== undefined) resultado[chave] = valor;
  }
  return resultado;
}

/**
 * Funde dois registros da mesma pessoa. O `base` sobrevive; o `novo` é
 * absorvido e listado em `fundidoDe`.
 */
export function mesclarCandidatos(base, novo) {
  if (!base?.id) throw new Error("mesclarCandidatos exige um candidato base");
  if (!novo?.id) throw new Error("mesclarCandidatos exige um candidato para fundir");

  const maisRecente = String(novo.atualizadoEm ?? "") > String(base.atualizadoEm ?? "") ? novo : base;
  const outro = maisRecente === novo ? base : novo;

  const fundido = mesclarObjeto(outro, maisRecente);
  fundido.id = base.id;
  fundido.tenantId = base.tenantId ?? outro.tenantId ?? null;
  fundido.consentimento = consentimentoMaisRestritivo(maisRecente.consentimento, outro.consentimento);
  fundido.dados = mesclarObjeto(outro.dados, maisRecente.dados);
  fundido.contato = {
    ...mesclarObjeto(outro.contato, maisRecente.contato),
    links: { ...(outro.contato?.links ?? {}), ...(maisRecente.contato?.links ?? {}) },
  };
  fundido.formacao = mesclarLista(outro.formacao, maisRecente.formacao, ["curso", "instituicao"]);
  fundido.experiencias = mesclarLista(outro.experiencias, maisRecente.experiencias, ["cargo", "empresa", "inicio"]);
  fundido.competencias = mesclarLista(outro.competencias, maisRecente.competencias, ["nome"]);
  fundido.idiomas = mesclarLista(outro.idiomas, maisRecente.idiomas, ["codigo"]);
  fundido.fundidoDe = [...(base.fundidoDe ?? []), novo.id];
  return fundido;
}

/**
 * Direito de eliminação (LGPD art. 18, VI). Anonimiza em vez de apagar o
 * documento: preserva a trilha de auditoria que um processo trabalhista exige,
 * sem manter dado pessoal identificável.
 */
export function anonimizarCandidato(candidato, { agora, motivo = "pedido do titular" } = {}) {
  const quando = agora ?? new Date().toISOString();
  return {
    ...candidato,
    dados: {
      nome: "TITULAR_REMOVIDO",
      nomeSocial: null,
      cpf: null,
      nascimento: null,
      genero: null,
      pcd: false,
      tipoDeficiencia: null,
    },
    contato: { email: null, telefone: null, cidade: null, uf: null, links: {} },
    curriculoTexto: "",
    consentimento: {
      ...(candidato.consentimento ?? {}),
      aceito: false,
      revogadoEm: quando,
      motivoRevogacao: motivo,
    },
    anonimizadoEm: quando,
    atualizadoEm: quando,
  };
}

export function buscarCandidatos(candidatos = [], filtros = {}) {
  const texto = filtros.texto ? normalizar(filtros.texto).toLowerCase().trim() : null;
  const competencias = (filtros.competencias ?? []).map(chaveCompetencia);
  const cidade = filtros.cidade ? normalizar(filtros.cidade).toLowerCase().trim() : null;
  const uf = filtros.uf ? normalizar(filtros.uf).toUpperCase() : null;

  return candidatos.filter((c) => {
    if (c.anonimizadoEm) return false;

    if (cidade && normalizar(c.contato?.cidade ?? "").toLowerCase() !== cidade) return false;
    if (uf && (c.contato?.uf ?? "") !== uf) return false;

    if (competencias.length) {
      const tem = new Set((c.competencias ?? []).map((x) => chaveCompetencia(x.nome)));
      if (!competencias.every((k) => tem.has(k))) return false;
    }

    if (texto) {
      const alvo = normalizar(
        [
          c.dados?.nome,
          c.curriculoTexto,
          ...(c.experiencias ?? []).flatMap((e) => [e.cargo, e.empresa, e.descricao]),
          ...(c.formacao ?? []).flatMap((f) => [f.curso, f.instituicao]),
          ...(c.competencias ?? []).map((x) => x.nome),
        ]
          .filter(Boolean)
          .join(" ")
      )
        .toLowerCase();
      if (!alvo.includes(texto)) return false;
    }

    return true;
  });
}
