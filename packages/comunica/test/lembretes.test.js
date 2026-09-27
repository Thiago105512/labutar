import test from "node:test";
import assert from "node:assert/strict";

import {
  agendarLembrete,
  agendarLembretes,
  cancelarLembrete,
  canaisPendentes,
  detalheAtraso,
  estaCompleto,
  lembretesAtrasados,
  lembretesParaEntrevista,
  lembretesPendentes,
  marcarEnviado,
  minutosAtraso,
  reagendarLembrete,
  statusLembrete,
} from "../src/lembretes.js";
import { CANAIS } from "../src/canais.js";
import { ATRASO_TOLERADO_MINUTOS, STATUS_LEMBRETE, TIPO_LEMBRETE } from "../src/constantes.js";

const ENTREVISTA = "2026-10-05T17:00:00.000Z";
const DISPARO_24H = "2026-10-04T17:00:00.000Z";
const AGORA = "2026-10-04T18:00:00.000Z"; // 60 min depois do disparo de 24h

test("agendarLembrete calcula o disparo a partir do evento e da antecedência", () => {
  const lembrete = agendarLembrete({
    tipo: TIPO_LEMBRETE.ENTREVISTA,
    quando: ENTREVISTA,
    antesMinutos: 1440,
    canais: [CANAIS.WHATSAPP, CANAIS.EMAIL],
    destino: "11987654321",
    templateId: "lembrete-entrevista-24h",
    contexto: { nomeCandidato: "Maria" },
    referenciaId: "ENTV_1",
  });
  assert.match(lembrete.id, /^LEMB_/);
  assert.equal(lembrete.eventoEm, ENTREVISTA);
  assert.equal(lembrete.disparoEm, DISPARO_24H);
  assert.equal(lembrete.antesMinutos, 1440);
  assert.deepEqual(lembrete.canais, ["WHATSAPP", "EMAIL"]);
  assert.equal(lembrete.status, STATUS_LEMBRETE.AGENDADO);
  assert.deepEqual(lembrete.envios, []);
  assert.equal(lembrete.enviadoEm, null);
  assert.equal(lembrete.referenciaId, "ENTV_1");
  assert.deepEqual(lembrete.contexto, { nomeCandidato: "Maria" });
});

test("agendarLembrete usa e-mail como canal padrão e antecedência zero", () => {
  const lembrete = agendarLembrete({ quando: ENTREVISTA });
  assert.deepEqual(lembrete.canais, ["EMAIL"]);
  assert.equal(lembrete.disparoEm, ENTREVISTA);
  assert.equal(lembrete.tipo, TIPO_LEMBRETE.GENERICO);
});

test("agendarLembrete recusa data ilegível e canal inexistente", () => {
  assert.throws(() => agendarLembrete({ quando: "amanhã de manhã" }), /Data\/hora inválida/);
  assert.throws(() => agendarLembrete({ quando: null }), /Data\/hora inválida/);
  assert.throws(() => agendarLembrete({ quando: ENTREVISTA, canais: [] }), /ao menos um canal/);
  assert.throws(() => agendarLembrete({ quando: ENTREVISTA, canais: ["POMBO"] }), /inexistente/);
  assert.throws(() => agendarLembrete({ quando: ENTREVISTA, antesMinutos: -30 }), /antesMinutos/);
  assert.throws(() => agendarLembrete({ quando: ENTREVISTA, antesMinutos: "logo" }), /antesMinutos/);
});

test("agendarLembrete aceita Date, normaliza canal minúsculo e não duplica canal", () => {
  const lembrete = agendarLembrete({ quando: new Date(ENTREVISTA), canais: ["whatsapp", "WHATSAPP"] });
  assert.equal(lembrete.eventoEm, ENTREVISTA);
  assert.deepEqual(lembrete.canais, ["WHATSAPP"]);
});

test("agendarLembretes cria um lembrete por antecedência", () => {
  const lista = agendarLembretes({ quando: ENTREVISTA, antesMinutos: [1440, 60], canais: [CANAIS.WHATSAPP] });
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map((l) => l.disparoEm), ["2026-10-04T17:00:00.000Z", "2026-10-05T16:00:00.000Z"]);
  assert.notEqual(lista[0].id, lista[1].id);
  assert.equal(agendarLembretes({ quando: ENTREVISTA }).length, 1);
});

test("lembretesParaEntrevista aplica o padrão 24h + 1h no WhatsApp e no e-mail", () => {
  const entrevista = { id: "ENTV_1", agenda: { inicio: ENTREVISTA }, lembretes: [] };
  const lista = lembretesParaEntrevista(entrevista, { templateId: "lembrete-entrevista" });
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map((l) => l.antesMinutos), [1440, 60]);
  assert.deepEqual(lista[0].canais, ["WHATSAPP", "EMAIL"]);
  assert.equal(lista[0].tipo, TIPO_LEMBRETE.ENTREVISTA);
  assert.equal(lista[0].referenciaId, "ENTV_1");
  assert.equal(lista[0].templateId, "lembrete-entrevista");
  assert.equal(lista[0].contexto.entrevistaId, "ENTV_1");
});

test("lembretesParaEntrevista respeita a configuração da entrevista", () => {
  const entrevista = {
    id: "ENTV_2",
    agenda: { inicio: ENTREVISTA },
    lembretes: [
      { antesMinutos: 30, canais: ["SMS"], templateId: "sms-curto" },
      { antesMinutos: 1440, enviar: false },
      { quando: "2026-10-01T12:00:00.000Z", antesMinutos: 0 },
    ],
  };
  const lista = lembretesParaEntrevista(entrevista);
  assert.deepEqual(lista.map((l) => l.antesMinutos), [30, 0]);
  assert.deepEqual(lista[0].canais, ["SMS"]);
  assert.equal(lista[0].templateId, "sms-curto");
  assert.equal(lista[1].eventoEm, "2026-10-01T12:00:00.000Z");
});

test("lembretesPendentes devolve só o que já venceu e ainda não saiu", () => {
  const futuro = agendarLembrete({ id: "L_FUTURO", quando: ENTREVISTA, antesMinutos: 60 });
  const devido = agendarLembrete({ id: "L_DEVIDO", quando: ENTREVISTA, antesMinutos: 1440 });
  const velho = agendarLembrete({ id: "L_VELHO", quando: "2026-10-04T12:00:00.000Z", antesMinutos: 60 });
  const enviado = marcarEnviado(agendarLembrete({ id: "L_ENVIADO", quando: "2026-10-04T12:00:00.000Z" }), "EMAIL", AGORA);
  const cancelado = cancelarLembrete(agendarLembrete({ id: "L_CANCELADO", quando: "2026-10-04T12:00:00.000Z" }));

  const fila = lembretesPendentes([futuro, enviado, devido, cancelado, velho], AGORA);
  assert.deepEqual(fila.map((l) => l.id), ["L_VELHO", "L_DEVIDO"]);
  assert.deepEqual(lembretesPendentes([futuro], AGORA), []);
  assert.deepEqual(lembretesPendentes([], AGORA), []);
  assert.deepEqual(lembretesPendentes([devido], new Date(AGORA)).map((l) => l.id), ["L_DEVIDO"]);
});

test("lembretesAtrasados separa o que estourou a tolerância do que é fila normal", () => {
  assert.equal(ATRASO_TOLERADO_MINUTOS, 60);
  const noLimite = agendarLembrete({ id: "L_LIMITE", quando: ENTREVISTA, antesMinutos: 1440 }); // 60 min
  const estourado = agendarLembrete({ id: "L_ESTOURADO", quando: ENTREVISTA, antesMinutos: 1441 }); // 61 min
  const eventoPassado = agendarLembrete({ id: "L_EVENTO", quando: "2026-10-04T12:00:00.000Z", antesMinutos: 60 });
  const futuro = agendarLembrete({ id: "L_FUTURO", quando: ENTREVISTA, antesMinutos: 60 });

  assert.deepEqual(lembretesAtrasados([noLimite, estourado, eventoPassado, futuro], AGORA).map((l) => l.id), [
    "L_EVENTO",
    "L_ESTOURADO",
  ]);
  assert.equal(statusLembrete(noLimite, AGORA), STATUS_LEMBRETE.PENDENTE);
  assert.equal(statusLembrete(estourado, AGORA), STATUS_LEMBRETE.ATRASADO);
  assert.equal(statusLembrete(eventoPassado, AGORA), STATUS_LEMBRETE.ATRASADO);
  assert.equal(statusLembrete(futuro, AGORA), STATUS_LEMBRETE.AGENDADO);
});

test("minutosAtraso e detalheAtraso explicam por que o lembrete atrasou", () => {
  const devido = agendarLembrete({ quando: ENTREVISTA, antesMinutos: 1440 });
  assert.equal(minutosAtraso(devido, AGORA), 60);
  assert.equal(minutosAtraso(devido, "2026-10-01T00:00:00.000Z"), 0);
  assert.equal(detalheAtraso(devido, AGORA).eventoJaOcorreu, false);

  const perdido = agendarLembrete({ quando: "2026-10-04T12:00:00.000Z", antesMinutos: 60 });
  const detalhe = detalheAtraso(perdido, AGORA);
  assert.equal(detalhe.eventoJaOcorreu, true);
  assert.match(detalhe.motivo, /já começou/);
});

test("marcarEnviado é idempotente por canal e preserva o primeiro horário", () => {
  const lembrete = agendarLembrete({ quando: ENTREVISTA, antesMinutos: 1440, canais: [CANAIS.WHATSAPP, CANAIS.EMAIL] });
  const primeiro = marcarEnviado(lembrete, CANAIS.WHATSAPP, "2026-10-04T17:05:00.000Z");
  const repetido = marcarEnviado(primeiro, "WHATSAPP", "2026-10-04T19:00:00.000Z");

  assert.equal(repetido, primeiro, "repetir o mesmo canal deveria devolver o mesmo lembrete");
  assert.equal(repetido.envios.length, 1);
  assert.equal(repetido.envios[0].em, "2026-10-04T17:05:00.000Z");
  assert.deepEqual(lembrete.envios, [], "entrada não pode ser mutada");
  assert.equal(marcarEnviado(primeiro, null), primeiro);
});

test("lembrete de dois canais não é dado como enviado depois do primeiro", () => {
  const lembrete = agendarLembrete({ quando: ENTREVISTA, antesMinutos: 1440, canais: [CANAIS.WHATSAPP, CANAIS.EMAIL] });
  const parcial = marcarEnviado(lembrete, CANAIS.WHATSAPP, "2026-10-04T17:05:00.000Z");

  assert.equal(estaCompleto(parcial), false);
  assert.deepEqual(canaisPendentes(parcial), ["EMAIL"]);
  assert.equal(parcial.status, STATUS_LEMBRETE.PENDENTE);
  assert.equal(parcial.enviadoEm, null);
  assert.deepEqual(lembretesPendentes([parcial], "2026-10-04T19:00:00.000Z").map((l) => l.id), [parcial.id]);

  const completo = marcarEnviado(parcial, CANAIS.EMAIL, "2026-10-04T17:06:00.000Z");
  assert.equal(completo.status, STATUS_LEMBRETE.ENVIADO);
  assert.equal(completo.enviadoEm, "2026-10-04T17:06:00.000Z");
  assert.deepEqual(canaisPendentes(completo), []);
  assert.deepEqual(completo.envios.map((e) => e.canal), ["WHATSAPP", "EMAIL"]);
  assert.deepEqual(lembretesPendentes([completo], "2026-10-04T19:00:00.000Z"), []);
});

test("marcarEnviado normaliza o canal e aceita canal extra fora da lista", () => {
  const lembrete = agendarLembrete({ quando: ENTREVISTA, canais: [CANAIS.EMAIL] });
  const comMinusculo = marcarEnviado(lembrete, "email", AGORA);
  assert.equal(comMinusculo.envios[0].canal, "EMAIL");
  assert.equal(comMinusculo.status, STATUS_LEMBRETE.ENVIADO);

  const extra = marcarEnviado(comMinusculo, CANAIS.SMS, AGORA);
  assert.deepEqual(extra.envios.map((e) => e.canal), ["EMAIL", "SMS"]);
  assert.equal(extra.status, STATUS_LEMBRETE.ENVIADO, "canal extra não pode reabrir o lembrete");
});

test("cancelarLembrete tira o lembrete da fila e é idempotente", () => {
  const lembrete = agendarLembrete({ quando: "2026-10-04T12:00:00.000Z" });
  const cancelado = cancelarLembrete(lembrete, "Entrevista remarcada pelo candidato", AGORA);
  assert.equal(cancelado.status, STATUS_LEMBRETE.CANCELADO);
  assert.equal(cancelado.motivoCancelamento, "Entrevista remarcada pelo candidato");
  assert.equal(cancelado.canceladoEm, AGORA);
  assert.deepEqual(lembretesPendentes([cancelado], AGORA), []);
  assert.deepEqual(lembretesAtrasados([cancelado], AGORA), []);
  assert.equal(cancelarLembrete(cancelado), cancelado);
});

test("reagendarLembrete zera os envios e recalcula o disparo", () => {
  const lembrete = agendarLembrete({ quando: ENTREVISTA, antesMinutos: 1440, canais: [CANAIS.WHATSAPP] });
  const enviado = marcarEnviado(lembrete, CANAIS.WHATSAPP, "2026-10-04T17:05:00.000Z");
  const novo = reagendarLembrete(enviado, "2026-10-12T17:00:00.000Z", AGORA);

  assert.equal(novo.eventoEm, "2026-10-12T17:00:00.000Z");
  assert.equal(novo.disparoEm, "2026-10-11T17:00:00.000Z");
  assert.deepEqual(novo.envios, []);
  assert.equal(novo.enviadoEm, null);
  assert.equal(novo.status, STATUS_LEMBRETE.AGENDADO);
  assert.equal(novo.antesMinutos, 1440);
  assert.equal(novo.id, enviado.id);
});

test("fluxo completo: 24h e 1h antes, nos dois canais, sem perder envio", () => {
  const lista = lembretesParaEntrevista({ id: "ENTV_9", agenda: { inicio: ENTREVISTA }, lembretes: [] });
  const [vinteQuatro, uma] = lista;

  const fila24 = lembretesPendentes(lista, AGORA);
  assert.deepEqual(fila24.map((l) => l.id), [vinteQuatro.id], "só o de 24h venceu até agora");

  let estado = marcarEnviado(vinteQuatro, CANAIS.WHATSAPP, "2026-10-04T17:02:00.000Z");
  estado = marcarEnviado(estado, CANAIS.EMAIL, "2026-10-04T17:03:00.000Z");
  assert.equal(estado.status, STATUS_LEMBRETE.ENVIADO);

  const antesDeUma = lembretesPendentes([estado, uma], AGORA);
  assert.deepEqual(antesDeUma.map((l) => l.id), []);

  const depoisDeUma = lembretesPendentes([estado, uma], "2026-10-05T16:30:00.000Z");
  assert.deepEqual(depoisDeUma.map((l) => l.id), [uma.id]);
  assert.deepEqual(canaisPendentes(depoisDeUma[0]), ["WHATSAPP", "EMAIL"]);
});
