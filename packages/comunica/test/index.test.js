import test from "node:test";
import assert from "node:assert/strict";

import * as comunica from "../src/index.js";
import { CANAIS } from "../src/canais.js";
import { criarTemplate, montarMensagem, renderizar } from "../src/templates.js";

const API_ESPERADA = [
  // constantes
  "CANAIS",
  "LIMITES_CANAL",
  "ORDEM_FALLBACK",
  "PRIORIDADE_AVISO",
  "PUBLICO_ALVO",
  "URGENCIA",
  "STATUS_LEMBRETE",
  "TIPO_LEMBRETE",
  "TEMPLATES_PADRAO",
  // canais
  "validarDestino",
  "limites",
  "contarSegmentosSMS",
  "escolherCanal",
  "janelaPermitida",
  // templates
  "criarTemplate",
  "renderizar",
  "listarVariaveis",
  "montarMensagem",
  "FILTROS",
  // avisos
  "criarAviso",
  "destinatarios",
  "registrarLeitura",
  "leituraPorUsuario",
  "avisosVigentes",
  "avisosVencendo",
  "ordenarAvisos",
  // lembretes
  "agendarLembrete",
  "agendarLembretes",
  "lembretesParaEntrevista",
  "lembretesPendentes",
  "lembretesAtrasados",
  "marcarEnviado",
  "cancelarLembrete",
  "reagendarLembrete",
  "statusLembrete",
];

test("o barrel exporta toda a API pública", () => {
  for (const nome of API_ESPERADA) {
    assert.equal(typeof comunica[nome] !== "undefined", true, `${nome} não é exportado por src/index.js`);
  }
  assert.deepEqual(comunica.CANAIS, CANAIS);
  assert.equal(comunica.renderizar, renderizar);
});

test("tudo que sai do pacote é serializável: sem funções, sem Date, sem classe", () => {
  const template = criarTemplate({
    nome: "T",
    canal: CANAIS.MURAL,
    assunto: "A",
    corpo: "Corpo {{nome}}",
    variaveis: [{ nome: "nome", exemplo: "Maria" }],
  });
  const aviso = comunica.criarAviso({ titulo: "T", corpo: "C", anexos: [{ nome: "edital.pdf" }] });
  const lembrete = comunica.agendarLembrete({ quando: "2026-10-05T17:00:00.000Z", antesMinutos: 60 });
  const mensagem = montarMensagem(template, { contexto: { nome: "Maria" }, destino: "USU_1" }).mensagem;

  for (const objeto of [template, aviso, lembrete, mensagem]) {
    const ida = JSON.stringify(objeto);
    assert.deepEqual(JSON.parse(ida), objeto);
  }
  assert.equal(typeof lembrete.criadoEm, "string");
  assert.equal(typeof aviso.criadoEm, "string");
});

test("fluxo ponta a ponta: template + roteamento + descritor de envio", () => {
  const template = criarTemplate({
    nome: "Convite",
    canal: CANAIS.EMAIL,
    assunto: "Entrevista {{data|dataBR}} às {{hora}}",
    corpo: "Olá, {{nome}}! Sua entrevista para {{vaga}} é {{data|dataBR}} às {{hora}}.",
    variaveis: ["nome", "vaga", "data", "hora"],
  });
  assert.equal(template.valido, true);

  const contato = { email: "maria@exemplo.com", telefone: "(11) 98765-4321" };
  const rota = comunica.escolherCanal({ preferencia: [CANAIS.WHATSAPP, CANAIS.EMAIL], destino: contato });
  assert.equal(rota.canal, "WHATSAPP");
  assert.equal(rota.adiarPara, null);

  const { ok, mensagem } = montarMensagem(template, {
    contexto: { nome: "Maria", vaga: "Analista de DP", data: "2026-10-05", hora: "14:00" },
    destino: contato.email,
    metadata: { candidaturaId: "CTDA_9" },
  });
  assert.equal(ok, true);
  assert.equal(mensagem.canal, "EMAIL");
  assert.equal(mensagem.assunto, "Entrevista 05/10/2026 às 14:00");
  assert.equal(mensagem.corpo, "Olá, Maria! Sua entrevista para Analista de DP é 05/10/2026 às 14:00.");
  assert.equal(mensagem.destino, "maria@exemplo.com");

  const aviso = comunica.criarAviso({
    titulo: "Nova vaga aberta",
    corpo: "Analista de DP publicada no mural.",
    publico: { tipo: "PAPEIS", valores: ["RECRUTADOR"] },
    prioridade: "ALTA",
    vigencia: { de: "2026-09-01", ate: "2026-10-31" },
  });
  assert.equal(aviso.valido, true);
  assert.deepEqual(comunica.avisosVigentes([aviso], "2026-09-27").map((a) => a.id), [aviso.id]);

  const lembrete = comunica.agendarLembrete({
    tipo: "ENTREVISTA",
    quando: "2026-10-05T17:00:00.000Z",
    antesMinutos: 1440,
    canais: [CANAIS.WHATSAPP, CANAIS.EMAIL],
    templateId: template.id,
    referenciaId: "ENTV_1",
  });
  const fila = comunica.lembretesPendentes([lembrete], "2026-10-04T18:00:00.000Z");
  assert.equal(fila.length, 1);
  const disparoWhatsApp = comunica.marcarEnviado(lembrete, CANAIS.WHATSAPP, "2026-10-04T17:01:00.000Z");
  assert.equal(disparoWhatsApp.status, "PENDENTE");
  const disparoEmail = comunica.marcarEnviado(disparoWhatsApp, CANAIS.EMAIL, "2026-10-04T17:02:00.000Z");
  assert.equal(disparoEmail.status, "ENVIADO");
});
