import test from "node:test";
import assert from "node:assert/strict";

import {
  criarVaga,
  validarVaga,
  mudarStatus,
  abrirVaga,
  pausarVaga,
  encerrarVaga,
  cancelarVaga,
  transicoesPermitidas,
  etapasAtivas,
  etapasDeSaida,
  etapaPorId,
  etapaDeSaidaPorMotivo,
  proximaEtapa,
  slugUnico,
  criarModeloProcesso,
  aplicarModelo,
  urlPublica,
  auditarAnuncio,
} from "../src/vagas.js";
import { ETAPAS_PADRAO, MOTIVO_SAIDA, STATUS_VAGA, TIPO_ETAPA } from "../src/constantes.js";

function vagaValida(sobrescrever = {}) {
  return {
    titulo: "Pessoa Desenvolvedora Sênior",
    descricao:
      "Buscamos pessoa desenvolvedora sênior para atuar no time de plataforma, com foco em Node.js e arquitetura de serviços. Ambiente colaborativo e autonomia técnica.",
    responsabilidades: ["Desenhar serviços", "Revisar código"],
    requisitos: ["5 anos com Node.js"],
    beneficios: ["Vale refeição", "Plano de saúde"],
    competencias: [{ nome: "Node.js", peso: 3, obrigatoria: true, nivelMinimo: 4 }],
    quantidadeVagas: 2,
    salario: { min: 1_200_000, max: 1_800_000, exibir: true },
    local: { modelo: "PRESENCIAL", cidade: "São Paulo", uf: "SP" },
    tipoContrato: "CLT",
    cbo: "3171100",
    knockout: [{ id: "k1", pergunta: "Tem 5 anos de experiência?", tipo: "SIM_NAO", eliminatoria: true }],
    ...sobrescrever,
  };
}

test("criarVaga exige título", () => {
  assert.throws(() => criarVaga({}), /titulo é obrigatório/);
  assert.throws(() => criarVaga({ titulo: "   " }), /titulo é obrigatório/);
});

test("criarVaga aplica padrões e gera id e slug", () => {
  const vaga = criarVaga({ titulo: "Analista de RH" }, { agora: "2026-09-27T10:00:00.000Z" });
  assert.match(vaga.id, /^VAGA_/);
  assert.equal(vaga.slug, "analista-de-rh");
  assert.equal(vaga.status, STATUS_VAGA.RASCUNHO);
  assert.equal(vaga.quantidadeVagas, 1);
  assert.equal(vaga.tipoContrato, "CLT");
  assert.equal(vaga.datas.criadaEm, "2026-09-27T10:00:00.000Z");
  assert.equal(vaga.regrasTriagem.corteMinimo, 60);
  assert.equal(vaga.etapas.length, ETAPAS_PADRAO.length);
});

test("criarVaga não compartilha as etapas padrão entre vagas", () => {
  const a = criarVaga({ titulo: "Vaga A" });
  const b = criarVaga({ titulo: "Vaga B" });
  a.etapas[0].nome = "alterado";
  assert.equal(b.etapas[0].nome, "Triagem automática");
});

test("slugUnico desambigua títulos repetidos", () => {
  assert.equal(slugUnico("Analista de RH"), "analista-de-rh");
  assert.equal(slugUnico("Analista de RH", ["analista-de-rh"]), "analista-de-rh-2");
  assert.equal(slugUnico("Analista de RH", ["analista-de-rh", "analista-de-rh-2"]), "analista-de-rh-3");
  assert.equal(slugUnico("!!!"), "vaga");
});

test("validarVaga aprova uma vaga completa", () => {
  const resultado = validarVaga(criarVaga(vagaValida()));
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.erros, []);
});

test("validarVaga aponta erros obrigatórios", () => {
  const resultado = validarVaga(
    criarVaga(vagaValida({ descricao: "curta", quantidadeVagas: 0, salario: { min: 200_000, max: 100_000 } }))
  );
  assert.equal(resultado.valido, false);
  assert.ok(resultado.erros.some((e) => /descricao/.test(e)));
  assert.ok(resultado.erros.some((e) => /quantidadeVagas/.test(e)));
  assert.ok(resultado.erros.some((e) => /salario\.min/.test(e)));
});

test("validarVaga exige cidade e UF em vaga presencial", () => {
  const resultado = validarVaga(criarVaga(vagaValida({ local: { modelo: "PRESENCIAL" } })));
  assert.ok(resultado.erros.some((e) => /cidade e uf/.test(e)));

  const remota = validarVaga(criarVaga(vagaValida({ local: { modelo: "REMOTO" } })));
  assert.equal(remota.valido, true);
});

test("validarVaga confere CBO, UF e datas", () => {
  assert.ok(validarVaga(criarVaga(vagaValida({ cbo: "123" }))).erros.some((e) => /cbo/.test(e)));
  assert.ok(validarVaga(criarVaga(vagaValida({ local: { modelo: "REMOTO", uf: "SPP" } }))).erros.some((e) => /uf/.test(e)));
  assert.ok(
    validarVaga(
      criarVaga(vagaValida({ datas: { abertaEm: "2026-09-10", encerradaEm: "2026-09-01" } }))
    ).erros.some((e) => /encerradaEm/.test(e))
  );
  assert.ok(
    validarVaga(criarVaga(vagaValida({ datas: { abertaEm: "10/09/2026" } }))).erros.some((e) => /abertaEm/.test(e))
  );
});

test("validarVaga confere etapas: id único e ordem única", () => {
  const vaga = criarVaga(vagaValida({ etapas: [
    { id: "a", nome: "A", ordem: 1, tipo: TIPO_ETAPA.TRIAGEM },
    { id: "a", nome: "A2", ordem: 1, tipo: TIPO_ETAPA.CURRICULO },
  ] }));
  const resultado = validarVaga(vaga);
  assert.ok(resultado.erros.some((e) => /etapa duplicada/.test(e)));
  assert.ok(resultado.erros.some((e) => /ordem das etapas/.test(e)));
  assert.ok(resultado.avisos.some((a) => /etapa de saída/.test(a)));
});

test("validarVaga exige ao menos duas etapas ativas", () => {
  const vaga = criarVaga(vagaValida({ etapas: [
    { id: "a", nome: "A", ordem: 1, tipo: TIPO_ETAPA.TRIAGEM },
  ] }));
  assert.ok(validarVaga(vaga).erros.some((e) => /ao menos 2 etapas ativas/.test(e)));
});

test("validarVaga exige motivo em etapa de saída", () => {
  const vaga = criarVaga(vagaValida({ etapas: [
    { id: "a", nome: "A", ordem: 1, tipo: TIPO_ETAPA.TRIAGEM },
    { id: "b", nome: "B", ordem: 2, tipo: TIPO_ETAPA.CURRICULO },
    { id: "c", nome: "C", ordem: 3, tipo: TIPO_ETAPA.SAIDA },
  ] }));
  assert.ok(validarVaga(vaga).erros.some((e) => /motivo válido/.test(e)));
});

test("validarVaga confere knockout e competências", () => {
  const vaga = criarVaga(vagaValida({
    knockout: [
      { id: "k1", pergunta: "x", tipo: "MULTIPLA" },
      { id: "k1", pergunta: "y", tipo: "DESCONHECIDO" },
    ],
    competencias: [{ nome: "  ", peso: 0 }],
  }));
  const resultado = validarVaga(vaga);
  assert.ok(resultado.erros.some((e) => /knockout duplicado/.test(e)));
  assert.ok(resultado.erros.some((e) => /opcoesAceitas/.test(e)));
  assert.ok(resultado.erros.some((e) => /tipo inválido/.test(e)));
  assert.ok(resultado.erros.some((e) => /competência sem nome/.test(e)));
  assert.ok(resultado.erros.some((e) => /peso da competência/.test(e)));
});

test("validarVaga emite avisos sem invalidar", () => {
  const resultado = validarVaga(criarVaga(vagaValida({ salario: { exibir: false } })));
  assert.equal(resultado.valido, true);
  assert.ok(resultado.avisos.some((a) => /faixa salarial/.test(a)));
});

test("validarVaga rejeita corteMinimo fora de 0 a 100", () => {
  const vaga = criarVaga(vagaValida({ regrasTriagem: { corteMinimo: 150 } }));
  assert.ok(validarVaga(vaga).erros.some((e) => /corteMinimo/.test(e)));
});

test("mudança de status segue a tabela de transições", () => {
  assert.deepEqual(transicoesPermitidas(STATUS_VAGA.RASCUNHO), [STATUS_VAGA.ABERTA, STATUS_VAGA.CANCELADA]);
  assert.deepEqual(transicoesPermitidas(STATUS_VAGA.CANCELADA), []);

  const rascunho = criarVaga(vagaValida());
  assert.equal(mudarStatus(rascunho, STATUS_VAGA.PAUSADA).ok, false);
  assert.match(mudarStatus(rascunho, STATUS_VAGA.PAUSADA).motivo, /não é permitida/);
});

test("abrirVaga registra abertaEm uma única vez", () => {
  const rascunho = criarVaga(vagaValida());
  const primeira = abrirVaga(rascunho, { agora: "2026-09-27T10:00:00.000Z" });
  assert.equal(primeira.ok, true);
  assert.equal(primeira.vaga.status, STATUS_VAGA.ABERTA);
  assert.equal(primeira.vaga.datas.abertaEm, "2026-09-27T10:00:00.000Z");

  const pausada = pausarVaga(primeira.vaga);
  const reaberta = abrirVaga(pausada.vaga, { agora: "2026-10-01T09:00:00.000Z" });
  assert.equal(reaberta.vaga.datas.abertaEm, "2026-09-27T10:00:00.000Z");
});

test("encerrar e cancelar preenchem encerradaEm", () => {
  const aberta = abrirVaga(criarVaga(vagaValida())).vaga;
  const encerrada = encerrarVaga(aberta, { agora: "2026-10-10T12:00:00.000Z" });
  assert.equal(encerrada.vaga.datas.encerradaEm, "2026-10-10T12:00:00.000Z");

  const reaberta = abrirVaga(encerrada.vaga);
  assert.equal(reaberta.ok, true);

  const cancelada = cancelarVaga(reaberta.vaga, { agora: "2026-10-11T12:00:00.000Z", motivo: "vaga preenchida internamente" });
  assert.equal(cancelada.vaga.status, STATUS_VAGA.CANCELADA);
  assert.equal(cancelada.vaga.motivoCancelamento, "vaga preenchida internamente");
  assert.equal(mudarStatus(cancelada.vaga, STATUS_VAGA.ABERTA).ok, false);
});

test("etapas: ativas excluem saída e saem ordenadas", () => {
  const vaga = criarVaga(vagaValida());
  const ativas = etapasAtivas(vaga);
  assert.equal(ativas.length, 8);
  assert.equal(ativas[0].id, "triagem");
  assert.equal(ativas[ativas.length - 1].id, "admissao");
  assert.ok(ativas.every((e) => e.tipo !== TIPO_ETAPA.SAIDA));

  const saidas = etapasDeSaida(vaga);
  assert.deepEqual(saidas.map((e) => e.motivo), [
    MOTIVO_SAIDA.REPROVADO,
    MOTIVO_SAIDA.DESISTENTE,
    MOTIVO_SAIDA.BANCO_TALENTOS,
  ]);

  assert.equal(etapaPorId(vaga, "proposta").nome, "Proposta");
  assert.equal(etapaPorId(vaga, "inexistente"), null);
  assert.equal(etapaDeSaidaPorMotivo(vaga, MOTIVO_SAIDA.DESISTENTE).id, "desistente");
});

test("proximaEtapa percorre o pipeline e termina em null", () => {
  const vaga = criarVaga(vagaValida());
  assert.equal(proximaEtapa(vaga, "triagem").id, "curriculo");
  assert.equal(proximaEtapa(vaga, "aprovado").id, "admissao");
  assert.equal(proximaEtapa(vaga, "admissao"), null);
  assert.equal(proximaEtapa(vaga, "reprovado"), null);
  assert.equal(proximaEtapa(vaga, "inexistente"), null);
});

test("modelo de processo é reaplicável em outra vaga", () => {
  const modelo = criarModeloProcesso({
    nome: "Operacional",
    etapas: [
      { id: "triagem", nome: "Triagem", ordem: 1, tipo: TIPO_ETAPA.TRIAGEM, slaDias: 1 },
      { id: "entrevista", nome: "Entrevista", ordem: 2, tipo: TIPO_ETAPA.ENTREVISTA, slaDias: 4 },
      { id: "reprovado", nome: "Reprovado", ordem: 90, tipo: TIPO_ETAPA.SAIDA, motivo: MOTIVO_SAIDA.REPROVADO },
    ],
  });
  assert.match(modelo.id, /^MOD_/);

  const aplicada = aplicarModelo(criarVaga(vagaValida()), modelo);
  assert.equal(aplicada.ok, true);
  assert.equal(aplicada.vaga.etapas.length, 3);

  // modelo inválido não pode corromper a vaga existente
  const ruim = criarModeloProcesso({
    nome: "Ruim",
    etapas: [{ id: "unica", nome: "Única", ordem: 1, tipo: TIPO_ETAPA.TRIAGEM }],
  });
  const original = criarVaga(vagaValida());
  const falha = aplicarModelo(original, ruim);
  assert.equal(falha.ok, false);
  assert.equal(falha.vaga.etapas.length, ETAPAS_PADRAO.length);
  assert.ok(falha.erros.some((e) => /2 etapas ativas/.test(e)));

  assert.throws(() => criarModeloProcesso({ nome: "", etapas: [] }), /precisa de nome/);
});

test("urlPublica compõe portal por tenant", () => {
  const vaga = criarVaga({ titulo: "Analista de RH" });
  assert.equal(urlPublica(vaga, { baseUrl: "https://vagas.labutar.com.br", tenantSlug: "acme" }),
    "https://vagas.labutar.com.br/acme/analista-de-rh");
  assert.equal(urlPublica(vaga, { baseUrl: "https://vagas.labutar.com.br/" }),
    "https://vagas.labutar.com.br/analista-de-rh");
  assert.equal(urlPublica(vaga, {}), null);
});

test("auditarAnuncio detecta termo discriminatório", () => {
  const limpa = auditarAnuncio(criarVaga(vagaValida()));
  assert.equal(limpa.limpo, true);

  const suja = auditarAnuncio(
    criarVaga(vagaValida({ requisitos: ["Boa aparência", "apenas mulheres", "até 30 anos"] }))
  );
  assert.equal(suja.limpo, false);
  assert.deepEqual(suja.termosEncontrados.sort(), ["apenas mulheres", "ate 30 anos", "boa aparencia"].sort());
  assert.match(suja.orientacao, /373-A/);
  assert.match(suja.orientacao, /9\.029/);
});
