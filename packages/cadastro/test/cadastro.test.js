import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarPessoa, contagemDeDependentes, validarTomador, validarContratoTomador, validarPosto,
  validarVinculo, alterarSalario, salarioNaData, colaboradorDaFolha, lerPlanilhaColaboradores,
} from "../src/index.js";

const TOMADOR = { id: "TOM1", cnpj: "11222333000181", razaoSocial: "Indústria Teste S.A.", municipio: "Manaus", uf: "AM" };
const CONTRATO_TEMP = { id: "CTR1", tomadorId: "TOM1", tipo: "TRABALHO_TEMPORARIO", inicio: "2026-01-01", fim: "2026-12-31", hipotese: "DEMANDA_COMPLEMENTAR", justificativa: "Pico de produção do segundo semestre" };
const CONTRATO_SERV = { id: "CTR2", tomadorId: "TOM1", tipo: "PRESTACAO_SERVICOS", inicio: "2025-01-01" };
const POSTO = { id: "POS1", contratoId: "CTR1", funcao: "Montador", vagas: 10, salarioReferencia: 190_000, insalubridadeGrau: 20, local: { uf: "AM", municipio: "Manaus" } };
const PESSOA = { id: "PES1", nome: "Maria Teste Silva", cpf: "52998224725", dependentes: [] };

test("pessoa: nome completo, CPF válido ou pendente, dependentes", () => {
  assert.equal(validarPessoa({ nome: "Maria" }).ok, false);
  const sem = validarPessoa({ nome: "Maria Silva" });
  assert.equal(sem.ok, true);
  assert.match(sem.avisos.join(" "), /CPF não informado/);
  assert.equal(validarPessoa({ nome: "Maria Silva", cpf: "111.111.111-11" }).ok, false);
  const dep = validarPessoa({ nome: "Maria Silva", cpf: "529.982.247-25", dependentes: [{ nome: "João Silva", parentesco: "FILHO", deduzIR: true }] });
  assert.equal(dep.pessoa.cpf, "52998224725");
  assert.match(dep.avisos.join(" "), /23\/11\/2026/);
});

test("dependentes que contam no mês: IRRF e salário-família até 14 anos", () => {
  const p = { dependentes: [
    { parentesco: "FILHO", nascimento: "2015-10-15", deduzIR: true, salarioFamilia: true },
    { parentesco: "FILHO", nascimento: "2012-09-01", deduzIR: true, salarioFamilia: true },
    { parentesco: "CONJUGE", deduzIR: false },
  ] };
  assert.deepEqual(contagemDeDependentes(p, "2026-09"), { dependentesIR: 2, filhosSalarioFamilia: 1 });
});

test("tomador, contrato e posto validados", () => {
  assert.equal(validarTomador(TOMADOR).ok, true);
  assert.equal(validarTomador({ ...TOMADOR, cnpj: "11222333000182" }).ok, false);
  assert.equal(validarContratoTomador(CONTRATO_TEMP).ok, true);
  assert.match(validarContratoTomador({ ...CONTRATO_TEMP, hipotese: null }).erros.join(), /hipótese/);
  assert.equal(validarPosto(POSTO).ok, true);
  assert.equal(validarPosto({ ...POSTO, insalubridadeGrau: 30 }).ok, false);
});

test("vínculo temporário: posto certo, prazos da Lei 6.019 e remuneração equivalente", () => {
  const ctx = { pessoa: PESSOA, posto: POSTO, contrato: CONTRATO_TEMP, tomador: TOMADOR, salarioMinimo: 162_100 };
  const base = { pessoaId: "PES1", tipo: "TEMPORARIO", admissao: "2026-03-02", cargo: "Montador", salario: 190_000, temporario: { fimPrevisto: "2026-08-28" } };
  assert.equal(validarVinculo(base, ctx).ok, true, validarVinculo(base, ctx).erros.join("; "));
  assert.match(validarVinculo({ ...base, salario: 180_000 }, ctx).erros.join(), /remuneração equivalente/);
  assert.match(validarVinculo({ ...base, temporario: { fimPrevisto: "2026-12-31" } }, ctx).erros.join(), /180|dias/);
  assert.match(validarVinculo({ ...base, tipo: "TERCEIRIZADO" }, ctx).erros.join(), /prestação de serviços/);
  const quarentena = validarVinculo({ ...base, admissao: "2026-09-01", temporario: { fimPrevisto: "2026-11-30" } }, {
    ...ctx, vinculosDaPessoa: [{ matricula: "2", tipo: "TEMPORARIO", tomadorCnpj: TOMADOR.cnpj, admissao: "2026-01-02", desligamento: "2026-06-30" }],
  });
  assert.equal(quarentena.ok, false);
  assert.match(quarentena.erros.join(), /2026-09-2/);
});

test("terceirizado ex-empregado do tomador respeita os 18 meses", () => {
  const r = validarVinculo(
    { pessoaId: "PES1", tipo: "TERCEIRIZADO", admissao: "2026-05-04", cargo: "Porteiro", salario: 180_000 },
    { pessoa: { ...PESSOA, empregosAnteriores: [{ cnpj: TOMADOR.cnpj, desligamento: "2025-12-01" }] }, posto: { ...POSTO, contratoId: "CTR2" }, contrato: CONTRATO_SERV, tomador: TOMADOR }
  );
  assert.match(r.erros.join(), /5-D/);
});

test("histórico salarial: vigência e salário na data", () => {
  const v = alterarSalario({ matricula: "1", admissao: "2026-01-05", salario: 200_000 }, { desde: "2026-07-01", valor: 215_000, motivo: "Dissídio" });
  assert.equal(salarioNaData(v, "2026-06-30"), 200_000);
  assert.equal(salarioNaData(v, "2026-09-30"), 215_000);
  assert.throws(() => alterarSalario(v, { desde: "2025-01-01", valor: 1, motivo: "x" }), /anterior à admissão/);
});

test("do cadastro para a folha: salário do mês, adicionais e local do posto", () => {
  const v = alterarSalario({ matricula: "20048217", tipo: "TEMPORARIO", tomadorId: "TOM1", admissao: "2026-03-02", salario: 190_000, cargo: "Montador" }, { desde: "2026-09-01", valor: 200_000, motivo: "Reajuste" });
  const c = colaboradorDaFolha({ vinculo: v, pessoa: PESSOA, posto: POSTO, tomador: TOMADOR }, "2026-09");
  assert.equal(c.salario, 200_000);
  assert.equal(c.lotacao, "TOM:TOM1");
  assert.equal(c.insalubridadeGrau, 20);
  assert.deepEqual(c.local, { uf: "AM", municipio: "Manaus" });
  assert.equal(c.cpf, "52998224725");
});

test("importação: valida cada linha e só aproveita as corretas", () => {
  const csv = [
    "matricula_anterior;nome;cpf;vinculo;admissao;cargo;salario;dependentes_ir;tomador_cnpj;setor",
    "005857;Caio Exemplo Nery;;Temporário;22/10/2020;Motorista de caminhão;2.628,68;1;11.222.333/0001-81;",
    "005885;Manoel Exemplo Souza;123;Temporário;26/10/2020;Vigia;1.319,61;0;11222333000181;",
    "000010;Ana Exemplo Lima;529.982.247-25;Próprio;01/02/2022;Analista de DP;4.800,00;0;;DP",
    "000011;Sem Tomador Exemplo;;Terceirizado;01/02/2022;Porteiro;1.800,00;0;;",
  ].join("\n");
  const r = lerPlanilhaColaboradores(csv);
  assert.equal(r.linhas.length, 2);
  assert.equal(r.erros.length, 2);
  assert.equal(r.linhas[0].vinculo.salario, 262_868);
  assert.equal(r.linhas[0].vinculo.admissao, "2020-10-22");
  assert.equal(r.linhas[0].vinculo.dependentesIRImportados, 1);
  assert.match(r.erros[0].erros.join(), /CPF inválido/);
  assert.match(r.erros[1].erros.join(), /CNPJ do tomador/);
  assert.match(lerPlanilhaColaboradores("nome;cpf\nx;y").erros[0].erros[0], /colunas obrigatórias/);
});

test("posto cheio impede a admissão", async () => {
  const { validarVinculo } = await import("../src/vinculos.js");
  const posto = { id: "P", contratoId: "C", funcao: "Montador", vagas: 1 };
  const contrato = { id: "C", tipo: "PRESTACAO_SERVICOS", inicio: "2026-01-01", fim: null };
  const r = validarVinculo(
    { pessoaId: "X", tipo: "TERCEIRIZADO", admissao: "2026-09-01", cargo: "Montador", salario: 200_000, postoId: "P" },
    { pessoa: { id: "X" }, posto, contrato, tomador: { id: "T", cnpj: "04567891000113" }, ocupados: 1, salarioMinimo: 162_100 }
  );
  assert.equal(r.ok, false);
  assert.match(r.erros.join(), /sem vaga livre \(1 de 1/);
});
