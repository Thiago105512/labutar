import test from "node:test";
import assert from "node:assert/strict";

import { criarVaga, abrirVaga } from "../src/vagas.js";
import { criarCandidato } from "../src/candidatos.js";
import {
  criarCandidatura,
  moverEtapa,
  desistir,
  registrarAvaliacaoInterna,
  registrarAnexo,
  calcularSLA,
  funil,
  tempoMedioPorEtapa,
  origensDasCandidaturas,
  estaTerminal,
} from "../src/candidaturas.js";
import { STATUS_CANDIDATURA, STATUS_VAGA, TIPO_ETAPA, MOTIVO_SAIDA } from "../src/constantes.js";

const DESCRICAO =
  "Buscamos pessoa desenvolvedora sênior para o time de plataforma, com foco em Node.js, arquitetura de serviços e observabilidade. Autonomia técnica e revisão por pares.";

function vagaAberta(sobrescrever = {}) {
  const vaga = criarVaga({
    titulo: "Pessoa Desenvolvedora Sênior",
    descricao: DESCRICAO,
    competencias: [{ nome: "Node.js", peso: 3, obrigatoria: true, nivelMinimo: 3 }],
    local: { modelo: "PRESENCIAL", cidade: "São Paulo", uf: "SP" },
    knockout: [{ id: "k1", pergunta: "Disponibilidade imediata?", tipo: "SIM_NAO", eliminatoria: true }],
    ...sobrescrever,
  });
  return abrirVaga(vaga, { agora: "2026-09-01T10:00:00.000Z" }).vaga;
}

function candidatoForte(sobrescrever = {}) {
  return criarCandidato(
    {
      dados: { nome: "Ana Souza", cpf: "11144477735" },
      contato: { email: "ana@exemplo.com", telefone: "11987654321", cidade: "São Paulo", uf: "SP" },
      competencias: [{ nome: "Node.js", nivel: 5 }],
      formacao: [{ nivel: "SUPERIOR", concluido: true }],
      consentimento: { aceito: true, em: "2026-09-01", versaoTermo: "1.0" },
      ...sobrescrever,
    },
    { agora: "2026-09-01T09:00:00.000Z" }
  );
}

const SIM = [{ perguntaId: "k1", valor: "SIM" }];
const NAO = [{ perguntaId: "k1", valor: "NAO" }];

test("criarCandidatura exige vaga aberta", () => {
  const rascunho = criarVaga({ titulo: "X", descricao: DESCRICAO });
  assert.throws(
    () => criarCandidatura({ vaga: rascunho, candidato: candidatoForte() }),
    /não está aberta/
  );
  assert.throws(() => criarCandidatura({ candidato: candidatoForte() }), /exige a vaga/);
  assert.throws(() => criarCandidatura({ vaga: vagaAberta() }), /exige o candidato/);
});

test("candidato forte passa na triagem e entra depois da etapa de triagem", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM, agora: "2026-09-01T12:00:00.000Z" });

  assert.match(c.id, /^CTDA_/);
  assert.equal(c.etapaAtualId, "curriculo");
  assert.equal(c.status, STATUS_CANDIDATURA.EM_ANDAMENTO);
  assert.equal(c.score.total, 100);
  assert.equal(c.score.destaque, true);
  assert.equal(c.motivoReprovacao, null);
  assert.equal(c.historico.length, 1);
  assert.equal(c.historico[0].de, null);
  assert.equal(c.historico[0].porUsuarioId, "sistema");
  assert.match(c.historico[0].observacao, /APROVADO_AUTOMATICO/);
});

test("eliminação em knockout manda direto para a etapa de saída", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: NAO, agora: "2026-09-01T12:00:00.000Z" });

  assert.equal(c.etapaAtualId, "reprovado");
  assert.equal(c.status, STATUS_CANDIDATURA.REPROVADO);
  assert.equal(c.motivoReprovacao, "reprovado em pergunta eliminatória");
  assert.equal(estaTerminal(c), true);
});

test("candidatura sem resposta de knockout fica retida na triagem", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), agora: "2026-09-01T12:00:00.000Z" });

  assert.equal(c.etapaAtualId, "triagem");
  assert.equal(c.status, STATUS_CANDIDATURA.EM_ANDAMENTO);
  assert.equal(c.triagem.decisao, "ANALISE_MANUAL");
});

test("moverEtapa registra histórico, origem e data de entrada", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM, agora: "2026-09-01T12:00:00.000Z" });

  const r = moverEtapa(c, {
    vaga,
    paraEtapaId: "avaliacao",
    usuarioId: "U1",
    observacao: "currículo alinhado",
    agora: "2026-09-05T10:00:00.000Z",
  });

  assert.equal(r.ok, true);
  assert.equal(r.candidatura.etapaAtualId, "avaliacao");
  assert.equal(r.candidatura.etapaAtualDesde, "2026-09-05T10:00:00.000Z");
  assert.equal(r.candidatura.historico.length, 2);
  assert.deepEqual(
    { de: r.candidatura.historico[1].de, para: r.candidatura.historico[1].para },
    { de: "curriculo", para: "avaliacao" }
  );
  // imutabilidade: a candidatura original não pode ter sido alterada
  assert.equal(c.etapaAtualId, "curriculo");
  assert.equal(c.historico.length, 1);
});

test("moverEtapa recusa destino inexistente e movimento nulo", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM });

  assert.equal(moverEtapa(c, { vaga, paraEtapaId: "nao-existe" }).ok, false);
  assert.match(moverEtapa(c, { vaga, paraEtapaId: "nao-existe" }).motivo, /não existe/);
  assert.equal(moverEtapa(c, { vaga, paraEtapaId: "curriculo" }).ok, false);
  assert.match(moverEtapa(c, { vaga, paraEtapaId: "curriculo" }).motivo, /já está/);
  assert.throws(() => moverEtapa(c, { paraEtapaId: "x" }), /exige a vaga/);
});

test("status terminal só sai com reabrir explícito", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: NAO });

  const bloqueado = moverEtapa(c, { vaga, paraEtapaId: "curriculo", usuarioId: "U1" });
  assert.equal(bloqueado.ok, false);
  assert.match(bloqueado.motivo, /terminal/);

  const reaberto = moverEtapa(c, { vaga, paraEtapaId: "curriculo", usuarioId: "U1", reabrir: true });
  assert.equal(reaberto.ok, true);
  assert.equal(reaberto.candidatura.status, STATUS_CANDIDATURA.EM_ANDAMENTO);
  assert.equal(reaberto.candidatura.motivoReprovacao, null);
});

test("etapa de saída define o status pelo motivo configurado", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM });

  const banco = moverEtapa(c, { vaga, paraEtapaId: "banco", usuarioId: "U1" });
  assert.equal(banco.candidatura.status, STATUS_CANDIDATURA.BANCO);
  assert.equal(banco.candidatura.motivoReprovacao, MOTIVO_SAIDA.BANCO_TALENTOS);

  const reprovado = moverEtapa(c, { vaga, paraEtapaId: "reprovado", usuarioId: "U1" });
  assert.equal(reprovado.candidatura.status, STATUS_CANDIDATURA.REPROVADO);

  const aprovado = moverEtapa(c, { vaga, paraEtapaId: "aprovado", usuarioId: "U1" });
  assert.equal(aprovado.candidatura.status, STATUS_CANDIDATURA.EM_ANDAMENTO);
  assert.equal(aprovado.candidatura.motivoReprovacao, null);
});

test("desistência parte do próprio candidato", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM });
  const r = desistir(c, { vaga, agora: "2026-09-06T09:00:00.000Z", motivo: "aceitei outra proposta" });

  assert.equal(r.ok, true);
  assert.equal(r.candidatura.status, STATUS_CANDIDATURA.DESISTENTE);
  assert.equal(r.candidatura.etapaAtualId, "desistente");
  assert.equal(r.candidatura.historico.at(-1).porUsuarioId, "candidato");
  assert.equal(r.candidatura.historico.at(-1).observacao, "aceitei outra proposta");
});

test("desistir avisa quando a vaga não tem etapa de desistência", () => {
  const vaga = abrirVaga(
    criarVaga({
      titulo: "Operador",
      descricao: DESCRICAO,
      etapas: [
        { id: "t", nome: "Triagem", ordem: 1, tipo: TIPO_ETAPA.TRIAGEM },
        { id: "c", nome: "Entrevista", ordem: 2, tipo: TIPO_ETAPA.ENTREVISTA },
        { id: "r", nome: "Reprovado", ordem: 90, tipo: TIPO_ETAPA.SAIDA, motivo: MOTIVO_SAIDA.REPROVADO },
      ],
    })
  ).vaga;

  const c = criarCandidatura({ vaga, candidato: candidatoForte() });
  const r = desistir(c, { vaga });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /não tem etapa de saída/);
});

test("calcularSLA mede a etapa atual e as etapas percorridas", () => {
  const vaga = vagaAberta();
  let c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM, agora: "2026-09-01T12:00:00.000Z" });
  c = moverEtapa(c, { vaga, paraEtapaId: "avaliacao", usuarioId: "U1", agora: "2026-09-05T10:00:00.000Z" }).candidatura;

  const sla = calcularSLA(c, vaga, "2026-09-27");
  assert.equal(sla.etapaAtualId, "avaliacao");
  assert.equal(sla.diasNaEtapa, 22);
  assert.equal(sla.slaDias, 5);
  assert.equal(sla.atrasada, true);
  assert.equal(sla.diasExcedidos, 17);
  assert.equal(sla.diasTotais, 26);
  assert.deepEqual(sla.porEtapa, [
    { etapaId: "curriculo", nome: "Análise de currículo", dias: 4, slaDias: 3 },
  ]);
});

test("calcularSLA não marca como atrasada uma candidatura encerrada", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: NAO, agora: "2026-09-01T12:00:00.000Z" });
  const sla = calcularSLA(c, vaga, "2026-12-31");
  assert.equal(sla.atrasada, false);
});

test("avaliação interna é única por avaliador", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM });

  let comUma = registrarAvaliacaoInterna(c, { usuarioId: "U1", nota: 4, parecer: "técnico sólido" });
  assert.equal(comUma.avaliacoesInternas.length, 1);

  comUma = registrarAvaliacaoInterna(comUma, { usuarioId: "U1", nota: 5, parecer: "revisto" });
  assert.equal(comUma.avaliacoesInternas.length, 1);
  assert.equal(comUma.avaliacoesInternas[0].nota, 5);

  const comDuas = registrarAvaliacaoInterna(comUma, { usuarioId: "U2", nota: 3 });
  assert.equal(comDuas.avaliacoesInternas.length, 2);

  assert.throws(() => registrarAvaliacaoInterna(c, { usuarioId: "U1", nota: 7 }), /entre 0 e 5/);
  assert.throws(() => registrarAvaliacaoInterna(c, { nota: 3 }), /exige usuarioId/);
});

test("registrarAnexo acumula e valida entrada", () => {
  const vaga = vagaAberta();
  const c = criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM });
  const comAnexo = registrarAnexo(c, { nome: "curriculo.pdf", url: "https://cdn/1.pdf" });
  assert.equal(comAnexo.anexos.length, 1);
  assert.equal(comAnexo.anexos[0].tipo, "curriculo");
  assert.throws(() => registrarAnexo(c, { nome: "x" }), /nome e url/);
});

test("funil conta por etapa e calcula taxas", () => {
  const vaga = vagaAberta();
  const candidatas = [
    criarCandidatura({ vaga, candidato: candidatoForte(), respostas: SIM, agora: "2026-09-01T12:00:00.000Z" }),
    criarCandidatura({ vaga, candidato: candidatoForte({ id: "CAND_2" }), agora: "2026-09-02T12:00:00.000Z" }),
    criarCandidatura({ vaga, candidato: candidatoForte({ id: "CAND_3" }), respostas: NAO, agora: "2026-09-03T12:00:00.000Z" }),
  ];

  const f = funil(candidatas, vaga);
  assert.equal(f.total, 3);
  assert.equal(f.emAndamento, 2);
  assert.equal(f.reprovados, 1);
  assert.equal(f.aprovados, 0);
  assert.equal(f.taxaConversao, 0);
  assert.equal(f.taxaReprovacao, 33.33);
  assert.equal(f.porEtapa.find((e) => e.etapaId === "curriculo").quantidade, 1);
  assert.equal(f.porEtapa.find((e) => e.etapaId === "triagem").quantidade, 1);
  assert.equal(f.porEtapa.find((e) => e.etapaId === "reprovado"), undefined);
  assert.equal(f.destaques, 1);
});

test("tempoMedioPorEtapa agrega várias candidaturas", () => {
  const vaga = vagaAberta();
  const a = criarCandidatura({ vaga, candidato: candidatoForte({ id: "C1" }), respostas: SIM, agora: "2026-09-01T00:00:00.000Z" });
  const b = criarCandidatura({ vaga, candidato: candidatoForte({ id: "C2" }), respostas: SIM, agora: "2026-09-01T00:00:00.000Z" });

  const a2 = moverEtapa(a, { vaga, paraEtapaId: "avaliacao", usuarioId: "U1", agora: "2026-09-05T00:00:00.000Z" }).candidatura;
  const b2 = moverEtapa(b, { vaga, paraEtapaId: "avaliacao", usuarioId: "U1", agora: "2026-09-03T00:00:00.000Z" }).candidatura;

  const tempos = tempoMedioPorEtapa([a2, b2], vaga);
  assert.deepEqual(tempos, [{ etapaId: "curriculo", nome: "Análise de currículo", amostras: 2, diasMedios: 3 }]);
});

test("origensDasCandidaturas ranqueia canais de aquisição", () => {
  const vaga = vagaAberta();
  const candidatas = [
    criarCandidatura({ vaga, candidato: candidatoForte({ id: "C1" }), respostas: SIM, origem: { canal: "LINKEDIN" } }),
    criarCandidatura({ vaga, candidato: candidatoForte({ id: "C2" }), respostas: SIM, origem: { canal: "LINKEDIN" } }),
    criarCandidatura({ vaga, candidato: candidatoForte({ id: "C3" }), respostas: SIM, origem: { canal: "CATHO" } }),
    criarCandidatura({ vaga, candidato: candidatoForte({ id: "C4" }), respostas: SIM }),
  ];

  assert.deepEqual(origensDasCandidaturas(candidatas), [
    { canal: "LINKEDIN", quantidade: 2 },
    { canal: "CATHO", quantidade: 1 },
    { canal: "DIRETO", quantidade: 1 },
  ]);
});

test("criarCandidatura em vaga cancelada é bloqueada", () => {
  const vaga = vagaAberta();
  assert.equal(vaga.status, STATUS_VAGA.ABERTA);
  assert.throws(
    () => criarCandidatura({ vaga: { ...vaga, status: STATUS_VAGA.CANCELADA }, candidato: candidatoForte() }),
    /não está aberta/
  );
});
