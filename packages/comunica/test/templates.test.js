import test from "node:test";
import assert from "node:assert/strict";

import {
  FILTROS,
  TEMPLATES_PADRAO,
  criarTemplate,
  listarVariaveis,
  montarMensagem,
  parsearExpressao,
  renderizar,
} from "../src/templates.js";
import { CANAIS } from "../src/canais.js";

function modelo(assunto, corpo, variaveis = []) {
  return criarTemplate({ nome: "Template de teste", canal: CANAIS.EMAIL, assunto, corpo, variaveis });
}

function render(corpo, contexto, assunto = "") {
  return renderizar(modelo(assunto, corpo, Object.keys(contexto)), contexto);
}

test("listarVariaveis extrai nomes sem filtros e sem repetição", () => {
  const texto = "Olá {{nome}}, vaga {{vaga.titulo|maiusculas}} — {{nome}} confirma em {{data|dataBR}}";
  assert.deepEqual(listarVariaveis(texto), ["nome", "vaga.titulo", "data"]);
  assert.deepEqual(listarVariaveis("texto sem variável"), []);
  assert.deepEqual(listarVariaveis(null), []);
});

test("parsearExpressao separa nome, filtros e argumentos", () => {
  assert.deepEqual(parsearExpressao("salario|moeda"), {
    nome: "salario",
    filtros: [{ nome: "moeda", argumento: null }],
  });
  assert.deepEqual(parsearExpressao(" x |truncar:10|maiusculas "), {
    nome: "x",
    filtros: [
      { nome: "truncar", argumento: "10" },
      { nome: "maiusculas", argumento: null },
    ],
  });
  // O argumento pode conter ":" (horários, URLs)
  assert.deepEqual(parsearExpressao("hora|padrao:09:00").filtros[0], { nome: "padrao", argumento: "09:00" });
});

test("criarTemplate acusa variável usada no texto e não declarada", () => {
  const template = modelo("Olá {{nome}}", "Sua vaga é {{tituloVaga}}", ["nome"]);
  assert.equal(template.valido, false);
  assert.deepEqual(
    template.problemas.map((p) => [p.tipo, p.variavel]),
    [["VARIAVEL_NAO_DECLARADA", "tituloVaga"]]
  );
});

test("criarTemplate acusa variável declarada e não usada", () => {
  const template = modelo("Olá {{nome}}", "Confirme sua presença.", ["nome", "cargo"]);
  assert.equal(template.valido, false);
  assert.deepEqual(
    template.problemas.map((p) => [p.tipo, p.variavel]),
    [["VARIAVEL_NAO_USADA", "cargo"]]
  );
});

test("criarTemplate acusa os dois lados ao mesmo tempo", () => {
  const template = modelo("", "Bem-vindo, {{nome}}!", ["cargo"]);
  const tipos = template.problemas.map((p) => p.tipo).sort();
  assert.deepEqual(tipos, ["VARIAVEL_NAO_DECLARADA", "VARIAVEL_NAO_USADA"]);
});

test("criarTemplate válido não gera problemas e aceita id explícito", () => {
  const template = criarTemplate({
    id: "tpl-fixo",
    nome: "Convite",
    canal: CANAIS.EMAIL,
    assunto: "Entrevista {{data}}",
    corpo: "Olá {{nome}}, sua entrevista é {{data}}.",
    variaveis: [
      { nome: "nome", descricao: "Nome do candidato", exemplo: "Maria" },
      "data",
    ],
  });
  assert.deepEqual(template.problemas, []);
  assert.equal(template.valido, true);
  assert.equal(template.id, "tpl-fixo");
  assert.deepEqual(template.usadas, ["data", "nome"]);
  assert.equal(template.variaveis[1].nome, "data");
  assert.equal(template.variaveis[0].descricao, "Nome do candidato");
});

test("criarTemplate gera id com prefixo TPL quando não informado", () => {
  const template = modelo("", "Corpo simples");
  assert.match(template.id, /^TPL_/);
});

test("criarTemplate acusa canal inválido, corpo vazio e variável duplicada", () => {
  const template = criarTemplate({
    nome: "Quebrado",
    canal: "POMBO_CORREIO",
    assunto: "Assunto",
    corpo: "   ",
    variaveis: ["nome", "nome"],
  });
  const tipos = template.problemas.map((p) => p.tipo).sort();
  // Corpo vazio também torna a variável declarada "não usada" — reportado uma vez por nome.
  assert.deepEqual(tipos, ["CANAL_INVALIDO", "CORPO_OBRIGATORIO", "VARIAVEL_DUPLICADA", "VARIAVEL_NAO_USADA"]);
  assert.equal(template.valido, false);
});

test("renderizar substitui variáveis simples em assunto e corpo", () => {
  const resultado = renderizar(
    modelo("Vaga {{titulo}}", "Olá, {{nome}}! Você se candidatou a {{titulo}}.", ["nome", "titulo"]),
    { nome: "Maria", titulo: "Analista de DP" }
  );
  assert.equal(resultado.ok, true);
  assert.equal(resultado.assunto, "Vaga Analista de DP");
  assert.equal(resultado.corpo, "Olá, Maria! Você se candidatou a Analista de DP.");
  assert.deepEqual(resultado.faltantes, []);
  assert.deepEqual(resultado.erros, []);
});

test("renderizar aplica filtros de caixa", () => {
  assert.equal(render("{{v|maiusculas}}", { v: "ana" }).corpo, "ANA");
  assert.equal(render("{{v|minusculas}}", { v: "ANA" }).corpo, "ana");
  assert.equal(render("{{v|capitalizar}}", { v: "maria da silva" }).corpo, "Maria Da Silva");
});

test("renderizar encadeia filtros na ordem escrita", () => {
  const resultado = render("{{titulo|truncar:10|maiusculas}}", { titulo: "desenvolvedora" });
  assert.equal(resultado.corpo, "DESENVOLV…");
  assert.equal(resultado.ok, true);
});

test("filtro dataBR usa formatarDataBR do core", () => {
  assert.equal(render("{{d|dataBR}}", { d: "2026-10-05" }).corpo, "05/10/2026");
  assert.equal(render("{{d|dataBR}}", { d: "2026-10-05T17:00:00.000Z" }).corpo, "05/10/2026");
});

test("filtro dataBR falha alto com data inválida", () => {
  const resultado = render("{{d|dataBR}}", { d: "05/10/2026" });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.erros[0].filtro, "dataBR");
  assert.equal(resultado.corpo.includes("{{"), false);
});

test("filtro moeda formata centavos no padrão brasileiro", () => {
  assert.ok(render("{{s|moeda}}", { s: 850000 }).corpo.includes("8.500,00"));
  assert.ok(render("{{s|moeda}}", { s: "850000" }).corpo.includes("8.500,00"));
  assert.ok(render("{{s|moeda}}", { s: "4.500,00" }).corpo.includes("4.500,00"));
});

test("filtro moeda rejeita valor que não é dinheiro", () => {
  const resultado = render("{{s|moeda}}", { s: "a combinar" });
  assert.equal(resultado.ok, false);
  assert.match(resultado.erros[0].mensagem, /Valor monetário inválido/);
});

test("filtros de mascaramento protegem dado pessoal (LGPD)", () => {
  assert.equal(render("{{v|cpf}}", { v: "11144477735" }).corpo, "***.444.777-**");
  assert.equal(render("{{v|telefone}}", { v: "11987654321" }).corpo, "(**) *****-4321");
  assert.equal(render("{{v|cep}}", { v: "01310-100" }).corpo, "*****-100");
  assert.equal(render("{{v|email}}", { v: "maria@exemplo.com" }).corpo, "ma***@exemplo.com");
  assert.equal(render("{{v|nome}}", { v: "Maria Souza" }).corpo, "Maria S.");
});

test("filtro de mascaramento não disfarça documento inválido", () => {
  const resultado = render("{{v|cpf}}", { v: "11144477736" });
  assert.equal(resultado.ok, false);
  assert.match(resultado.erros[0].mensagem, /CPF inválido/);
  assert.equal(resultado.corpo.includes("444"), false);
});

test("filtro truncar aceita tamanho e sufixo customizado", () => {
  assert.equal(render("{{v|truncar:8}}", { v: "recrutamento" }).corpo, "recruta…");
  assert.equal(render("{{v|truncar:8:...}}", { v: "recrutamento" }).corpo, "recru...");
  assert.equal(render("{{v|truncar:50}}", { v: "curto" }).corpo, "curto");
});

test("filtro truncar rejeita tamanho inválido", () => {
  assert.equal(render("{{v|truncar:abc}}", { v: "texto" }).ok, false);
  assert.equal(render("{{v|truncar:1}}", { v: "texto" }).ok, false);
});

test("filtro padrao assume o valor de reserva quando a variável vem vazia", () => {
  assert.equal(render("{{v|padrao:N/D}}", {}).corpo, "N/D");
  assert.equal(render("{{v|padrao:N/D}}", { v: "" }).corpo, "N/D");
  assert.equal(render("{{v|padrao:N/D}}", { v: null }).corpo, "N/D");
  assert.equal(render("{{v|padrao:N/D}}", { v: "10 dias" }).corpo, "10 dias");
});

test("filtro padrao encadeia com os demais e não conta como faltante", () => {
  const resultado = render("{{v|padrao:time de recrutamento|capitalizar}}", {});
  assert.equal(resultado.corpo, "Time De Recrutamento");
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.faltantes, []);
});

test("variável faltante sem padrao derruba ok e nunca vaza {{...}}", () => {
  const resultado = renderizar(
    modelo("Retorno {{nome}}", "Olá, {{nome}}! Sua entrevista é {{dataEntrevista}}.", ["nome", "dataEntrevista"]),
    { nome: "Maria" }
  );
  assert.equal(resultado.ok, false);
  assert.deepEqual(resultado.faltantes, ["dataEntrevista"]);
  assert.equal(resultado.corpo.includes("{{"), false);
  assert.equal(resultado.assunto.includes("{{"), false);
  assert.equal(resultado.corpo, "Olá, Maria! Sua entrevista é .");
});

test("filtro desconhecido é erro, não texto silencioso", () => {
  const resultado = render("{{v|gritar}}", { v: "oi" });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.erros[0].filtro, "gritar");
  assert.match(resultado.erros[0].mensagem, /Filtro desconhecido/);
  assert.equal(resultado.corpo, "");
});

test("objeto no contexto é recusado; array é juntado com vírgula", () => {
  const objeto = render("{{v}}", { v: { nome: "Maria" } });
  assert.equal(objeto.ok, false);
  assert.match(objeto.erros[0].mensagem, /recebeu um objeto/);

  const lista = render("{{v}}", { v: ["VT", "PLR", "plano de saúde"] });
  assert.equal(lista.ok, true);
  assert.equal(lista.corpo, "VT, PLR, plano de saúde");
});

test("caminho com ponto resolve no contexto aninhado", () => {
  const resultado = renderizar(
    modelo("", "{{vaga.titulo}} em {{vaga.local.cidade}}", ["vaga.titulo", "vaga.local.cidade"]),
    { vaga: { titulo: "Analista", local: { cidade: "São Paulo" } } }
  );
  assert.equal(resultado.corpo, "Analista em São Paulo");
  assert.equal(resultado.ok, true);

  const incompleto = render("{{vaga.titulo}}", {});
  assert.equal(incompleto.ok, false);
  assert.deepEqual(incompleto.faltantes, ["vaga.titulo"]);
});

test("expressão vazia é erro de template", () => {
  const resultado = render("Olá {{}}!", {});
  assert.equal(resultado.ok, false);
  assert.match(resultado.erros[0].mensagem, /Expressão inválida/);
  assert.equal(resultado.corpo, "Olá !");
});

test("renderizar aceita template sem assunto", () => {
  const resultado = renderizar({ canal: CANAIS.WHATSAPP, corpo: "Olá {{nome}}" }, { nome: "Maria" });
  assert.equal(resultado.assunto, "");
  assert.equal(resultado.corpo, "Olá Maria");
  assert.equal(resultado.ok, true);
});

test("todos os filtros declarados são funções", () => {
  for (const [nome, funcao] of Object.entries(FILTROS)) {
    assert.equal(typeof funcao, "function", `filtro ${nome} deveria ser função`);
  }
  for (const esperado of ["maiusculas", "minusculas", "capitalizar", "dataBR", "moeda", "cpf", "telefone", "cep", "truncar", "padrao"]) {
    assert.ok(FILTROS[esperado], `filtro ${esperado} ausente`);
  }
});

test("TEMPLATES_PADRAO tem pelo menos 8 templates e todos são válidos", () => {
  assert.ok(TEMPLATES_PADRAO.length >= 8, `esperados >= 8, vieram ${TEMPLATES_PADRAO.length}`);
  const esperados = [
    "candidatura-recebida",
    "triagem-aprovada",
    "convite-entrevista",
    "lembrete-entrevista-24h",
    "pedido-feedback-gestor",
    "proposta-enviada",
    "reprovacao-empatica",
    "boas-vindas-admissao",
  ];
  for (const id of esperados) {
    assert.ok(TEMPLATES_PADRAO.some((t) => t.id === id), `template ${id} ausente`);
  }
  for (const padrao of TEMPLATES_PADRAO) {
    const criado = criarTemplate(padrao);
    assert.deepEqual(criado.problemas, [], `problemas em ${padrao.id}: ${JSON.stringify(criado.problemas)}`);
    assert.equal(criado.valido, true);
  }
});

test("TEMPLATES_PADRAO renderiza sem pendência com o contexto de exemplo", () => {
  for (const padrao of TEMPLATES_PADRAO) {
    const contexto = Object.fromEntries(padrao.variaveis.map((v) => [v.nome, v.exemplo]));
    const resultado = renderizar(padrao, contexto);
    assert.deepEqual(resultado.faltantes, [], `faltantes em ${padrao.id}`);
    assert.deepEqual(resultado.erros, [], `erros em ${padrao.id}: ${JSON.stringify(resultado.erros)}`);
    assert.equal(resultado.ok, true, `${padrao.id} deveria renderizar`);
    assert.equal(resultado.corpo.includes("{{"), false);
  }
});

test("reprovação com empatia não revela pontuação, corte ou ranking", () => {
  const reprovacao = TEMPLATES_PADRAO.find((t) => t.id === "reprovacao-empatica");
  const contexto = Object.fromEntries(reprovacao.variaveis.map((v) => [v.nome, v.exemplo]));
  const { corpo, assunto } = renderizar(reprovacao, contexto);
  const texto = `${assunto} ${corpo}`.toLowerCase();
  const proibidas = ["score", "pontua", "classifica", "ranking", "nota", "corte", "posição", "colocado", "reprovado"];
  for (const palavra of proibidas) {
    assert.equal(texto.includes(palavra), false, `reprovação vazou "${palavra}"`);
  }
  assert.match(corpo, /banco de talentos/i);
});

test("TEMPLATES_PADRAO tem ids únicos e canais conhecidos", () => {
  const ids = TEMPLATES_PADRAO.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const padrao of TEMPLATES_PADRAO) {
    assert.ok(Object.values(CANAIS).includes(padrao.canal), `${padrao.id} com canal ${padrao.canal}`);
  }
});

test("montarMensagem devolve o descritor de envio completo", () => {
  const template = criarTemplate({
    id: "TPL_1",
    nome: "Convite",
    canal: CANAIS.EMAIL,
    assunto: "Entrevista {{data|dataBR}}",
    corpo: "Olá, {{nome}}!",
    variaveis: ["nome", "data"],
  });
  const { ok, mensagem, faltantes, erros } = montarMensagem(template, {
    contexto: { nome: "Maria", data: "2026-10-05" },
    destino: "  Maria@Exemplo.COM ",
    anexos: [{ nome: "proposta.pdf" }],
    metadata: { candidaturaId: "CTDA_1" },
  });
  assert.equal(ok, true);
  assert.deepEqual(faltantes, []);
  assert.deepEqual(erros, []);
  assert.deepEqual(mensagem, {
    canal: "EMAIL",
    destino: "maria@exemplo.com",
    assunto: "Entrevista 05/10/2026",
    corpo: "Olá, Maria!",
    anexos: [{ nome: "proposta.pdf" }],
    metadata: { candidaturaId: "CTDA_1", templateId: "TPL_1", urgencia: null, variaveisFaltantes: [] },
  });
});

test("montarMensagem falha com destino inválido e não esconde o motivo", () => {
  const template = modelo("Assunto", "Olá!", []);
  const resultado = montarMensagem(template, { destino: "1134567890" });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.mensagem.canal, "EMAIL");
  assert.match(resultado.erros[0].mensagem, /inválido|E-mail/i);
});

test("montarMensagem zera assunto em canal que não suporta", () => {
  const template = criarTemplate({
    nome: "Lembrete",
    canal: CANAIS.WHATSAPP,
    assunto: "Lembrete de entrevista",
    corpo: "Sua entrevista é amanhã.",
  });
  const { ok, mensagem } = montarMensagem(template, { destino: "11987654321" });
  assert.equal(ok, true);
  assert.equal(mensagem.assunto, null);
  assert.equal(mensagem.destino, "11987654321");
});

test("montarMensagem recusa anexo e corpo acima do limite do canal", () => {
  const sms = criarTemplate({ nome: "SMS", canal: CANAIS.SMS, corpo: "Confirme sua entrevista.", assunto: "" });
  const comAnexo = montarMensagem(sms, { destino: "11987654321", anexos: [{ nome: "x.pdf" }] });
  assert.equal(comAnexo.ok, false);
  assert.match(comAnexo.erros[0].mensagem, /não suporta anexo/);
  assert.deepEqual(comAnexo.mensagem.anexos, []);

  const whatsapp = criarTemplate({ nome: "Longa", canal: CANAIS.WHATSAPP, corpo: "{{texto}}", variaveis: ["texto"], assunto: "" });
  const longa = montarMensagem(whatsapp, { destino: "11987654321", contexto: { texto: "a".repeat(5000) } });
  assert.equal(longa.ok, false);
  assert.match(longa.erros[0].mensagem, /limite de WHATSAPP é 4096/);
});

test("montarMensagem não envia nada por si só: só descreve", () => {
  const template = modelo("Assunto {{v}}", "Corpo {{v}}", ["v"]);
  const { mensagem } = montarMensagem(template, { contexto: { v: "x" }, destino: "a@b.com" });
  assert.deepEqual(Object.keys(mensagem).sort(), ["anexos", "assunto", "canal", "corpo", "destino", "metadata"]);
});
