/**
 * De onde vêm os dados de quem vai ser admitido. O cadastro pode começar do zero, mas se a
 * pessoa já passou pelo recrutamento (candidato, com os dados que preencheu no portal) ou já
 * teve vínculo com a empresa (pessoa no cadastro), os dados são puxados de lá — ninguém digita
 * de novo o que o sistema já tem.
 *
 * Prioridade: pessoa do cadastro (já conferida pelo DP) > candidato. Mesmo CPF = mesma pessoa.
 */
import { somenteDigitos } from "../../core/src/validacao.js";

export const ORIGEM = Object.freeze({ CADASTRO: "CADASTRO", RECRUTAMENTO: "RECRUTAMENTO" });

/** Etapas do processo seletivo em que o candidato está pronto para ser admitido. */
export const ETAPAS_PARA_ADMITIR = Object.freeze(["proposta", "aprovado", "admissao"]);

const CAMPOS_PESSOA = ["nome", "nomeSocial", "cpf", "nascimento", "email", "telefone", "municipio", "uf", "pcd", "tipoDeficiencia"];

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Dados de pessoa a partir do candidato do recrutamento. */
export function pessoaDoCandidato(candidato) {
  const d = candidato?.dados ?? {};
  const c = candidato?.contato ?? {};
  return {
    nome: d.nome ?? null,
    nomeSocial: d.nomeSocial ?? null,
    cpf: d.cpf ? somenteDigitos(d.cpf) : null,
    nascimento: d.nascimento ?? null,
    email: c.email ?? null,
    telefone: c.telefone ? somenteDigitos(c.telefone) : null,
    municipio: c.cidade ?? null,
    uf: c.uf ?? null,
    pcd: Boolean(d.pcd),
    tipoDeficiencia: d.tipoDeficiencia ?? null,
  };
}

const vazio = (v) => v === null || v === undefined || v === "" || v === false;

/**
 * Completa `base` com o que falta a partir de `extra`, sem sobrescrever o que já existe.
 * @returns { pessoa, preenchidos: campos que vieram de `extra`, divergentes: campos com valores diferentes }
 */
export function completarPessoa(base = {}, extra = {}) {
  const pessoa = { ...base };
  const preenchidos = [];
  const divergentes = [];
  for (const campo of CAMPOS_PESSOA) {
    const novo = extra[campo];
    if (vazio(novo)) continue;
    if (vazio(pessoa[campo])) {
      pessoa[campo] = novo;
      preenchidos.push(campo);
    } else if (campo !== "nome" && String(pessoa[campo]) !== String(novo)) divergentes.push(campo);
  }
  return { pessoa, preenchidos, divergentes };
}

/**
 * Pessoas e candidatos que podem ser admitidos. Sem termo de busca: os candidatos nas etapas
 * finais do processo seletivo. Com termo (nome ou CPF): qualquer pessoa do cadastro ou candidato.
 * @param fontes { pessoas, vinculos, candidatos, candidaturas, vagas }
 */
export function buscarOrigens({ pessoas = [], vinculos = [], candidatos = [], candidaturas = [], vagas = [] }, termo = "", { limite = 20 } = {}) {
  const t = semAcento(termo);
  const digitos = somenteDigitos(termo);
  const combina = (nome, cpf) => (digitos.length >= 3 && cpf?.includes(digitos)) || (t.length >= 2 && semAcento(nome).includes(t));
  const vagaPorId = new Map(vagas.map((v) => [v.id, v]));

  // Candidatura mais adiantada de cada candidato (para mostrar a vaga).
  const candidaturaDe = new Map();
  for (const c of candidaturas) {
    const atual = candidaturaDe.get(c.candidatoId);
    const pronta = ETAPAS_PARA_ADMITIR.includes(c.etapaAtualId);
    if (!atual || (pronta && !ETAPAS_PARA_ADMITIR.includes(atual.etapaAtualId))) candidaturaDe.set(c.candidatoId, c);
  }

  const saida = [];
  const cpfsVistos = new Set();
  const ativos = new Set(vinculos.filter((v) => !v.desligamento).map((v) => v.pessoaId));

  if (t || digitos) {
    for (const p of pessoas) {
      if (!combina(p.nome, p.cpf)) continue;
      const anteriores = vinculos.filter((v) => v.pessoaId === p.id).sort((a, b) => b.admissao.localeCompare(a.admissao));
      saida.push({
        origem: ORIGEM.CADASTRO, pessoaId: p.id, candidatoId: p.candidatoId ?? null,
        nome: p.nome, cpf: p.cpf ?? null, nascimento: p.nascimento ?? null, email: p.email ?? null, telefone: p.telefone ?? null,
        vinculoAtivo: ativos.has(p.id),
        ultimoVinculo: anteriores[0] ? { matricula: anteriores[0].matricula, tipo: anteriores[0].tipo, admissao: anteriores[0].admissao, desligamento: anteriores[0].desligamento ?? null, cargo: anteriores[0].cargo } : null,
      });
      if (p.cpf) cpfsVistos.add(p.cpf);
    }
  }

  const candidatosIdsNoCadastro = new Set(pessoas.map((p) => p.candidatoId).filter(Boolean));
  for (const c of candidatos) {
    const p = pessoaDoCandidato(c);
    const cand = candidaturaDe.get(c.id);
    const pronto = cand && ETAPAS_PARA_ADMITIR.includes(cand.etapaAtualId);
    if (t || digitos ? !combina(p.nome, p.cpf) : !pronto) continue;
    if ((p.cpf && cpfsVistos.has(p.cpf)) || candidatosIdsNoCadastro.has(c.id)) continue;
    const vaga = cand ? vagaPorId.get(cand.vagaId) : null;
    saida.push({
      origem: ORIGEM.RECRUTAMENTO, candidatoId: c.id, candidaturaId: cand?.id ?? null,
      ...p,
      etapa: cand?.etapaAtualId ?? null,
      prontoParaAdmitir: Boolean(pronto),
      vaga: vaga ? { id: vaga.id, titulo: vaga.titulo, cbo: vaga.cbo ?? null, salario: vaga.salario?.min ?? null } : null,
    });
  }

  // Prontos para admitir primeiro; depois cadastro; depois banco de talentos.
  const ordem = (x) => (x.prontoParaAdmitir ? 0 : x.origem === ORIGEM.CADASTRO ? 1 : 2);
  return saida.sort((a, b) => ordem(a) - ordem(b) || semAcento(a.nome).localeCompare(semAcento(b.nome))).slice(0, limite);
}
