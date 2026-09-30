import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEM_ALOCACAO,
  TIPO_ALOCACAO,
  diasDaCompetencia,
  distribuirCentavos,
  ratearCompetencia,
  ratearValor,
} from "../src/index.js";

const postos = [
  { id: "POS_A", contratoId: "CTR_1", tomadorId: "TOM_1" },
  { id: "POS_B", contratoId: "CTR_2", tomadorId: "TOM_2" },
  { id: "POS_C", contratoId: "CTR_2", tomadorId: "TOM_2" },
];
const A = "TOM:TOM_1/CTR:CTR_1/POS:POS_A";
const B = "TOM:TOM_2/CTR:CTR_2/POS:POS_B";
const C = "TOM:TOM_2/CTR:CTR_2/POS:POS_C";

test("dias da competência respeitam o tamanho do mês", () => {
  assert.equal(diasDaCompetencia("2026-02").length, 28);
  assert.equal(diasDaCompetencia("2028-02").length, 29);
  assert.equal(diasDaCompetencia("2026-09").at(-1), "2026-09-30");
  assert.throws(() => diasDaCompetencia("2026-13"));
});

test("terceirizado que troca de tomador no meio do mês divide o custo", () => {
  const vinculo = { id: "V1", admissao: "2025-01-01" };
  const alocacoes = [
    { vinculoId: "V1", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_A", inicio: "2025-01-01", fim: "2026-09-15" },
    { vinculoId: "V1", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_B", inicio: "2026-09-16" },
  ];
  const r = ratearCompetencia({ vinculo, alocacoes, postos, competencia: "2026-09" });
  assert.equal(r.totalDias, 30);
  assert.deepEqual(r.linhas.map((l) => [l.centroDeCusto, l.dias]), [[A, 15], [B, 15]]);
});

test("cobertura de folguista vai para o posto coberto", () => {
  const vinculo = { id: "V2", admissao: "2025-01-01" };
  const alocacoes = [
    { vinculoId: "V2", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_B", inicio: "2025-01-01" },
    { vinculoId: "V2", tipo: TIPO_ALOCACAO.COBERTURA, postoId: "POS_C", inicio: "2026-09-10", fim: "2026-09-12" },
  ];
  const r = ratearCompetencia({ vinculo, alocacoes, postos, competencia: "2026-09" });
  assert.deepEqual(r.linhas.map((l) => [l.centroDeCusto, l.dias]), [[B, 27], [C, 3]]);
});

test("admissão no meio do mês e dias sem alocação aparecem separados", () => {
  const vinculo = { id: "V3", admissao: "2026-09-21" };
  const alocacoes = [{ vinculoId: "V3", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_A", inicio: "2026-09-24" }];
  const r = ratearCompetencia({ vinculo, alocacoes, postos, competencia: "2026-09" });
  assert.equal(r.totalDias, 10);
  assert.deepEqual(r.linhas.map((l) => [l.centroDeCusto, l.dias]), [[A, 7], [SEM_ALOCACAO, 3]]);
});

test("desligamento encerra a contagem", () => {
  const vinculo = { id: "V4", admissao: "2025-01-01", desligamento: "2026-09-10" };
  const alocacoes = [{ vinculoId: "V4", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_A", inicio: "2025-01-01" }];
  assert.equal(ratearCompetencia({ vinculo, alocacoes, postos, competencia: "2026-09" }).totalDias, 10);
});

test("distribuição em centavos nunca perde nem cria dinheiro", () => {
  assert.deepEqual(distribuirCentavos(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(distribuirCentavos(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(distribuirCentavos(0, [1, 2]), [0, 0]);
  for (const [total, pesos] of [[312_345, [15, 15]], [250_001, [27, 3]], [99, [7, 11, 13]], [1, [1, 1, 1, 1]]]) {
    const partes = distribuirCentavos(total, pesos);
    assert.equal(partes.reduce((s, v) => s + v, 0), total, `soma de ${total} em ${pesos}`);
  }
  assert.throws(() => distribuirCentavos(10.5, [1]));
  assert.throws(() => distribuirCentavos(10, [0, 0]));
});

test("salário do mês rateado pelos dias em cada tomador fecha no centavo", () => {
  const vinculo = { id: "V1", admissao: "2025-01-01" };
  const alocacoes = [
    { vinculoId: "V1", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_A", inicio: "2025-01-01", fim: "2026-09-15" },
    { vinculoId: "V1", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_B", inicio: "2026-09-16" },
  ];
  const rateio = ratearCompetencia({ vinculo, alocacoes, postos, competencia: "2026-09" });
  const valores = ratearValor(250_001, rateio);
  assert.deepEqual(valores, [{ centroDeCusto: A, centavos: 125_001 }, { centroDeCusto: B, centavos: 125_000 }]);
});

test("dias depois do fim do contrato não são cobrados do cliente, mesmo com alocação aberta", () => {
  const vinculo = { id: "V5", admissao: "2025-01-01" };
  const alocacoes = [{ vinculoId: "V5", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_A", inicio: "2025-01-01" }];
  const contratos = [{ id: "CTR_1", fim: "2026-09-20" }];
  const r = ratearCompetencia({ vinculo, alocacoes, postos, contratos, competencia: "2026-09" });
  assert.deepEqual(r.linhas.map((l) => [l.centroDeCusto, l.dias]), [[A, 20], [SEM_ALOCACAO, 10]]);
});
