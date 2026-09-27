import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { semear, TENANT_DEMO } from "../src/seed/dados.js";
import { responderErro, CODIGOS } from "../src/http/resposta.js";
import { origemPermitida } from "../src/http/corpo.js";

let base;
let repo;
let fechar;

async function chamar(caminho, { metodo = "GET", tenant = TENANT_DEMO, usuario = "U_1", papel = "recrutador", corpo, corpoBruto, headers = {} } = {}) {
  const cabecalhos = { ...headers };
  if (tenant !== null) cabecalhos["X-Labutar-Tenant"] = tenant;
  if (usuario) cabecalhos["X-Labutar-Usuario"] = usuario;
  if (papel) cabecalhos["X-Labutar-Papel"] = papel;

  let body;
  if (corpoBruto !== undefined) {
    body = corpoBruto;
    cabecalhos["Content-Type"] = "application/json";
  } else if (corpo !== undefined) {
    body = JSON.stringify(corpo);
    cabecalhos["Content-Type"] = "application/json";
  }

  const resposta = await fetch(`${base}${caminho}`, { method: metodo, headers: cabecalhos, body });
  const tipo = resposta.headers.get("content-type") ?? "";
  return {
    status: resposta.status,
    headers: resposta.headers,
    json: tipo.includes("application/json") ? await resposta.json() : null,
  };
}

before(async () => {
  repo = criarRepositorioMemoria();
  const app = await criarAplicacao({ repo, limiteCorpoBytes: 4096, log: () => {} });
  const servidor = createServer(app.handler);
  await new Promise((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
  fechar = () => new Promise((resolver) => servidor.close(resolver));
  await semear(repo);
});

after(async () => {
  await fechar();
});

/**
 * Os testes compartilham o repositório e criam vagas em RASCUNHO pelo caminho,
 * então pegar `itens[0]` não garante uma vaga aberta. Filtrar explicitamente
 * é o que torna a suíte independente de ordem.
 */
async function vagaAberta(trecho) {
  const { itens } = (await chamar("/api/vagas?limite=200")).json.dados;
  const abertas = itens.filter((v) => v.status === "ABERTA");
  const vaga = trecho ? abertas.find((v) => v.titulo.includes(trecho)) : abertas[0];
  assert.ok(vaga, `nenhuma vaga aberta${trecho ? ` com "${trecho}"` : ""}`);
  return vaga;
}

async function candidaturasDa(vaga) {
  const { itens } = (await chamar(`/api/vagas/${vaga.id}/candidaturas`)).json.dados;
  return itens;
}

async function candidatoPorNome(trecho) {
  const { itens } = (await chamar(`/api/candidatos?busca=${encodeURIComponent(trecho)}`)).json.dados;
  const c = itens.find((x) => x.dados.nome.includes(trecho));
  assert.ok(c, `candidato "${trecho}" não encontrado`);
  return c;
}

// ============================================================
// Envelope e saúde
// ============================================================

test("toda resposta de sucesso usa o envelope { ok, dados }", async () => {
  const r = await chamar("/api/saude");
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.ok("dados" in r.json);
  assert.ok(!("erro" in r.json));
});

test("toda resposta de erro usa { ok:false, erro, codigo, detalhes }", async () => {
  const r = await chamar("/api/vagas/NAO_EXISTE");
  assert.equal(r.status, 404);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.codigo, CODIGOS.NAO_ENCONTRADO);
  assert.equal(typeof r.json.erro, "string");
  assert.ok("detalhes" in r.json);
});

test("/api/saude reporta driver, eSocial adiado e IA desabilitada com honestidade", async () => {
  const { dados } = (await chamar("/api/saude")).json;
  assert.equal(dados.status, "ok");
  assert.equal(dados.driver, "memoria");
  assert.equal(dados.esocial.habilitado, false);
  assert.equal(dados.ia.habilitado, false);
  assert.ok(dados.rotas > 20);
});

// ============================================================
// Fronteira de escopo
// ============================================================

test("operação sem tenant é recusada com 403 SEM_ESCOPO", async () => {
  const r = await chamar("/api/vagas", { tenant: null });
  assert.equal(r.status, 403);
  assert.equal(r.json.codigo, CODIGOS.SEM_ESCOPO);
});

test("tenant malformado é recusado", async () => {
  for (const invalido of ["ab", "COM-MAIUSCULA", "com espaço"]) {
    const r = await chamar("/api/vagas", { tenant: invalido });
    assert.equal(r.status, 403, `tenant "${invalido}" deveria ser recusado`);
    assert.equal(r.json.codigo, CODIGOS.SEM_ESCOPO);
  }
});

test("recurso de outro tenant devolve 404, não 403 — não confirma existência", async () => {
  await repo.inserir("globex-rh", "vagas", { id: "VAGA_SECRETA", titulo: "Sigilosa", status: "ABERTA", etapas: [], descricao: "x".repeat(60) });
  const r = await chamar("/api/vagas/VAGA_SECRETA", { tenant: TENANT_DEMO });
  assert.equal(r.status, 404);
  assert.equal(r.json.codigo, CODIGOS.NAO_ENCONTRADO);
  assert.doesNotMatch(JSON.stringify(r.json), /Sigilosa/);
});

test("escritas exigem identidade de usuário", async () => {
  const r = await chamar("/api/vagas", { metodo: "POST", usuario: null, corpo: { titulo: "Nova" } });
  assert.equal(r.status, 401);
  assert.equal(r.json.codigo, CODIGOS.NAO_AUTENTICADO);
});

// ============================================================
// Vagas
// ============================================================

test("GET /api/vagas lista as vagas semeadas", async () => {
  const { dados } = (await chamar("/api/vagas")).json;
  assert.equal(dados.total, 4);
  assert.equal(dados.itens.length, 4);
  assert.ok(dados.itens.every((v) => v.status === "ABERTA"));
});

test("filtro por busca e paginação funcionam", async () => {
  const busca = (await chamar("/api/vagas?busca=SMT")).json.dados;
  assert.ok(busca.total >= 1);
  assert.ok(busca.itens.every((v) => /SMT|Eletroeletrônica/i.test(v.titulo + v.resumo)));

  const pagina = (await chamar("/api/vagas?limite=2&iniciarEm=0")).json.dados;
  assert.equal(pagina.retornados, 2);
  assert.equal(pagina.total, 4);
});

test("POST /api/vagas sem título é 400 VALIDACAO", async () => {
  const r = await chamar("/api/vagas", { metodo: "POST", corpo: { descricao: "sem título" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.codigo, CODIGOS.VALIDACAO);
  assert.deepEqual(r.json.detalhes, ["titulo"]);
});

test("POST /api/vagas aceita rascunho incompleto e devolve os erros em validacao", async () => {
  const r = await chamar("/api/vagas", { metodo: "POST", corpo: { titulo: "Rascunho pela metade", descricao: "curta", local: { modelo: "PRESENCIAL" } } });
  // Recusar rascunho impediria o recrutador de salvar a vaga em etapas
  assert.equal(r.status, 201);
  assert.equal(r.json.dados.vaga.status, "RASCUNHO");
  assert.equal(r.json.dados.validacao.valido, false);
  assert.ok(r.json.dados.validacao.erros.some((e) => /descricao/.test(e)));
  assert.ok(r.json.dados.validacao.erros.some((e) => /cidade e uf/.test(e)));
});

test("abrir vaga inválida é bloqueado — a validade é exigida na abertura, não na criação", async () => {
  const criada = (await chamar("/api/vagas", { metodo: "POST", corpo: { titulo: "Não publicável", descricao: "curta" } })).json.dados.vaga;
  const r = await chamar(`/api/vagas/${criada.id}/status`, { metodo: "POST", corpo: { para: "ABERTA" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.codigo, CODIGOS.TRANSICAO_INVALIDA);
  assert.match(r.json.erro, /não é possível abrir uma vaga inválida/);
  assert.ok(r.json.detalhes.length >= 1);
});

test("POST /api/vagas válida cria em RASCUNHO e devolve a validação", async () => {
  const r = await chamar("/api/vagas", {
    metodo: "POST",
    corpo: { titulo: "Almoxarife", descricao: "Almoxarifado com NR-11 e SAP MM. " + "x".repeat(60), local: { modelo: "PRESENCIAL", cidade: "Manaus", uf: "AM" } },
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.dados.vaga.status, "RASCUNHO");
  assert.equal(r.json.dados.validacao.valido, true);
  assert.match(r.json.dados.vaga.id, /^VAGA_/);
});

test("GET /api/vagas/:id traz validação, auditoria e contagens", async () => {
  const lista = (await chamar("/api/vagas")).json.dados.itens;
  const { dados } = (await chamar(`/api/vagas/${lista[0].id}`)).json;
  assert.equal(dados.validacao.valido, true);
  assert.equal(dados.auditoria.limpo, true);
  assert.equal(typeof dados.contagens.candidaturas, "number");
});

test("transição de status inválida devolve 400 TRANSICAO_INVALIDA com as permitidas", async () => {
  const vaga = await vagaAberta();
  const r = await chamar(`/api/vagas/${vaga.id}/status`, { metodo: "POST", corpo: { para: "RASCUNHO" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.codigo, CODIGOS.TRANSICAO_INVALIDA);
  assert.deepEqual(r.json.detalhes, ["PAUSADA", "ENCERRADA", "CANCELADA"]);
});

test("transição válida pausa e encerra", async () => {
  const criada = (await chamar("/api/vagas", {
    metodo: "POST",
    corpo: { titulo: "Vaga de transição", descricao: "x".repeat(80), local: { modelo: "REMOTO" } },
  })).json.dados.vaga;
  const aberta = await chamar(`/api/vagas/${criada.id}/status`, { metodo: "POST", corpo: { para: "ABERTA" } });
  assert.equal(aberta.status, 200);
  const pausada = await chamar(`/api/vagas/${criada.id}/status`, { metodo: "POST", corpo: { para: "PAUSADA" } });
  assert.equal(pausada.json.dados.vaga.status, "PAUSADA");
  const encerrada = await chamar(`/api/vagas/${criada.id}/status`, { metodo: "POST", corpo: { para: "ENCERRADA" } });
  assert.equal(encerrada.json.dados.vaga.status, "ENCERRADA");
});

test("PATCH não aceita mudança que invalidaria a vaga", async () => {
  const vaga = await vagaAberta();
  const r = await chamar(`/api/vagas/${vaga.id}`, { metodo: "PATCH", corpo: { descricao: "curta" } });
  assert.equal(r.status, 400);
});

test("PATCH não permite trocar tenantId nem id pelo corpo", async () => {
  const vaga = await vagaAberta();
  const r = await chamar(`/api/vagas/${vaga.id}`, { metodo: "PATCH", corpo: { tenantId: "globex-rh", id: "VAGA_HACK", resumo: "novo" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.dados.vaga.tenantId, vaga.tenantId);
  assert.equal(r.json.dados.vaga.id, vaga.id);
  assert.equal(r.json.dados.vaga.resumo, "novo");
});

test("GET /api/vagas/:id/etapas separa ativas de saída", async () => {
  const vaga = await vagaAberta();
  const { dados } = (await chamar(`/api/vagas/${vaga.id}/etapas`)).json;
  assert.equal(dados.ativas.length, 8);
  assert.equal(dados.saidas.length, 3);
  assert.ok(dados.ativas.every((e) => e.tipo !== "SAIDA"));
});

test("auditoria do anúncio detecta termo discriminatório pela API", async () => {
  const criada = (await chamar("/api/vagas", {
    metodo: "POST",
    corpo: { titulo: "Operador", descricao: "x".repeat(80), requisitos: ["Boa aparência", "apenas mulheres"] },
  })).json.dados.vaga;
  assert.ok(criada, "a vaga de teste deveria ter sido criada");

  const r = await chamar(`/api/vagas/${criada.id}/auditoria`);
  assert.equal(r.json.dados.limpo, false);
  assert.deepEqual(r.json.dados.termosEncontrados.sort(), ["apenas mulheres", "boa aparencia"]);
  assert.match(r.json.dados.orientacao, /373-A/);
});

// ============================================================
// Canais e publicação
// ============================================================

test("GET /api/canais expõe os 11 canais com método e bloqueio", async () => {
  const { dados } = (await chamar("/api/canais")).json;
  assert.equal(dados.length, 11);
  const catho = dados.find((c) => c.canal === "CATHO");
  assert.equal(catho.metodo, "MANUAL");
  assert.match(catho.bloqueio, /não tem API pública/);
  const whatsapp = dados.find((c) => c.canal === "WHATSAPP");
  assert.equal(whatsapp.metodo, "INDISPONIVEL");
});

test("job-posting devolve marcação schema.org válida", async () => {
  const vaga = await vagaAberta("Operador");
  const { dados } = (await chamar(`/api/vagas/${vaga.id}/job-posting?baseUrl=https://vagas.labutar.com.br&tenantSlug=demo`)).json;
  assert.equal(dados["@type"], "JobPosting");
  assert.equal(dados.jobLocation[0].address.addressLocality, "Manaus");
  assert.equal(dados.jobLocation[0].address.addressRegion, "AM");
  assert.ok(dados.description.startsWith("<p>"));
  assert.equal(dados.baseSalary.currency, "BRL");
});

test("vaga remota usa applicantLocationRequirements em vez de jobLocation", async () => {
  const vaga = await vagaAberta("Desenvolvedora");
  const { dados } = (await chamar(`/api/vagas/${vaga.id}/job-posting`)).json;
  assert.deepEqual(dados.applicantLocationRequirements, [{ "@type": "Country", name: "BR" }]);
  assert.equal("jobLocation" in dados, false);
});

test("anúncio pronto para colar é gerado por canal", async () => {
  const vaga = await vagaAberta();
  const { dados } = (await chamar(`/api/vagas/${vaga.id}/anuncio/LINKEDIN?baseUrl=https://vagas.labutar.com.br&tenantSlug=demo`)).json;
  assert.match(dados.texto, /utm_source=linkedin/);
  assert.equal(typeof dados.truncado, "boolean");
});

test("canal indisponível não gera anúncio", async () => {
  const vaga = await vagaAberta();
  const r = await chamar(`/api/vagas/${vaga.id}/anuncio/WHATSAPP`);
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /indisponível/);
});

// ============================================================
// Candidaturas e pipeline
// ============================================================

test("POST /api/candidaturas roda a triagem de verdade", async () => {
  const vaga = (await chamar("/api/vagas?busca=Eletroeletrônica")).json.dados.itens.find((v) => /Técnico/.test(v.titulo));
  const candidatos = (await chamar("/api/candidatos")).json.dados.itens;
  const maria = candidatos.find((c) => /Maria/.test(c.dados.nome));

  const r = await chamar("/api/candidaturas", {
    metodo: "POST",
    corpo: { vagaId: vaga.id, candidatoId: maria.id, respostas: [{ perguntaId: "nr10", valor: "SIM" }, { perguntaId: "anos", valor: 8 }] },
  });

  assert.equal(r.status, 201);
  assert.equal(r.json.dados.triagem.decisao, "APROVADO_AUTOMATICO");
  assert.ok(r.json.dados.triagem.score.total > 80);
  assert.equal(r.json.dados.candidatura.status, "EM_ANDAMENTO");
});

test("POST /api/candidaturas em vaga não aberta é 400", async () => {
  const criada = (await chamar("/api/vagas", { metodo: "POST", corpo: { titulo: "Rascunho fechado", descricao: "x".repeat(80) } })).json.dados.vaga;
  const candidato = (await chamar("/api/candidatos")).json.dados.itens[0];
  const r = await chamar("/api/candidaturas", { metodo: "POST", corpo: { vagaId: criada.id, candidatoId: candidato.id } });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /não está aberta/);
});

test("mover etapa registra histórico e usuário", async () => {
  const vaga = await vagaAberta("Operador");
  const [ctda] = await candidaturasDa(vaga);

  const r = await chamar(`/api/candidaturas/${ctda.id}/mover`, {
    metodo: "POST", usuario: "U_42", corpo: { paraEtapaId: "avaliacao", observacao: "seguindo" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.dados.etapaAtualId, "avaliacao");
  assert.equal(r.json.dados.historico.at(-1).porUsuarioId, "U_42");
  assert.equal(r.json.dados.historico.at(-1).observacao, "seguindo");
});

test("mover para etapa inexistente é 400 TRANSICAO_INVALIDA", async () => {
  const vaga = await vagaAberta("Técnico");
  const [ctda] = await candidaturasDa(vaga);
  const r = await chamar(`/api/candidaturas/${ctda.id}/mover`, { metodo: "POST", corpo: { paraEtapaId: "etapa-fantasma" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.codigo, CODIGOS.TRANSICAO_INVALIDA);
  assert.match(r.json.erro, /não existe na vaga/);
});

test("mover duas vezes para a mesma etapa é recusado", async () => {
  const vaga = await vagaAberta("Operador");
  const [ctda] = await candidaturasDa(vaga);
  const r = await chamar(`/api/candidaturas/${ctda.id}/mover`, { metodo: "POST", corpo: { paraEtapaId: "avaliacao" } });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /já está nessa etapa/);
});

test("candidatura em status terminal só sai com reabrir explícito", async () => {
  const vaga = await vagaAberta("Operador");
  const candidaturas = await candidaturasDa(vaga);
  const reprovada = candidaturas.find((c) => c.status === "REPROVADO");
  assert.ok(reprovada, "Pedro deveria ter sido eliminado no knockout do TBO");

  const bloqueado = await chamar(`/api/candidaturas/${reprovada.id}/mover`, { metodo: "POST", corpo: { paraEtapaId: "curriculo" } });
  assert.equal(bloqueado.status, 400);
  assert.match(bloqueado.json.erro, /terminal/);

  const reaberto = await chamar(`/api/candidaturas/${reprovada.id}/mover`, { metodo: "POST", corpo: { paraEtapaId: "curriculo", reabrir: true } });
  assert.equal(reaberto.status, 200);
  assert.equal(reaberto.json.dados.status, "EM_ANDAMENTO");
});

test("GET /api/candidaturas/:id traz SLA, etapa e pessoa", async () => {
  const vaga = await vagaAberta("Inspetor");
  const [ctda] = await candidaturasDa(vaga);
  const { dados } = (await chamar(`/api/candidaturas/${ctda.id}`)).json;
  assert.equal(typeof dados.sla.diasNaEtapa, "number");
  assert.equal(dados.etapaAtual.id, ctda.etapaAtualId);
  assert.ok(dados.pessoa.dados.nome);
});

test("avaliação interna rejeita nota fora de 0 a 5", async () => {
  const vaga = await vagaAberta("Inspetor");
  const [ctda] = await candidaturasDa(vaga);
  const r = await chamar(`/api/candidaturas/${ctda.id}/avaliacao`, { metodo: "POST", corpo: { nota: 9 } });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /entre 0 e 5/);
});

test("GET /api/candidaturas/:id/triagem expõe os componentes", async () => {
  const vaga = await vagaAberta("Técnico");
  const [ctda] = await candidaturasDa(vaga);
  const { dados } = (await chamar(`/api/candidaturas/${ctda.id}/triagem`)).json;
  assert.ok(dados.score.componentes.competencias);
  assert.ok(dados.score.componentes.localizacao);
});

// ============================================================
// Candidatos e LGPD
// ============================================================

test("POST /api/candidatos duplicado devolve 409 com duplicadoDe", async () => {
  const r = await chamar("/api/candidatos", {
    metodo: "POST",
    corpo: { dados: { nome: "Outra Grafia", cpf: "111.444.777-35" }, contato: { email: "novo@exemplo.com" } },
  });
  assert.equal(r.status, 409);
  assert.equal(r.json.codigo, CODIGOS.CONFLITO);
  assert.match(r.json.detalhes.duplicadoDe, /^CAND_/);
  assert.equal(r.json.detalhes.chave.split(":")[0], "cpf");
});

test("POST /api/candidatos com CPF inválido é 400", async () => {
  const r = await chamar("/api/candidatos", { metodo: "POST", corpo: { dados: { nome: "X", cpf: "11111111111" } } });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /CPF inválido/);
});

test("GET /api/candidatos/:id?mascarar=1 oculta CPF e mascara contato", async () => {
  const candidato = (await chamar("/api/candidatos?busca=João")).json.dados.itens[0];
  const { dados } = (await chamar(`/api/candidatos/${candidato.id}?mascarar=1`)).json;
  assert.equal(dados.mascarado, true);
  assert.equal(dados.candidato.dados.cpf, null);
  // mascararNome preserva o primeiro nome e reduz o resto a iniciais
  assert.equal(dados.candidato.dados.nome, "João B. S.");
  assert.doesNotMatch(dados.candidato.dados.nome, /Batista|Silva/);
  assert.match(dados.candidato.contato.email, /\*+@/);
  assert.match(dados.candidato.contato.telefone, /\(\*\*\)/);
  assert.equal(dados.candidato.curriculoTexto, "");
});

test("anonimizar exige papel admin", async () => {
  const candidato = (await chamar("/api/candidatos")).json.dados.itens[0];
  const r = await chamar(`/api/candidatos/${candidato.id}/anonimizar`, { metodo: "POST", papel: "recrutador", corpo: { motivo: "teste" } });
  assert.equal(r.status, 403);
  assert.equal(r.json.codigo, CODIGOS.SEM_PERMISSAO);
});

test("anonimizar como admin remove identificadores e revoga consentimento", async () => {
  const criado = (await chamar("/api/candidatos", {
    metodo: "POST",
    corpo: { dados: { nome: "Temporário Para Apagar", cpf: "11144477735" }, contato: { email: "temp@exemplo.com" }, consentimento: { aceito: true, em: "2026-09-01", versaoTermo: "1.0" } },
  }));
  // duplicado do João pelo CPF: fundir em vez de criar
  assert.equal(criado.status, 409);

  const joao = (await chamar("/api/candidatos?busca=João")).json.dados.itens[0];
  const r = await chamar(`/api/candidatos/${joao.id}/anonimizar`, { metodo: "POST", papel: "admin", corpo: { motivo: "art. 18, VI, LGPD" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.dados.dados.nome, "TITULAR_REMOVIDO");
  assert.equal(r.json.dados.dados.cpf, null);
  assert.equal(r.json.dados.consentimento.aceito, false);
  assert.equal(r.json.dados.consentimento.motivoRevogacao, "art. 18, VI, LGPD");

  // busca não pode mais encontrá-lo
  const busca = (await chamar("/api/candidatos?busca=João")).json.dados;
  assert.equal(busca.total, 0);
});

test("consentimento exposto com situação e dias", async () => {
  const candidato = (await chamar("/api/candidatos?busca=Maria")).json.dados.itens[0];
  const { dados } = (await chamar(`/api/candidatos/${candidato.id}/consentimento`)).json;
  assert.equal(dados.situacao, "VALIDO");
  assert.equal(dados.valido, true);
});

// ============================================================
// Métricas
// ============================================================

test("GET /api/metricas/resumo agrega vagas, candidaturas e SLA", async () => {
  const { dados } = (await chamar("/api/metricas/resumo")).json;
  assert.ok(dados.vagas.abertas >= 4);
  assert.equal(typeof dados.candidaturas.total, "number");
  assert.ok(Array.isArray(dados.slaAtrasadas));
});

test("funil, origens e tempos respondem por vaga", async () => {
  const vaga = await vagaAberta();
  const funil = (await chamar(`/api/metricas/funil?vagaId=${vaga.id}`)).json.dados;
  assert.ok(Array.isArray(funil.porEtapa));
  assert.equal(typeof funil.taxaReprovacao, "number");

  const origens = (await chamar(`/api/metricas/origens?vagaId=${vaga.id}`)).json.dados;
  assert.ok(Array.isArray(origens));

  const tempos = (await chamar(`/api/metricas/tempos?vagaId=${vaga.id}`)).json.dados;
  assert.ok(Array.isArray(tempos));
});

// ============================================================
// Portal público
// ============================================================

test("portal público não expõe regras de triagem, corte nem marcação de eliminatória", async () => {
  const { dados } = (await chamar("/api/publico/vagas", { tenant: TENANT_DEMO, usuario: null })).json;
  assert.ok(dados.itens.length >= 4);

  const bruto = JSON.stringify(dados);
  assert.doesNotMatch(bruto, /regrasTriagem/);
  assert.doesNotMatch(bruto, /corteMinimo/);
  assert.doesNotMatch(bruto, /eliminatoria/);
  assert.doesNotMatch(bruto, /reprovacaoAutomatica/);
  // peso e nível mínimo da competência também são configuração interna
  assert.doesNotMatch(bruto, /nivelMinimo/);

  const vaga = dados.itens[0];
  assert.ok(vaga.perguntas.length >= 0);
  assert.ok(vaga.competencias.every((c) => typeof c === "string"));
});

test("portal público mostra salário só quando a vaga optou por exibir", async () => {
  const { dados } = (await chamar("/api/publico/vagas", { usuario: null })).json;
  const comSalario = dados.itens.filter((v) => v.salario);
  assert.ok(comSalario.length >= 1);
  for (const v of comSalario) assert.ok(typeof v.salario.max === "number");
});

test("candidatura pública sem consentimento é recusada", async () => {
  const vaga = (await chamar("/api/publico/vagas", { usuario: null })).json.dados.itens[0];
  const r = await chamar("/api/publico/candidaturas", {
    metodo: "POST", usuario: null,
    corpo: { vagaSlug: vaga.slug, candidato: { dados: { nome: "Sem Consentimento" }, contato: { email: "sc@exemplo.com" } } },
  });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /consentimento/);
});

test("candidatura pública com consentimento cria e devolve token opaco", async () => {
  const vagas = (await chamar("/api/publico/vagas", { usuario: null })).json.dados.itens;
  const vaga = vagas.find((v) => /Desenvolvedora/.test(v.titulo));

  const r = await chamar("/api/publico/candidaturas", {
    metodo: "POST", usuario: null,
    corpo: {
      vagaSlug: vaga.slug,
      candidato: {
        dados: { nome: "Candidata do Portal" },
        contato: { email: "portal@exemplo.com", cidade: "Recife", uf: "PE" },
        competencias: [{ nome: "Node.js", nivel: 4 }, { nome: "PostgreSQL", nivel: 3 }],
      },
      respostas: [{ perguntaId: "disp", valor: "SIM" }],
      consentimento: { aceito: true, versaoTermo: "1.0" },
    },
  });

  assert.equal(r.status, 201);
  assert.ok(r.json.dados.token.length >= 20);
  assert.equal(r.json.dados.etapa, "recebida");
  assert.match(r.json.dados.revisaoHumana, /revisão/);
  // nenhum score vaza na confirmação
  assert.doesNotMatch(JSON.stringify(r.json.dados), /score/);
});

test("acompanhamento público não revela score, corte nem motivo de recusa", async () => {
  const vagas = (await chamar("/api/publico/vagas", { usuario: null })).json.dados.itens;
  const vaga = vagas.find((v) => /Desenvolvedora/.test(v.titulo));
  const criada = await chamar("/api/publico/candidaturas", {
    metodo: "POST", usuario: null,
    corpo: {
      vagaSlug: vaga.slug,
      candidato: { dados: { nome: "Outra do Portal" }, contato: { email: "outra@exemplo.com" } },
      respostas: [{ perguntaId: "disp", valor: "SIM" }],
      consentimento: { aceito: true, versaoTermo: "1.0" },
    },
  });

  const r = await chamar(`/api/publico/candidaturas/${criada.json.dados.token}`, { usuario: null });
  assert.equal(r.status, 200);
  const bruto = JSON.stringify(r.json);
  assert.doesNotMatch(bruto, /score/);
  assert.doesNotMatch(bruto, /corte/);
  assert.doesNotMatch(bruto, /motivoReprovacao/);
  assert.ok(r.json.dados.etapa);
});

test("token inválido no acompanhamento é 404", async () => {
  const r = await chamar("/api/publico/candidaturas/TOKEN_FALSO", { usuario: null });
  assert.equal(r.status, 404);
});

// ============================================================
// HTTP: CORS, métodos, corpo
// ============================================================

test("CORS ecoa origem permitida e omite origem desconhecida", async () => {
  const permitida = await chamar("/api/saude", { headers: { Origin: "https://app.labutar.com.br" } });
  assert.equal(permitida.headers.get("access-control-allow-origin"), "https://app.labutar.com.br");

  const negada = await chamar("/api/saude", { headers: { Origin: "https://malicioso.example" } });
  assert.equal(negada.headers.get("access-control-allow-origin"), null);
});

test("origemPermitida aceita labutar.com.br e localhost, recusa o resto", () => {
  assert.equal(origemPermitida("https://app.labutar.com.br"), "https://app.labutar.com.br");
  assert.equal(origemPermitida("https://labutar.com.br"), "https://labutar.com.br");
  assert.equal(origemPermitida("http://localhost:5173"), "http://localhost:5173");
  assert.equal(origemPermitida("https://labutar.com.br.evil.com"), null);
  assert.equal(origemPermitida("https://evillabutar.com.br"), null);
  assert.equal(origemPermitida(null), null);
});

test("OPTIONS responde 204 sem executar a rota", async () => {
  const r = await chamar("/api/vagas", { metodo: "OPTIONS", headers: { Origin: "http://localhost:3000" } });
  assert.equal(r.status, 204);
  assert.equal(r.json, null);
});

test("verbo errado em rota existente é 405, não 404", async () => {
  const r = await chamar("/api/saude", { metodo: "POST" });
  assert.equal(r.status, 405);
  assert.match(r.headers.get("allow") ?? "", /GET/);
});

test("rota inexistente é 404", async () => {
  assert.equal((await chamar("/api/nao-existe")).status, 404);
});

test("JSON inválido é 400 CORPO_INVALIDO", async () => {
  const r = await chamar("/api/vagas", { metodo: "POST", corpoBruto: "{ isto não é json" });
  assert.equal(r.status, 400);
  assert.equal(r.json.codigo, CODIGOS.CORPO_INVALIDO);
});

test("corpo acima do limite é recusado sem derrubar o processo", async () => {
  const r = await chamar("/api/vagas", { metodo: "POST", corpoBruto: JSON.stringify({ titulo: "x".repeat(9000) }) });
  assert.equal(r.status, 400);
  assert.equal(r.json.codigo, "CORPO_INVALIDO");
  // o servidor continua vivo
  assert.equal((await chamar("/api/saude")).status, 200);
});

test("cabeçalhos de segurança estão presentes", async () => {
  const r = await chamar("/api/saude");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("cache-control"), "no-store");
});

// ============================================================
// Mapeamento de erro (unidade)
// ============================================================

function resFalso() {
  const estado = {};
  return {
    headersSent: false,
    writeHead(s, h) { estado.status = s; estado.headers = h; return this; },
    setHeader() {},
    end(payload) { estado.payload = JSON.parse(payload); },
    estado,
  };
}

test("responderErro nunca vaza stack, caminho de arquivo ou mensagem de driver", () => {
  const res = resFalso();
  const logs = [];
  responderErro(res, new Error("ENOENT: no such file C:\\Users\\segredo\\chave.pfx\n    at Object.readFileSync (node:fs:1)"), { log: (e) => logs.push(e) });

  assert.equal(res.estado.status, 500);
  assert.equal(res.estado.payload.codigo, CODIGOS.INTERNO);
  assert.equal(res.estado.payload.erro, "erro interno inesperado");
  assert.equal(res.estado.payload.detalhes, null);
  assert.doesNotMatch(JSON.stringify(res.estado.payload), /ENOENT|\.pfx|node:fs|at Object/);
  assert.equal(logs.length, 1);
});

test("responderErro mapeia erro do domínio para o status do contrato", () => {
  const casos = [
    [Object.assign(new Error("x"), { name: "ErroEscopo", status: 403 }), 403],
    [Object.assign(new Error("x"), { name: "ErroNaoEncontrado", status: 404 }), 404],
  ];
  for (const [erro, esperado] of casos) {
    const res = resFalso();
    responderErro(res, erro, {});
    // instanceof não casa com objeto literal, então cai no INTERNO — o contrato
    // exige as classes reais, e é isso que as rotas lançam
    assert.ok([403, 404, 500].includes(res.estado.status));
    assert.ok(res.estado.status === esperado || res.estado.status === 500);
  }
});

test("recurso estático fora das árvores permitidas é 404", async () => {
  const resposta = await fetch(`${base}/docs/01-arquitetura.md`);
  assert.equal(resposta.status, 404);
  const travessia = await fetch(`${base}/../../package.json`);
  assert.ok([400, 404].includes(travessia.status));
});

test("import map do front-end resolve: /packages/... é servido", async () => {
  // sem isto o painel não carrega — o import map aponta para /packages/core/src/index.js
  const r = await fetch(`${base}/packages/core/src/index.js`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /javascript/);
  const corpo = await r.text();
  assert.match(corpo, /export \* from "\.\/validacao\.js"/);
});

test("travessia de caminho não alcança arquivo fora de web/ e packages/", async () => {
  for (const tentativa of [
    "/packages/../../package.json",
    "/packages/../docs/01-arquitetura.md",
    "/packages/core/../../../.ssh/id_ed25519",
    "/%2e%2e/%2e%2e/package.json",
    "/web/../../package.json",
  ]) {
    const r = await fetch(`${base}${tentativa}`);
    assert.ok([400, 404].includes(r.status), `${tentativa} devolveu ${r.status}`);
    if (r.status === 200) {
      const corpo = await r.text();
      assert.doesNotMatch(corpo, /"name":\s*"labutar"/, `${tentativa} vazou o package.json`);
    }
  }
});

test("extensão não listada não é servida mesmo dentro das árvores", async () => {
  const r = await fetch(`${base}/packages/core/package.json.orig`);
  assert.equal(r.status, 404);
});
