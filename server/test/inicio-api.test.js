import test, { before } from "node:test";
import assert from "node:assert/strict";

import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";
import { pendenciasDoInicio, competenciaEmTrabalho } from "../src/rotas-inicio.js";
import { PERFIS_PADRAO, acessoEfetivo } from "../../packages/acesso/src/index.js";

let repo;
const acesso = (id) => acessoEfetivo({ ativo: true }, PERFIS_PADRAO.find((p) => p.id === id));
const DATA = "2026-10-08";

before(async () => {
  repo = criarRepositorioMemoria();
  await semear(repo);
  await semearFolha(repo, TENANT_DEMO);
});

test("competência em trabalho é a do mês anterior", () => {
  assert.equal(competenciaEmTrabalho("2026-10-08"), "2026-09");
  assert.equal(competenciaEmTrabalho("2027-01-05"), "2026-12");
});

test("DP: folha aberta, ponto e admissão; nada do financeiro nem da clínica", async () => {
  const r = await pendenciasDoInicio(repo, TENANT_DEMO, acesso("ANALISTA_DP"), DATA);
  const titulos = r.itens.map((i) => i.titulo);
  assert.ok(titulos.includes("Folha de 09/2026 aberta"));
  assert.ok(r.itens.some((i) => i.modulo === "ponto" && /a enviar ao tomador/.test(i.titulo) && i.quantidade > 0));
  assert.ok(r.itens.some((i) => i.modulo === "admissao" && i.titulo === "Admissões em andamento"));
  assert.ok(!r.itens.some((i) => i.modulo === "financeiro" || i.modulo === "clinica"));
  // Prioridade alta primeiro.
  const ordem = r.itens.map((i) => i.prioridade);
  assert.deepEqual(ordem, [...ordem].sort((a, b) => ["ALTA", "MEDIA", "INFO"].indexOf(a) - ["ALTA", "MEDIA", "INFO"].indexOf(b)));
  assert.ok(r.itens.every((i) => i.quantidade !== 0 && i.link.startsWith("#/")));
});

test("Financeiro: medições a enviar; gestor de RH vê CA vencido; médico vê ASO", async () => {
  const fin = await pendenciasDoInicio(repo, TENANT_DEMO, acesso("FINANCEIRO"), DATA);
  assert.ok(fin.itens.some((i) => /Medições de 09\/2026 a enviar/.test(i.titulo)));
  assert.ok(!fin.itens.some((i) => i.modulo === "folha" && /aberta/.test(i.titulo)));
  const rh = await pendenciasDoInicio(repo, TENANT_DEMO, acesso("GERENTE_RH"), DATA);
  assert.ok(rh.itens.some((i) => i.titulo === "EPI com CA vencido" && /Luva/.test(i.detalhe)));
  const med = await pendenciasDoInicio(repo, TENANT_DEMO, acesso("MEDICO_TRABALHO"), DATA);
  assert.ok(med.itens.every((i) => ["clinica", "sst", "colaboradores"].includes(i.modulo)));
});
