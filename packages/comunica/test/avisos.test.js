import test from "node:test";
import assert from "node:assert/strict";

import {
  avisosVencendo,
  avisosVigentes,
  criarAviso,
  destinatarios,
  leituraPorUsuario,
  ordenarAvisos,
  registrarLeitura,
} from "../src/avisos.js";
import { PRIORIDADE_AVISO, PUBLICO_ALVO } from "../src/constantes.js";

const USUARIOS = [
  { id: "USU_1", nome: "Ana", papel: "RECRUTADOR", ativo: true, vagasIds: ["VAGA_1"] },
  { id: "USU_2", nome: "Carlos", papel: "GESTOR", ativo: true, vagasIds: ["VAGA_1", "VAGA_2"] },
  { id: "USU_3", nome: "Beatriz", papeis: ["GESTOR", "ADMIN"], ativo: true, vagasIds: ["VAGA_2"] },
  { id: "USU_4", nome: "Davi", papel: "RECRUTADOR", ativo: false, vagasIds: ["VAGA_1"] },
];

function aviso(parcial = {}) {
  return criarAviso({ titulo: "Aviso", corpo: "Corpo do aviso", ...parcial });
}

function ids(lista) {
  return lista.map((u) => u.id);
}

test("criarAviso devolve aviso completo e sem problemas", () => {
  const criado = aviso({ prioridade: PRIORIDADE_AVISO.ALTA, fixado: true, publico: { tipo: "PAPEIS", valores: ["GESTOR"] } });
  assert.deepEqual(criado.problemas, []);
  assert.equal(criado.valido, true);
  assert.match(criado.id, /^AVISO_/);
  assert.equal(criado.prioridade, "ALTA");
  assert.equal(criado.fixado, true);
  assert.deepEqual(criado.publico, { tipo: "PAPEIS", valores: ["GESTOR"] });
  assert.deepEqual(criado.leituras, []);
  assert.deepEqual(criado.anexos, []);
  assert.equal(criado.vigencia.ate, null);
  assert.match(criado.vigencia.de, /^\d{4}-\d{2}-\d{2}$/);
});

test("criarAviso acumula problemas em vez de lançar exceção", () => {
  const vazio = criarAviso({});
  assert.equal(vazio.valido, false);
  assert.deepEqual(vazio.problemas.map((p) => p.campo).sort(), ["corpo", "titulo"]);

  const publico = criarAviso({ titulo: "T", corpo: "C", publico: { tipo: "PAPEIS", valores: [] } });
  assert.deepEqual(publico.problemas.map((p) => p.campo), ["publico.valores"]);

  const prioridade = criarAviso({ titulo: "T", corpo: "C", prioridade: "URGENTISSIMA" });
  assert.deepEqual(prioridade.problemas.map((p) => p.tipo), ["PRIORIDADE_DESCONHECIDA"]);

  const tipo = criarAviso({ titulo: "T", corpo: "C", publico: { tipo: "FANTASMA", valores: ["x"] } });
  assert.deepEqual(tipo.problemas.map((p) => p.campo), ["publico.tipo"]);
});

test("criarAviso valida a vigência", () => {
  const invertida = aviso({ vigencia: { de: "2026-10-01", ate: "2026-09-01" } });
  assert.deepEqual(invertida.problemas.map((p) => p.campo), ["vigencia"]);

  const invalida = aviso({ vigencia: { de: "01/10/2026", ate: null } });
  assert.deepEqual(invalida.problemas.map((p) => p.campo), ["vigencia.de"]);

  const ok = aviso({ vigencia: { de: "2026-09-01", ate: "2026-09-30" } });
  assert.deepEqual(ok.problemas, []);
  assert.deepEqual(ok.vigencia, { de: "2026-09-01", ate: "2026-09-30" });
});

test("destinatarios resolve público TODOS ignorando inativos", () => {
  assert.deepEqual(ids(destinatarios(aviso({ publico: { tipo: PUBLICO_ALVO.TODOS } }), USUARIOS)), [
    "USU_1",
    "USU_2",
    "USU_3",
  ]);
  assert.deepEqual(destinatarios(aviso(), []), []);
  assert.deepEqual(destinatarios(aviso(), null), []);
});

test("destinatarios resolve público PAPEIS por papel e por lista de papéis", () => {
  const gestores = destinatarios(aviso({ publico: { tipo: "PAPEIS", valores: ["GESTOR"] } }), USUARIOS);
  assert.deepEqual(ids(gestores), ["USU_2", "USU_3"]);
  const admin = destinatarios(aviso({ publico: { tipo: "PAPEIS", valores: ["ADMIN"] } }), USUARIOS);
  assert.deepEqual(ids(admin), ["USU_3"]);
  const varios = destinatarios(aviso({ publico: { tipo: "PAPEIS", valores: ["RECRUTADOR", "ADMIN"] } }), USUARIOS);
  assert.deepEqual(ids(varios), ["USU_1", "USU_3"]);
  assert.deepEqual(destinatarios(aviso({ publico: { tipo: "PAPEIS", valores: ["DIRETOR"] } }), USUARIOS), []);
});

test("destinatarios resolve público USUARIOS sem duplicar", () => {
  const avisoUsuarios = aviso({ publico: { tipo: "USUARIOS", valores: ["USU_3", "USU_1", "USU_1", "USU_4"] } });
  assert.deepEqual(ids(destinatarios(avisoUsuarios, USUARIOS)), ["USU_1", "USU_3"]);
});

test("destinatarios resolve público VAGA por vagasIds e por vagaId", () => {
  const vaga2 = destinatarios(aviso({ publico: { tipo: "VAGA", valores: ["VAGA_2"] } }), USUARIOS);
  assert.deepEqual(ids(vaga2), ["USU_2", "USU_3"]);
  const comVagaUnica = [
    { id: "USU_9", vagaId: "VAGA_7", ativo: true },
    { id: "USU_10", vagaId: "VAGA_8", ativo: true },
  ];
  assert.deepEqual(ids(destinatarios(aviso({ publico: { tipo: "VAGA", valores: ["VAGA_7"] } }), comVagaUnica)), ["USU_9"]);
});

test("destinatarios fecha a porta para público inválido em vez de avisar todo mundo", () => {
  const quebrado = { titulo: "T", corpo: "C", publico: { tipo: "FANTASMA", valores: ["x"] } };
  assert.deepEqual(destinatarios(quebrado, USUARIOS), []);
  assert.deepEqual(destinatarios({ titulo: "T", corpo: "C" }, USUARIOS).length, 3);
});

test("registrarLeitura é idempotente e não muta o aviso recebido", () => {
  const original = aviso();
  const primeira = registrarLeitura(original, "USU_1", "2026-09-27T12:00:00.000Z");
  assert.deepEqual(primeira.leituras, [{ usuarioId: "USU_1", em: "2026-09-27T12:00:00.000Z" }]);
  assert.deepEqual(original.leituras, []);

  const segunda = registrarLeitura(primeira, "USU_1", "2026-09-27T15:00:00.000Z");
  assert.equal(segunda, primeira, "segunda leitura deveria devolver o mesmo aviso");
  assert.equal(segunda.leituras.length, 1);
  assert.equal(segunda.leituras[0].em, "2026-09-27T12:00:00.000Z");

  const terceira = registrarLeitura(segunda, "USU_2", "2026-09-27T16:00:00.000Z");
  assert.deepEqual(terceira.leituras.map((l) => l.usuarioId), ["USU_1", "USU_2"]);
  assert.equal(segunda.leituras.length, 1);

  assert.equal(registrarLeitura(primeira, null), primeira);
  assert.equal(registrarLeitura(primeira, ""), primeira);
});

test("leituraPorUsuario calcula taxa sobre o público-alvo", () => {
  const original = aviso({ publico: { tipo: PUBLICO_ALVO.TODOS } });
  let lido = registrarLeitura(original, "USU_1", "2026-09-27T12:00:00.000Z");
  lido = registrarLeitura(lido, "USU_2", "2026-09-27T12:05:00.000Z");
  // Leitura de quem está fora do público (inativo) não entra na conta.
  lido = registrarLeitura(lido, "USU_4", "2026-09-27T12:10:00.000Z");

  const resultado = leituraPorUsuario(lido, USUARIOS);
  assert.equal(resultado.total, 3);
  assert.deepEqual(resultado.lidos, ["USU_1", "USU_2"]);
  assert.deepEqual(resultado.naoLidos, ["USU_3"]);
  assert.equal(resultado.taxaLeitura, 0.6667);
});

test("leituraPorUsuario trata extremos: ninguém leu, todos leram, público vazio", () => {
  const todos = aviso();
  assert.equal(leituraPorUsuario(todos, USUARIOS).taxaLeitura, 0);

  let lido = todos;
  for (const usuario of ["USU_1", "USU_2", "USU_3"]) lido = registrarLeitura(lido, usuario, "2026-09-27T12:00:00.000Z");
  const completo = leituraPorUsuario(lido, USUARIOS);
  assert.equal(completo.taxaLeitura, 1);
  assert.deepEqual(completo.naoLidos, []);

  const restrito = aviso({ publico: { tipo: "USUARIOS", valores: ["USU_1", "USU_2"] } });
  const meio = leituraPorUsuario(registrarLeitura(restrito, "USU_1"), USUARIOS);
  assert.equal(meio.total, 2);
  assert.equal(meio.taxaLeitura, 0.5);

  const vazio = leituraPorUsuario(aviso({ publico: { tipo: "USUARIOS", valores: [] } }), USUARIOS);
  assert.deepEqual(vazio, { total: 0, lidos: [], naoLidos: [], taxaLeitura: 0 });
});

test("avisosVigentes filtra por vigência nas duas pontas", () => {
  const avisos = [
    aviso({ id: "A1", vigencia: { de: "2026-09-01", ate: "2026-09-30" } }),
    aviso({ id: "A2", vigencia: { de: "2026-10-01", ate: "2026-10-31" } }),
    aviso({ id: "A3", vigencia: { de: "2026-08-01", ate: "2026-08-31" } }),
    aviso({ id: "A4", vigencia: { de: "2026-09-01", ate: null } }),
    aviso({ id: "A5", vigencia: { de: "2026-09-27", ate: "2026-09-27" } }),
  ];
  assert.deepEqual(avisosVigentes(avisos, "2026-09-27").map((a) => a.id), ["A1", "A4", "A5"]);
  assert.deepEqual(avisosVigentes(avisos, "2026-08-15").map((a) => a.id), ["A3"]);
  assert.deepEqual(avisosVigentes([], "2026-09-27"), []);
});

test("avisosVencendo usa estaVencendo do core e ordena pelo que vence antes", () => {
  const avisos = [
    aviso({ id: "A1", vigencia: { de: "2026-09-01", ate: "2026-09-30" } }),
    aviso({ id: "A2", vigencia: { de: "2026-10-01", ate: "2026-10-31" } }),
    aviso({ id: "A3", vigencia: { de: "2026-08-01", ate: "2026-08-31" } }),
    aviso({ id: "A4", vigencia: { de: "2026-09-01", ate: null } }),
  ];
  const resultado = avisosVencendo(avisos, 7, "2026-09-27");
  assert.deepEqual(resultado.map((r) => r.aviso.id), ["A3", "A1"]);
  assert.deepEqual(resultado.map((r) => r.urgencia), ["VENCIDO", "ALTA"]);
  assert.deepEqual(resultado.map((r) => r.diasRestantes), [-27, 3]);
  assert.equal(resultado[0].vencido, true);
  assert.equal(resultado[1].vencendo, true);
  assert.deepEqual(avisosVencendo([avisos[0], avisos[1]], 7, "2026-09-15").map((r) => r.aviso.id), []);
  assert.deepEqual(avisosVencendo([avisos[2]], 7, "2026-09-15").map((r) => r.urgencia), ["VENCIDO"]);
});

test("ordenarAvisos põe URGENTE primeiro, depois fixado, depois o mais recente", () => {
  const urgente = aviso({ id: "A_URGENTE", prioridade: "URGENTE", criadoEm: "2026-09-01T10:00:00.000Z" });
  const fixado = aviso({ id: "B_FIXADO", fixado: true, criadoEm: "2026-09-02T10:00:00.000Z" });
  const recente = aviso({ id: "C_NORMAL", criadoEm: "2026-09-05T10:00:00.000Z" });
  const antigo = aviso({ id: "D_NORMAL_ANTIGO", criadoEm: "2026-09-03T10:00:00.000Z" });
  const baixa = aviso({ id: "E_BAIXA", prioridade: "BAIXA", criadoEm: "2026-09-09T10:00:00.000Z" });

  const esperado = ["A_URGENTE", "B_FIXADO", "C_NORMAL", "D_NORMAL_ANTIGO", "E_BAIXA"];
  assert.deepEqual(ordenarAvisos([baixa, antigo, recente, fixado, urgente]).map((a) => a.id), esperado);
  assert.deepEqual(ordenarAvisos([urgente, fixado, recente, antigo, baixa]).map((a) => a.id), esperado);
  assert.deepEqual(ordenarAvisos([recente, urgente, baixa, fixado, antigo]).map((a) => a.id), esperado);
});

test("ordenarAvisos não muta a entrada e desempata pelo id", () => {
  const entrada = [
    aviso({ id: "Z_1", criadoEm: "2026-09-01T10:00:00.000Z" }),
    aviso({ id: "A_1", criadoEm: "2026-09-01T10:00:00.000Z" }),
  ];
  const copia = [...entrada];
  const ordenado = ordenarAvisos(entrada);
  assert.deepEqual(ordenado.map((a) => a.id), ["A_1", "Z_1"]);
  assert.deepEqual(entrada.map((a) => a.id), copia.map((a) => a.id));
  assert.deepEqual(ordenarAvisos([]), []);
  assert.deepEqual(ordenarAvisos(null), []);
});

test("ordenarAvisos é determinística para avisos idênticos em prioridade", () => {
  const lote = ["M_3", "M_1", "M_2"].map((id) =>
    aviso({ id, prioridade: "ALTA", fixado: false, criadoEm: "2026-09-04T10:00:00.000Z" })
  );
  const primeira = ordenarAvisos(lote).map((a) => a.id);
  const segunda = ordenarAvisos([...lote].reverse()).map((a) => a.id);
  assert.deepEqual(primeira, ["M_1", "M_2", "M_3"]);
  assert.deepEqual(primeira, segunda);
});
