import test from "node:test";
import assert from "node:assert/strict";
import { calcularMedicao, calcularRetencoes, discriminacaoDoRPS } from "../src/index.js";

test("por colaborador: pro rata da admissão, glosa de falta e horas extras aprovadas", () => {
  const m = calcularMedicao({
    contrato: { id: "C1", faturamento: { modalidade: "POR_COLABORADOR", valor: 660_000 } }, competencia: "2026-09",
    colaboradores: [
      { matricula: "1", nome: "A", admissao: "2025-01-01" },
      { matricula: "2", nome: "B", admissao: "2026-09-16" },
      { matricula: "3", nome: "C", admissao: "2025-01-01", faltasDias: 2, horasExtras50: 10 },
      { matricula: "4", nome: "D", admissao: "2026-10-05" },
    ],
  });
  assert.equal(m.itens.length, 3);
  assert.equal(m.itens[0].valor, 660_000);
  assert.equal(m.itens[1].valor, 330_000); // 15/30
  assert.equal(m.itens[2].detalhe.glosa, 44_000);
  assert.equal(m.itens[2].detalhe.extras, 45_000); // 10 h × 660.000/220 × 1,5
  assert.equal(m.valorBruto, 660_000 + 330_000 + 660_000 - 44_000 + 45_000);
});

test("custo + taxa e valor fixo", () => {
  const t = calcularMedicao({ contrato: { faturamento: { modalidade: "TAXA_SOBRE_CUSTO", taxaPercentual: 30 } }, competencia: "2026-09", colaboradores: [{ matricula: "1", nome: "A", custo: 400_000 }, { matricula: "2", nome: "B", custo: 0 }] });
  assert.equal(t.valorBruto, 520_000);
  assert.equal(calcularMedicao({ contrato: { faturamento: { modalidade: "VALOR_FIXO", valor: 1_000_000 } }, competencia: "2026-09" }).valorBruto, 1_000_000);
  assert.throws(() => calcularMedicao({ contrato: {}, competencia: "2026-09" }), /sem preço/);
});

test("retenções: INSS 11%, IRRF 1%, CSRF 4,65%, ISS e dispensa até R$ 10", () => {
  const r = calcularRetencoes(10_000_000);
  assert.deepEqual([r.inss, r.irrf, r.pis, r.cofins, r.csll, r.iss], [1_100_000, 100_000, 65_000, 300_000, 100_000, 500_000]);
  assert.equal(r.liquido, 10_000_000 - r.totalRetido);
  const pequeno = calcularRetencoes(20_000); // R$ 200: IRRF R$ 2,00 e CSRF R$ 9,30
  assert.equal(pequeno.irrf, 0);
  assert.equal(pequeno.pis + pequeno.cofins + pequeno.csll, 0);
  assert.equal(pequeno.avisos.length, 2);
  assert.equal(calcularRetencoes(100_000, { issRetido: false }).iss, 0);
  assert.match(discriminacaoDoRPS({ contrato: { id: "C1", tipo: "TRABALHO_TEMPORARIO" }, tomador: { razaoSocial: "T" }, competencia: "2026-09", medicao: { itens: [1] }, retencoes: r }), /Lei 6\.019\/1974/);
});
