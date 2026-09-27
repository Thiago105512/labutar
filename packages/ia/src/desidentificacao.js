import { normalizar, semEspacos } from "../../core/src/texto.js";
import { validarCPF, validarCNPJ, validarPIS, validarEmail, validarTelefone, somenteDigitos } from "../../core/src/validacao.js";
import { diferencaDias } from "../../core/src/datas.js";
import { formatarBRL } from "../../core/src/dinheiro.js";
import { NOMES_COMUNS_SET, PLACEHOLDER, TIPO_VIOLACAO } from "./constantes.js";

export class ErroDadoPessoal extends Error {
  constructor(violacoes) {
    const resumo = violacoes
      .slice(0, 6)
      .map((v) => `${v.tipo} em ${v.caminho}`)
      .join("; ");
    super(
      `payload contém dado pessoal e não pode ser enviado a modelo externo (${violacoes.length} violação(ões)): ${resumo}. ` +
        "Endpoint do Bailian fica em Singapura; enviar identificador configura transferência internacional (LGPD art. 33)."
    );
    this.name = "ErroDadoPessoal";
    this.violacoes = violacoes;
  }
}

/**
 * Ordem importa: CPF antes de PIS porque os dois casam com 11 dígitos seguidos,
 * e reportar os dois para o mesmo trecho só faz ruído.
 */
const DETECTORES = [
  {
    tipo: TIPO_VIOLACAO.EMAIL,
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    confirmar: (trecho) => validarEmail(trecho).valido,
  },
  {
    tipo: TIPO_VIOLACAO.CPF,
    regex: /\b\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{2}\b/g,
    confirmar: (trecho) => validarCPF(trecho).valido,
  },
  {
    tipo: TIPO_VIOLACAO.CNPJ,
    regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
    confirmar: (trecho) => validarCNPJ(trecho).valido,
  },
  {
    tipo: TIPO_VIOLACAO.PIS,
    regex: /\b\d{3}\.?\d{5}\.?\d{2}-?\d{1}\b/g,
    confirmar: (trecho) => validarPIS(trecho).valido,
  },
  {
    tipo: TIPO_VIOLACAO.TELEFONE,
    regex: /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9\d{4}[\s.-]?\d{4}\b/g,
    confirmar: (trecho) => validarTelefone(trecho).valido,
  },
  {
    tipo: TIPO_VIOLACAO.CEP,
    regex: /\b\d{5}-\d{3}\b/g,
  },
  {
    tipo: TIPO_VIOLACAO.URL_PERFIL,
    regex: /(?:https?:\/\/)?(?:[\w-]+\.)*(?:linkedin|github|gitlab|behance|lattes|instagram|facebook)\.com(?:\.br)?\/[^\s)"'<>]*/gi,
  },
  {
    tipo: TIPO_VIOLACAO.DATA_NASCIMENTO,
    regex: /(?:nascimento|nascido|nascida|data\s+de\s+nasc\.?)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/gi,
  },
];

function sobreposto(a, b) {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/**
 * Detecta identificador em texto livre. Falso positivo aqui é aceitável e até
 * desejável — o custo é reescrever um trecho; o de um falso negativo é enviar
 * CPF de candidato para outro país.
 */
export function detectarPessoais(texto) {
  const valor = String(texto ?? "");
  if (!valor) return [];

  const brutos = [];
  for (const detector of DETECTORES) {
    detector.regex.lastIndex = 0;
    let m;
    while ((m = detector.regex.exec(valor)) !== null) {
      const trecho = m[0];
      if (detector.confirmar && !detector.confirmar(trecho)) continue;
      brutos.push({ tipo: detector.tipo, trecho, inicio: m.index, fim: m.index + trecho.length });
      if (m.index === detector.regex.lastIndex) detector.regex.lastIndex += 1;
    }
  }

  // nome próprio: só palavra capitalizada e na lista. Exigir maiúscula evita
  // marcar "rosa" (cor) e "vera" (advérbio) — o falso positivo tornaria a
  // porta inutilizável sem reduzir o risco real.
  const regexNome = /\b([A-ZÀ-Ú][a-zà-ú]{1,20})\b/g;
  let n;
  while ((n = regexNome.exec(valor)) !== null) {
    const palavra = n[1];
    if (NOMES_COMUNS_SET.has(normalizar(palavra).toLowerCase())) {
      brutos.push({
        tipo: TIPO_VIOLACAO.NOME_PROPRIO,
        trecho: palavra,
        inicio: n.index,
        fim: n.index + palavra.length,
      });
    }
  }

  const aceitos = [];
  for (const candidato of brutos.sort((a, b) => a.inicio - b.inicio || b.fim - a.fim)) {
    if (aceitos.some((a) => sobreposto(a, candidato))) continue;
    aceitos.push(candidato);
  }
  return aceitos.sort((a, b) => a.inicio - b.inicio);
}

/**
 * Substitui todo identificador encontrado por marcador neutro.
 *
 * `sensiveis` cobre o que nenhum regex pega: o nome da empresa escrito pelo
 * próprio candidato dentro da descrição da experiência. Sem isso, "trabalhei na
 * Flextronics" vazaria o empregador mesmo com o campo `empresa` pseudonimizado,
 * e empregador + cargo + cidade reidentifica a pessoa.
 */
export function redigirTexto(texto, { sensiveis = [] } = {}) {
  const original = String(texto ?? "");
  if (!original) return { texto: original, encontrados: [] };

  // Literais conhecidos PRIMEIRO. Se o detector de padrão rodar antes, ele
  // troca "João" por [removido] e o literal "João Batista Silva" deixa de
  // casar — sobraria "Batista Silva" no payload, que é justamente o vazamento
  // que esta função existe para impedir.
  let valor = original;
  for (const literal of sensiveis) {
    const limpo = String(literal ?? "").trim();
    if (limpo.length < 3) continue;
    const escapado = limpo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    valor = valor.replace(new RegExp(escapado, "gi"), PLACEHOLDER.REMOVIDO);
  }

  const encontrados = detectarPessoais(valor);
  if (encontrados.length) {
    let saida = "";
    let cursor = 0;
    for (const item of encontrados) {
      saida += valor.slice(cursor, item.inicio) + PLACEHOLDER.REMOVIDO;
      cursor = item.fim;
    }
    valor = saida + valor.slice(cursor);
  }

  return { texto: valor, encontrados };
}

/**
 * Constrói a representação enviável de um candidato.
 *
 * O texto é montado a partir dos campos, nunca copiando o original inteiro:
 * assim um campo novo acrescentado ao modelo de dados não vaza por omissão.
 * Campos de texto livre passam por `redigirTexto` mesmo assim, porque o
 * candidato escreve o próprio currículo e pode ter digitado o CPF nele.
 *
 * Empresa e instituição viram pseudônimo estável (EMPRESA_1, INSTITUICAO_1)
 * em vez de sumir: sem eles o modelo não consegue julgar continuidade de
 * emprego nem progressão de cargo, que é o que mais prediz aderência.
 */
export function desidentificarCandidato(candidato, { hoje } = {}) {
  if (!candidato) throw new Error("desidentificarCandidato exige o candidato");

  const referencia = hoje ?? new Date().toISOString().slice(0, 10);
  const camposRemovidos = [];
  const substituicoes = {};

  const marcar = (campo) => {
    if (!camposRemovidos.includes(campo)) camposRemovidos.push(campo);
  };

  marcar("dados.nome");
  marcar("dados.nomeSocial");
  marcar("dados.cpf");
  marcar("dados.nascimento");
  marcar("dados.genero");
  marcar("contato.email");
  marcar("contato.telefone");
  marcar("contato.cidade");
  marcar("contato.uf");
  marcar("contato.links");

  // Literais conhecidos, coletados antes de redigir qualquer texto livre: o
  // candidato escreve o próprio currículo e pode citar empregador ou o próprio
  // nome dentro de uma descrição.
  const sensiveis = [
    candidato.dados?.nome,
    candidato.dados?.nomeSocial,
    candidato.dados?.cpf,
    candidato.contato?.email,
    candidato.contato?.telefone,
    candidato.contato?.cidade,
    ...(candidato.experiencias ?? []).map((e) => e.empresa),
    ...(candidato.formacao ?? []).map((f) => f.instituicao),
    ...(candidato.contato?.links ? Object.values(candidato.contato.links) : []),
  ].filter((v) => typeof v === "string" && v.trim().length >= 3);

  const redigir = (texto) => redigirTexto(texto, { sensiveis }).texto;

  // Cidade/UF saem mesmo sendo pouco identificantes sozinhos: em mercado
  // pequeno, "Manaus + empresa + cargo" reidentifica sem precisar de nome.
  const empresas = new Map();
  const pseudonimoEmpresa = (nome) => {
    if (!nome) return null;
    const chave = normalizar(nome).toLowerCase();
    if (!empresas.has(chave)) {
      const rotulo = `${PLACEHOLDER.EMPRESA}_${empresas.size + 1}`;
      empresas.set(chave, rotulo);
      substituicoes[rotulo] = nome;
    }
    return empresas.get(chave);
  };

  const instituicoes = new Map();
  const pseudonimoInstituicao = (nome) => {
    if (!nome) return null;
    const chave = normalizar(nome).toLowerCase();
    if (!instituicoes.has(chave)) {
      const rotulo = `${PLACEHOLDER.INSTITUICAO}_${instituicoes.size + 1}`;
      instituicoes.set(chave, rotulo);
      substituicoes[rotulo] = nome;
    }
    return instituicoes.get(chave);
  };

  const linhas = [PLACEHOLDER.CANDIDATO, ""];

  const pretensao = candidato.pretensaoSalarial;
  if (pretensao != null) {
    // Mantida: é relevante para a vaga e não identifica ninguém sozinha.
    linhas.push(`Pretensão salarial: ${formatarBRL(pretensao)}`);
  }
  if (candidato.disponibilidadeInicio) linhas.push(`Disponibilidade de início: ${candidato.disponibilidadeInicio}`);

  if ((candidato.formacao ?? []).length) {
    linhas.push("", "FORMAÇÃO");
    for (const f of candidato.formacao) {
      const instituicao = pseudonimoInstituicao(f.instituicao);
      const curso = redigir(f.curso ?? "");
      const situacao = f.concluido === false ? "em andamento" : "concluído";
      const periodo = f.inicio && f.conclusao ? ` (${f.inicio} → ${f.conclusao})` : "";
      linhas.push(`- ${curso}${instituicao ? ` — ${instituicao}` : ""} · ${f.nivel ?? ""} · ${situacao}${periodo}`);
    }
  }

  if ((candidato.experiencias ?? []).length) {
    linhas.push("", "EXPERIÊNCIA");
    for (const e of candidato.experiencias) {
      const empresa = pseudonimoEmpresa(e.empresa);
      const cargo = redigir(e.cargo ?? "");
      const fim = e.atual ? "atual" : e.fim ?? "?";
      const meses = e.inicio && fim !== "?" && fim !== "atual" ? diferencaDias(e.inicio, fim) : null;
      const competencias = (e.competencias ?? []).join(", ");
      const descricao = redigir(e.descricao ?? "");
      linhas.push(
        `- ${cargo || "cargo não informado"}${empresa ? ` · ${empresa}` : ""} · ${e.inicio ?? "?"} → ${fim}` +
          (meses != null ? ` (${Math.round(meses / 30)} meses)` : "") +
          (competencias ? ` · ${competencias}` : "") +
          (descricao ? `\n  ${descricao}` : "")
      );
    }
  }

  if ((candidato.competencias ?? []).length) {
    linhas.push("", "COMPETÊNCIAS");
    for (const c of candidato.competencias) {
      linhas.push(`- ${redigir(c.nome ?? "")}${c.nivel != null ? ` (nível ${c.nivel})` : ""}`);
    }
  }

  if ((candidato.idiomas ?? []).length) {
    linhas.push("", "IDIOMAS");
    for (const i of candidato.idiomas) {
      linhas.push(`- ${i.codigo ?? i.idioma ?? "?"} · ${i.nivel ?? "?"}`);
    }
  }

  if (candidato.curriculoTexto) {
    linhas.push("", "RESUMO DO CURRÍCULO", redigir(candidato.curriculoTexto));
  }

  const texto = linhas.join("\n").trim();
  return { texto, camposRemovidos, substituicoes, referencia };
}

/**
 * Lado empregador. O nome real da empresa sai porque quem contrata também é
 * titular de dado (segredo industrial à parte, o par empresa×vaga permite
 * identificar o candidato em mercado pequeno). Cidade e modalidade ficam: são
 * indispensáveis para julgar aderência e não identificam pessoa.
 */
export function desidentificarVaga(vaga) {
  if (!vaga) throw new Error("desidentificarVaga exige a vaga");

  const linhas = [
    `Vaga: ${redigirTexto(vaga.titulo ?? "").texto}`,
    vaga.local?.modelo ? `Modalidade: ${vaga.local.modelo}` : null,
    vaga.local?.cidade ? `Local: ${vaga.local.cidade}/${vaga.local.uf ?? ""}` : null,
    vaga.tipoContrato ? `Contrato: ${vaga.tipoContrato}` : null,
    vaga.nivel ? `Nível: ${vaga.nivel}` : null,
    vaga.area ? `Área: ${vaga.area}` : null,
    vaga.salario?.max != null && vaga.salario?.exibir !== false
      ? `Faixa: ${formatarBRL(vaga.salario.min ?? 0)} a ${formatarBRL(vaga.salario.max)}`
      : null,
    (vaga.requisitos ?? []).length ? `\nRequisitos:\n${vaga.requisitos.map((r) => `- ${redigirTexto(String(r)).texto}`).join("\n")}` : null,
    (vaga.responsabilidades ?? []).length
      ? `\nResponsabilidades:\n${vaga.responsabilidades.map((r) => `- ${redigirTexto(String(r)).texto}`).join("\n")}`
      : null,
    (vaga.competencias ?? []).length
      ? `\nCompetências avaliadas:\n${vaga.competencias
          .map((c) => `- ${c.nome} (peso ${c.peso ?? 1}${c.obrigatoria ? ", obrigatória" : ""}${c.nivelMinimo ? `, nível mínimo ${c.nivelMinimo}` : ""})`)
          .join("\n")}`
      : null,
    vaga.formacaoMinima ? `\nFormação mínima (escala 1-7): ${vaga.formacaoMinima}` : null,
    (vaga.idiomas ?? []).length ? `\nIdiomas: ${vaga.idiomas.map((i) => `${i.codigo ?? i.idioma} ${i.nivel ?? ""}`).join(", ")}` : null,
  ].filter(Boolean);

  return {
    texto: linhas.join("\n"),
    camposRemovidos: ["titulo (nome da empresa embutido)", "hiringOrganization", "endereco", "cep", "recrutadorId", "requisitanteId", "tenantId"],
  };
}

function caminhoDe(prefixo, chave) {
  return prefixo ? `${prefixo}.${chave}` : String(chave);
}

/**
 * Varre qualquer valor (objeto, array ou string) em profundidade e lista todo
 * identificador encontrado. É o que o transporte chama antes de enviar.
 *
 * `sensiveis` aceita literais conhecidos — nome completo, data de nascimento —
 * que nenhum regex pegaria com segurança. Quem tem o candidato em mãos passa;
 * a auditoria genérica continua funcionando sem eles.
 */
export function auditarPayload(valor, { caminho = "$", sensiveis = [] } = {}) {
  const violacoes = [];
  const normalizados = sensiveis
    .map((s) => normalizar(semEspacos(String(s ?? ""))).toLowerCase())
    .filter((s) => s.length >= 3);

  function visitar(no, atual) {
    if (no === null || no === undefined) return;

    if (typeof no === "string") {
      for (const item of detectarPessoais(no)) {
        violacoes.push({ caminho: atual, tipo: item.tipo, trecho: item.trecho });
      }
      const normalizado = normalizar(semEspacos(no)).toLowerCase();
      for (const sensivel of normalizados) {
        if (normalizado.includes(sensivel)) {
          violacoes.push({ caminho: atual, tipo: TIPO_VIOLACAO.DOCUMENTO, trecho: sensivel });
        }
      }
      return;
    }

    if (typeof no !== "object") return;

    if (Array.isArray(no)) {
      no.forEach((item, indice) => visitar(item, `${atual}[${indice}]`));
      return;
    }
    for (const [chave, conteudo] of Object.entries(no)) visitar(conteudo, caminhoDe(atual, chave));
  }

  visitar(valor, caminho);

  // sem duplicar: mesmo tipo no mesmo caminho com o mesmo trecho conta uma vez
  const unicos = [];
  const vistos = new Set();
  for (const v of violacoes) {
    const chave = `${v.caminho}|${v.tipo}|${v.trecho}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(v);
  }

  return { limpo: unicos.length === 0, violacoes: unicos };
}

/**
 * Portão de saída. O transporte DEVE chamar isto antes de qualquer requisição.
 * Lançar em vez de devolver `false` é deliberado: um retorno booleano pode ser
 * ignorado por descuido, e o custo de ignorar aqui é CPF de candidato saindo
 * do país.
 */
export function assertPayloadLimpo(valor, opcoes) {
  const auditoria = auditarPayload(valor, opcoes);
  if (!auditoria.limpo) throw new ErroDadoPessoal(auditoria.violacoes);
  return true;
}

/**
 * Conferência de que o texto desidentificado não guarda identificador nem por
 * acidente. Roda depois de `desidentificarCandidato` — defesa em profundidade,
 * porque o currículo é texto livre escrito pelo próprio candidato.
 */
export function verificarSaidaDesidentificada(resultado, candidato) {
  const sensiveis = [
    candidato?.dados?.nome,
    candidato?.dados?.nomeSocial,
    candidato?.dados?.cpf,
    candidato?.contato?.email,
    candidato?.contato?.telefone,
    candidato?.contato?.cidade,
    ...(candidato?.contato?.links ? Object.values(candidato.contato.links) : []),
    ...(candidato?.experiencias ?? []).map((e) => e.empresa),
    ...(candidato?.formacao ?? []).map((f) => f.instituicao),
  ].filter(Boolean);

  const auditoria = auditarPayload(resultado.texto, { sensiveis });
  return { limpo: auditoria.limpo, violacoes: auditoria.violacoes };
}

export { somenteDigitos };
