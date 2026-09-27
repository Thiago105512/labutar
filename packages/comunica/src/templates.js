import { novoId } from "../../core/src/ids.js";
import {
  capitalizar,
  truncar,
  mascararCPF,
  mascararEmail,
  mascararTelefone,
  mascararNome,
} from "../../core/src/texto.js";
import { formatarDataBR } from "../../core/src/datas.js";
import { formatarBRL, paraCentavos } from "../../core/src/dinheiro.js";
import {
  somenteDigitos,
  validarCEP,
  validarCPF,
  validarDataISO,
  validarEmail,
  validarTelefone,
} from "../../core/src/validacao.js";
import { CANAIS, limites, validarDestino } from "./canais.js";
import { CATEGORIA_TEMPLATE } from "./constantes.js";

const VARIAVEL_RE = /\{\{([^{}]*)\}\}/g;
const RESIDUO_RE = /\{\{[^{}]*\}\}/;

function ehVazio(valor) {
  return valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "");
}

/** O core não expõe mascararCEP, e o CEP revela o endereço aproximado do candidato. */
function mascararCEP(valor) {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 8) return "***";
  return `*****-${digitos.slice(5)}`;
}

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function filtroMoeda(valor) {
  if (typeof valor === "number") {
    exigir(Number.isFinite(valor), `Valor monetário não numérico: ${valor}`);
    return formatarBRL(Math.round(valor));
  }
  const texto = String(valor ?? "").trim();
  if (/^-?\d+$/.test(texto)) return formatarBRL(Number(texto));
  const centavos = paraCentavos(texto);
  exigir(centavos !== 0 || /^[R$\s]*0([.,]0+)?$/.test(texto), `Valor monetário inválido: "${texto}"`);
  return formatarBRL(centavos);
}

function filtroData(valor) {
  const texto = String(valor ?? "").trim().slice(0, 10);
  const validacao = validarDataISO(texto);
  exigir(validacao.valido, `Data inválida para o filtro dataBR: "${valor}" (${validacao.motivo})`);
  return formatarDataBR(texto);
}

/**
 * Filtros disponíveis em `{{variavel|filtro}}` e `{{a|f1|f2}}`.
 * Os de mascaramento existem por LGPD: mural e telas compartilhadas não devem
 * expor documento inteiro. Todos falham alto (erro em `erros[]`) se o valor não
 * presta — formatar lixo produziria uma mensagem formalmente impecável e falsa.
 */
export const FILTROS = Object.freeze({
  maiusculas: (valor) => String(valor ?? "").toUpperCase(),
  minusculas: (valor) => String(valor ?? "").toLowerCase(),
  capitalizar: (valor) => capitalizar(valor),
  dataBR: filtroData,
  moeda: filtroMoeda,
  cpf: (valor) => {
    const validacao = validarCPF(valor);
    exigir(validacao.valido, `CPF inválido para o filtro cpf (${validacao.motivo})`);
    return mascararCPF(valor);
  },
  telefone: (valor) => {
    const validacao = validarTelefone(valor);
    exigir(validacao.valido, `Telefone inválido para o filtro telefone (${validacao.motivo})`);
    return mascararTelefone(valor);
  },
  cep: (valor) => {
    const validacao = validarCEP(valor);
    exigir(validacao.valido, `CEP inválido para o filtro cep (${validacao.motivo})`);
    return mascararCEP(valor);
  },
  email: (valor) => {
    const validacao = validarEmail(valor);
    exigir(validacao.valido, `E-mail inválido para o filtro email (${validacao.motivo})`);
    return mascararEmail(valor);
  },
  nome: (valor) => mascararNome(valor),
  truncar: (valor, argumento) => {
    const [bruto, ...resto] = String(argumento ?? "").split(":");
    const maximo = Number(bruto);
    exigir(Number.isInteger(maximo) && maximo > 0, `truncar espera um inteiro positivo (recebido: "${argumento}")`);
    const sufixo = resto.length ? resto.join(":") : "…";
    exigir(maximo > sufixo.length, `truncar:${maximo} é menor que o sufixo "${sufixo}"`);
    return truncar(valor, maximo, sufixo);
  },
  padrao: (valor, argumento) => (ehVazio(valor) ? argumento ?? "" : valor),
});

/** Nomes de variável de um texto qualquer, sem filtros e sem repetição. */
export function listarVariaveis(texto) {
  const nomes = [];
  for (const ocorrencia of String(texto ?? "").matchAll(VARIAVEL_RE)) {
    const nome = ocorrencia[1].split("|")[0].trim();
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

/** "{{vaga.titulo|maiusculas}}" → { nome: "vaga.titulo", filtros: [{ nome: "maiusculas", argumento: null }] } */
export function parsearExpressao(conteudo) {
  const partes = String(conteudo ?? "").split("|");
  return {
    nome: partes[0].trim(),
    filtros: partes.slice(1).map((bruto) => {
      const indice = bruto.indexOf(":");
      return indice === -1
        ? { nome: bruto.trim(), argumento: null }
        : { nome: bruto.slice(0, indice).trim(), argumento: bruto.slice(indice + 1) };
    }),
  };
}

function resolverCaminho(contexto, caminho) {
  if (!caminho.includes(".")) return contexto?.[caminho];
  return caminho.split(".").reduce(
    (acumulado, parte) => (acumulado === null || acumulado === undefined ? undefined : acumulado[parte]),
    contexto ?? {}
  );
}

function normalizarVariaveis(variaveis = []) {
  const lista = Array.isArray(variaveis) ? variaveis : [];
  return lista.map((bruto) =>
    typeof bruto === "string"
      ? { nome: bruto.trim(), descricao: null, exemplo: null, obrigatoria: false }
      : {
          nome: String(bruto?.nome ?? "").trim(),
          descricao: bruto?.descricao ?? null,
          exemplo: bruto?.exemplo ?? null,
          obrigatoria: bruto?.obrigatoria === true,
        }
  );
}

/**
 * Cria (ou revalida) um template. Incoerências entre o texto e as variáveis
 * declaradas viram `problemas`, não exceção: o recrutador precisa conseguir
 * salvar um rascunho e corrigir depois.
 */
export function criarTemplate({
  id = null,
  nome = "",
  canal = null,
  assunto = "",
  corpo = "",
  variaveis = [],
  ativo = true,
  categoria = null,
  descricao = null,
} = {}) {
  const problemas = [];
  const declaradas = normalizarVariaveis(variaveis);
  const usadas = [...new Set([...listarVariaveis(assunto), ...listarVariaveis(corpo)])];
  const nomesDeclarados = new Set();

  for (const declarada of declaradas) {
    if (!declarada.nome) {
      problemas.push({ tipo: "VARIAVEL_SEM_NOME", variavel: null, mensagem: "Toda variável declarada precisa de um nome." });
      continue;
    }
    if (nomesDeclarados.has(declarada.nome)) {
      problemas.push({
        tipo: "VARIAVEL_DUPLICADA",
        variavel: declarada.nome,
        mensagem: `A variável "${declarada.nome}" está declarada mais de uma vez.`,
      });
    }
    nomesDeclarados.add(declarada.nome);
  }

  for (const usada of usadas) {
    if (!nomesDeclarados.has(usada)) {
      problemas.push({
        tipo: "VARIAVEL_NAO_DECLARADA",
        variavel: usada,
        mensagem: `O texto usa {{${usada}}}, mas essa variável não está declarada.`,
      });
    }
  }
  for (const nome of nomesDeclarados) {
    if (!usadas.includes(nome)) {
      problemas.push({
        tipo: "VARIAVEL_NAO_USADA",
        variavel: nome,
        mensagem: `A variável "${nome}" está declarada, mas não aparece em assunto nem em corpo.`,
      });
    }
  }

  if (!String(nome ?? "").trim()) {
    problemas.push({ tipo: "NOME_OBRIGATORIO", variavel: null, mensagem: "O template precisa de um nome." });
  }
  if (!Object.values(CANAIS).includes(String(canal ?? "").toUpperCase())) {
    problemas.push({
      tipo: "CANAL_INVALIDO",
      variavel: null,
      mensagem: `Canal "${canal}" não existe. Use um de: ${Object.values(CANAIS).join(", ")}.`,
    });
  }
  if (!String(corpo ?? "").trim()) {
    problemas.push({ tipo: "CORPO_OBRIGATORIO", variavel: null, mensagem: "O corpo da mensagem não pode ficar vazio." });
  }

  return {
    id: id ?? novoId("TPL"),
    nome: String(nome ?? ""),
    canal: String(canal ?? "").toUpperCase() || null,
    assunto: String(assunto ?? ""),
    corpo: String(corpo ?? ""),
    variaveis: declaradas,
    usadas,
    categoria: categoria ?? null,
    descricao: descricao ?? null,
    ativo: ativo === true,
    problemas,
    valido: problemas.length === 0,
  };
}

/**
 * Renderiza assunto e corpo. Variável ausente sem filtro `padrao` é `faltante`:
 * sai como string vazia e derruba `ok` para false — nunca vaza `{{variavel}}`
 * para o candidato.
 */
export function renderizar(template, contexto = {}) {
  const faltantes = [];
  const erros = [];
  const usadas = new Set();

  const substituir = (bruto, campo) =>
    String(bruto ?? "").replace(VARIAVEL_RE, (trecho, expressao) => {
      const { nome, filtros } = parsearExpressao(expressao);
      if (!nome) {
        erros.push({ campo, variavel: null, filtro: null, mensagem: `Expressão inválida no ${campo}: ${trecho}` });
        return "";
      }
      usadas.add(nome);

      let valor = resolverCaminho(contexto, nome);
      if (Array.isArray(valor)) valor = valor.join(", ");
      else if (valor instanceof Date) valor = valor.toISOString();
      else if (!ehVazio(valor) && typeof valor === "object") {
        erros.push({
          campo,
          variavel: nome,
          filtro: null,
          mensagem: `A variável "${nome}" recebeu um objeto; o contexto precisa entregar texto, número ou data.`,
        });
        return "";
      }

      if (ehVazio(valor)) {
        const padrao = filtros.find((f) => f.nome === "padrao");
        if (!padrao) {
          if (!faltantes.includes(nome)) faltantes.push(nome);
          return "";
        }
        valor = padrao.argumento ?? "";
      }

      for (const filtro of filtros) {
        const funcao = FILTROS[filtro.nome];
        if (!funcao) {
          erros.push({
            campo,
            variavel: nome,
            filtro: filtro.nome,
            mensagem: `Filtro desconhecido "${filtro.nome}" em {{${nome}}}. Filtros disponíveis: ${Object.keys(FILTROS).join(", ")}.`,
          });
          return "";
        }
        try {
          valor = funcao(valor, filtro.argumento);
        } catch (erro) {
          erros.push({ campo, variavel: nome, filtro: filtro.nome, mensagem: erro.message });
          return "";
        }
      }
      return String(valor ?? "");
    });

  const assunto = substituir(template?.assunto, "assunto");
  const corpo = substituir(template?.corpo, "corpo");

  // Guarda final: se algo sobreviveu à substituição, a mensagem não pode sair.
  for (const [campo, texto] of [
    ["assunto", assunto],
    ["corpo", corpo],
  ]) {
    const residuo = texto.match(RESIDUO_RE);
    if (residuo) {
      erros.push({
        campo,
        variavel: null,
        filtro: null,
        mensagem: `Trecho não renderizado no ${campo}: ${residuo[0]}`,
      });
    }
  }

  return { ok: faltantes.length === 0 && erros.length === 0, assunto, corpo, faltantes, erros, usadas: [...usadas] };
}

/**
 * Monta o descritor de envio — `{ canal, destino, assunto, corpo, anexos,
 * metadata }`. Este pacote NÃO entrega nada: o servidor pega esse objeto e fala
 * com o provedor. Trocar de provedor não toca regra de negócio.
 */
export function montarMensagem(
  template,
  { contexto = {}, destino = null, anexos = [], metadata = {}, urgencia = null } = {}
) {
  const resultado = renderizar(template, contexto);
  const limite = limites(template?.canal);
  const validacao = validarDestino(template?.canal, destino);
  const erros = [...resultado.erros];

  if (!validacao.valido) {
    erros.push({ campo: "destino", variavel: null, filtro: null, mensagem: validacao.motivo });
  }
  if (limite && String(resultado.corpo).length > limite.corpoMaximo) {
    erros.push({
      campo: "corpo",
      variavel: null,
      filtro: null,
      mensagem: `Corpo com ${resultado.corpo.length} caracteres; o limite de ${template.canal} é ${limite.corpoMaximo}.`,
    });
  }
  const listaAnexos = Array.isArray(anexos) ? anexos : [];
  if (listaAnexos.length && !limite?.suportaAnexo) {
    erros.push({
      campo: "anexos",
      variavel: null,
      filtro: null,
      mensagem: `${template?.canal} não suporta anexo.`,
    });
  }

  const ok = resultado.ok && validacao.valido && erros.length === 0;
  return {
    ok,
    mensagem: {
      canal: template?.canal ?? null,
      destino: validacao.normalizado ?? destino,
      assunto: limite?.suportaAssunto ? resultado.assunto || null : null,
      corpo: resultado.corpo,
      anexos: limite?.suportaAnexo ? listaAnexos : [],
      metadata: {
        ...metadata,
        templateId: template?.id ?? null,
        urgencia,
        variaveisFaltantes: resultado.faltantes,
      },
    },
    faltantes: resultado.faltantes,
    erros,
  };
}

export const TEMPLATES_PADRAO = Object.freeze([
  Object.freeze({
    id: "candidatura-recebida",
    nome: "Candidatura recebida",
    canal: CANAIS.EMAIL,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    descricao: "Confirmação imediata de que a candidatura entrou no processo.",
    assunto: "Recebemos sua candidatura para {{tituloVaga}} — {{nomeEmpresa}}",
    corpo: `Olá, {{nomeCandidato}}!

Recebemos sua candidatura para a vaga de {{tituloVaga}} na {{nomeEmpresa}} e ela já está com o nosso time de recrutamento.

O que acontece agora:
1. Analisamos seu perfil com atenção — em média, {{prazoTriagemDias|padrao:5}} dias úteis.
2. Você recebe um retorno por aqui, qualquer que seja o resultado.
3. Se o seu perfil avançar, entramos em contato para marcar uma conversa.

Precisa atualizar alguma informação do currículo? Acesse o portal do candidato ou responda esta mensagem.

Obrigado pelo interesse em fazer parte do nosso time.

{{nomeRecrutador|padrao:Time de Recrutamento}}
{{nomeEmpresa}}`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", descricao: "Nome ou nome social do candidato", exemplo: "Maria" }),
      Object.freeze({ nome: "tituloVaga", descricao: "Título da vaga", exemplo: "Analista de Departamento Pessoal" }),
      Object.freeze({ nome: "nomeEmpresa", descricao: "Razão social ou nome fantasia", exemplo: "Labutar Consultoria" }),
      Object.freeze({ nome: "prazoTriagemDias", descricao: "Prazo médio de triagem em dias úteis", exemplo: "7" }),
      Object.freeze({ nome: "nomeRecrutador", descricao: "Quem assina a mensagem", exemplo: "Ana Ribeiro" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "triagem-aprovada",
    nome: "Triagem aprovada",
    canal: CANAIS.EMAIL,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    descricao: "Avisa que o candidato avançou de etapa e o que vem a seguir.",
    assunto: "Seu perfil avançou no processo da {{nomeEmpresa}}",
    corpo: `Olá, {{nomeCandidato}}!

Boa notícia: seu perfil foi aprovado na etapa de {{nomeEtapa|padrao:triagem}} para a vaga de {{tituloVaga}}.

A próxima etapa é {{proximaEtapa|padrao:uma conversa com o time de recrutamento}}. Você recebe o convite com data e horário em até {{prazoContatoDias|padrao:3}} dias úteis, no e-mail e no telefone que informou na candidatura.

Até lá, vale manter seus dados atualizados no portal do candidato — é por lá que formalizamos qualquer proposta.

Qualquer dúvida, é só responder esta mensagem.

{{nomeRecrutador|padrao:Time de Recrutamento}}
{{nomeEmpresa}}`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria" }),
      Object.freeze({ nome: "nomeEmpresa", exemplo: "Labutar Consultoria" }),
      Object.freeze({ nome: "nomeEtapa", exemplo: "análise de currículo" }),
      Object.freeze({ nome: "tituloVaga", exemplo: "Analista de Departamento Pessoal" }),
      Object.freeze({ nome: "proximaEtapa", exemplo: "entrevista com o gestor da área" }),
      Object.freeze({ nome: "prazoContatoDias", exemplo: "2" }),
      Object.freeze({ nome: "nomeRecrutador", exemplo: "Ana Ribeiro" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "convite-entrevista",
    nome: "Convite para entrevista",
    canal: CANAIS.EMAIL,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    descricao: "Convite com data, horário, formato e pedido de confirmação.",
    assunto: "Convite para entrevista: {{tituloVaga}} na {{nomeEmpresa}}",
    corpo: `Olá, {{nomeCandidato}}!

Gostaríamos de convidá-lo para uma entrevista referente à vaga de {{tituloVaga}}.

Detalhes:
- Data: {{dataEntrevista|dataBR}}, às {{horaEntrevista}}
- Duração prevista: {{duracaoMinutos|padrao:45}} minutos
- Formato: {{formatoEntrevista|padrao:videochamada}}
- Local ou link: {{localOuLink|padrao:o link será enviado 30 minutos antes do horário}}
- Com quem: {{nomeEntrevistador|padrao:time de recrutamento}}

Confirme sua presença respondendo esta mensagem até {{prazoConfirmacao|dataBR}}. Se o horário não funcionar, proponha duas alternativas que a gente remarca sem problema.

Para o dia: escolha um lugar tranquilo, teste câmera e microfone com antecedência e tenha em mãos um resumo da sua trajetória. Nós vamos apresentar a vaga com o mesmo cuidado.

{{nomeRecrutador|padrao:Time de Recrutamento}}
{{nomeEmpresa}}`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria" }),
      Object.freeze({ nome: "tituloVaga", exemplo: "Analista de Departamento Pessoal" }),
      Object.freeze({ nome: "nomeEmpresa", exemplo: "Labutar Consultoria" }),
      Object.freeze({ nome: "dataEntrevista", descricao: "Data em AAAA-MM-DD", exemplo: "2026-10-05" }),
      Object.freeze({ nome: "horaEntrevista", exemplo: "14:00" }),
      Object.freeze({ nome: "duracaoMinutos", exemplo: "45" }),
      Object.freeze({ nome: "formatoEntrevista", exemplo: "videochamada" }),
      Object.freeze({ nome: "localOuLink", exemplo: "https://meet.labutar.com.br/ent-8f3k" }),
      Object.freeze({ nome: "nomeEntrevistador", exemplo: "Ana Ribeiro (RH) e Carlos Lima (gestor)" }),
      Object.freeze({ nome: "prazoConfirmacao", descricao: "Data limite para confirmar, em AAAA-MM-DD", exemplo: "2026-10-02" }),
      Object.freeze({ nome: "nomeRecrutador", exemplo: "Ana Ribeiro" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "lembrete-entrevista-24h",
    nome: "Lembrete de entrevista (24h)",
    canal: CANAIS.WHATSAPP,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    descricao: "Lembrete curto um dia antes, disparado por lembretes.js.",
    assunto: "",
    corpo: `Olá, {{nomeCandidato}}! Sua entrevista para {{tituloVaga}} na {{nomeEmpresa}} é amanhã, {{dataEntrevista|dataBR}} às {{horaEntrevista}}.

{{localOuLink|padrao:O link será enviado 30 minutos antes do horário.}}

Precisa remarcar? Avise por aqui o quanto antes para não perder a vaga na agenda. Até lá!`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria" }),
      Object.freeze({ nome: "tituloVaga", exemplo: "Analista de DP" }),
      Object.freeze({ nome: "nomeEmpresa", exemplo: "Labutar" }),
      Object.freeze({ nome: "dataEntrevista", exemplo: "2026-10-05" }),
      Object.freeze({ nome: "horaEntrevista", exemplo: "14:00" }),
      Object.freeze({ nome: "localOuLink", exemplo: "Link: https://meet.labutar.com.br/ent-8f3k" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "lembrete-entrevista-1h",
    nome: "Lembrete de entrevista (1h)",
    canal: CANAIS.WHATSAPP,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    descricao: "Última chamada, uma hora antes do horário marcado.",
    assunto: "",
    corpo: `{{nomeCandidato}}, sua entrevista começa em 1 hora ({{horaEntrevista}}).

{{localOuLink|padrao:O link está no e-mail de convite.}}

Qualquer imprevisto, chame por aqui.`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria" }),
      Object.freeze({ nome: "horaEntrevista", exemplo: "14:00" }),
      Object.freeze({ nome: "localOuLink", exemplo: "Link: https://meet.labutar.com.br/ent-8f3k" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "pedido-feedback-gestor",
    nome: "Pedido de feedback ao gestor",
    canal: CANAIS.MURAL,
    categoria: CATEGORIA_TEMPLATE.INTERNO,
    descricao: "Cobra o parecer do gestor que ainda não registrou o scorecard.",
    assunto: "Parecer pendente: {{nomeCandidato}} — {{tituloVaga}}",
    corpo: `Olá, {{nomeGestor}}.

{{nomeCandidato}} participou da etapa "{{nomeEtapa}}" de {{tituloVaga}} em {{dataEntrevista|dataBR}} e o seu parecer ainda não foi registrado.

O candidato está aguardando retorno desde então, e a decisão da próxima etapa depende do seu scorecard. Prazo combinado: {{prazoFeedbackDias|padrao:2}} dias úteis (até {{prazoFeedback|dataBR}}).

Caminho: painel da vaga > etapa {{nomeEtapa}} > candidato > registrar parecer.

Se estiver sem tempo de preencher, responda este aviso com um resumo de dois parágrafos que o RH registra por você — o que não pode é a vaga parar.`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeGestor", exemplo: "Carlos Lima" }),
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria Souza" }),
      Object.freeze({ nome: "tituloVaga", exemplo: "Analista de Departamento Pessoal" }),
      Object.freeze({ nome: "nomeEtapa", exemplo: "Entrevista técnica" }),
      Object.freeze({ nome: "dataEntrevista", exemplo: "2026-09-24" }),
      Object.freeze({ nome: "prazoFeedbackDias", exemplo: "2" }),
      Object.freeze({ nome: "prazoFeedback", exemplo: "2026-09-29" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "proposta-enviada",
    nome: "Proposta enviada",
    canal: CANAIS.EMAIL,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    descricao: "Formaliza a proposta e fixa prazo de resposta.",
    assunto: "Proposta para {{tituloVaga}} — {{nomeEmpresa}}",
    corpo: `Olá, {{nomeCandidato}}!

É com prazer que formalizamos a proposta para você assumir a posição de {{tituloVaga}} na {{nomeEmpresa}}.

Resumo:
- Salário: {{salario|moeda}} {{periodicidadeSalario|padrao:por mês}}
- Regime: {{regimeContrato|padrao:CLT}}
- Jornada: {{jornada|padrao:a combinar na integração}}
- Início previsto: {{dataInicio|dataBR}}
- Benefícios: {{beneficios|padrao:conforme documento em anexo}}

A proposta completa está em anexo, com valores, prazos e condições. Pedimos sua resposta até {{prazoAceite|dataBR}}.

Se precisar de mais prazo ou quiser esclarecer qualquer ponto antes de decidir, responda esta mensagem: negociar com transparência faz parte de como contratamos.`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria" }),
      Object.freeze({ nome: "tituloVaga", exemplo: "Analista de Departamento Pessoal" }),
      Object.freeze({ nome: "nomeEmpresa", exemplo: "Labutar Consultoria" }),
      Object.freeze({ nome: "salario", descricao: "Salário em centavos", exemplo: 850000 }),
      Object.freeze({ nome: "periodicidadeSalario", exemplo: "por mês" }),
      Object.freeze({ nome: "regimeContrato", exemplo: "CLT" }),
      Object.freeze({ nome: "jornada", exemplo: "44h semanais, segunda a sexta" }),
      Object.freeze({ nome: "dataInicio", exemplo: "2026-11-03" }),
      Object.freeze({ nome: "beneficios", exemplo: "vale-refeição, plano de saúde e PLR" }),
      Object.freeze({ nome: "prazoAceite", exemplo: "2026-10-15" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "reprovacao-empatica",
    nome: "Reprovação com empatia",
    canal: CANAIS.EMAIL,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    // Regra de compliance: comunicação de reprovação não revela pontuação,
    // critério de corte nem posição do candidato em relação aos demais.
    descricao: "Retorno negativo com respeito, sem expor avaliação interna.",
    assunto: "Retorno sobre o processo seletivo da {{nomeEmpresa}}",
    corpo: `Olá, {{nomeCandidato}}.

Obrigado por dedicar seu tempo ao processo seletivo para {{tituloVaga}} na {{nomeEmpresa}}.

Depois de analisar com cuidado, decidimos seguir com outra pessoa nesta contratação. Sabemos que essa resposta frustra, e queremos ser honestos: ela diz respeito ao que esta vaga pede neste momento, não ao seu valor profissional.

O que continua valendo para você:
- Seu currículo permanece no nosso banco de talentos por {{mesesBancoTalentos|padrao:12}} meses e pode ser considerado em vagas parecidas.
- Se quiser uma devolutiva sobre a sua participação, responda esta mensagem: o time de recrutamento responde em até {{prazoFeedbackDias|padrao:5}} dias úteis.

Desejamos sucesso na sua caminhada e esperamos reencontrá-lo em uma próxima oportunidade.

{{nomeRecrutador|padrao:Time de Recrutamento}}
{{nomeEmpresa}}`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria" }),
      Object.freeze({ nome: "tituloVaga", exemplo: "Analista de Departamento Pessoal" }),
      Object.freeze({ nome: "nomeEmpresa", exemplo: "Labutar Consultoria" }),
      Object.freeze({ nome: "mesesBancoTalentos", exemplo: "12" }),
      Object.freeze({ nome: "prazoFeedbackDias", exemplo: "5" }),
      Object.freeze({ nome: "nomeRecrutador", exemplo: "Ana Ribeiro" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "boas-vindas-admissao",
    nome: "Boas-vindas na admissão",
    canal: CANAIS.EMAIL,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    descricao: "Primeiro dia: onde ir, que horas, o que levar e com quem falar.",
    assunto: "Bem-vindo à {{nomeEmpresa}}, {{nomeCandidato}}!",
    corpo: `Olá, {{nomeCandidato}}!

Seu processo de admissão foi concluído e estamos esperando você no dia {{dataInicio|dataBR}}, às {{horarioChegada|padrao:09:00}}.

Seu primeiro dia:
- Local: {{localTrabalho|padrao:o endereço será confirmado pelo seu gestor}}
- Procure por: {{nomeResponsavel|padrao:recepção}}
- Leve: {{documentosLevar|padrao:documento oficial com foto e comprovante de residência}}
- Vestimenta: {{vestimenta|padrao:como você se sentir confortável}}

A integração começa com uma apresentação do time e a configuração dos seus acessos. Seu gestor, {{nomeGestor|padrao:a liderança da área}}, já está avisado e vai conduzir o seu plano dos primeiros 30 dias.

Qualquer dúvida até lá, responda esta mensagem ou fale com a gente pelo WhatsApp.

{{nomeRecrutador|padrao:Time de Recrutamento}}
{{nomeEmpresa}}`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria" }),
      Object.freeze({ nome: "nomeEmpresa", exemplo: "Labutar Consultoria" }),
      Object.freeze({ nome: "dataInicio", exemplo: "2026-11-03" }),
      Object.freeze({ nome: "horarioChegada", exemplo: "08:30" }),
      Object.freeze({ nome: "localTrabalho", exemplo: "Av. Paulista, 1000 — 12º andar, São Paulo/SP" }),
      Object.freeze({ nome: "nomeResponsavel", exemplo: "Ana Ribeiro (RH)" }),
      Object.freeze({ nome: "documentosLevar", exemplo: "RG, CPF, comprovante de residência e cartão do banco" }),
      Object.freeze({ nome: "vestimenta", exemplo: "informal" }),
      Object.freeze({ nome: "nomeGestor", exemplo: "Carlos Lima" }),
      Object.freeze({ nome: "nomeRecrutador", exemplo: "Ana Ribeiro" }),
    ]),
    ativo: true,
  }),
  Object.freeze({
    id: "documento-admissao-pendente",
    nome: "Documento de admissão pendente",
    canal: CANAIS.WHATSAPP,
    categoria: CATEGORIA_TEMPLATE.CANDIDATO,
    descricao: "Cobrança amigável de documentos que travam a admissão.",
    assunto: "",
    corpo: `Olá, {{nomeCandidato}}! Aqui é {{nomeRecrutador|padrao:o time de recrutamento}} da {{nomeEmpresa}}.

Para fechar sua admissão em {{dataInicio|dataBR}}, ainda precisamos de: {{documentosPendentes}}.

Pode enviar por aqui mesmo, em foto nítida e sem cortes, ou pelo portal do candidato. Se algum documento ainda estiver sendo emitido, me avise que combinamos um novo prazo — só não deixe para a véspera, porque sem ele o sistema trava o seu registro.`,
    variaveis: Object.freeze([
      Object.freeze({ nome: "nomeCandidato", exemplo: "Maria" }),
      Object.freeze({ nome: "nomeRecrutador", exemplo: "Ana" }),
      Object.freeze({ nome: "nomeEmpresa", exemplo: "Labutar" }),
      Object.freeze({ nome: "dataInicio", exemplo: "2026-11-03" }),
      Object.freeze({ nome: "documentosPendentes", exemplo: "comprovante de residência e foto do RG" }),
    ]),
    ativo: true,
  }),
]);
