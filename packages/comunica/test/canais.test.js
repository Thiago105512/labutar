import test from "node:test";
import assert from "node:assert/strict";

import {
  CANAIS,
  FUSO_PADRAO_MIN,
  LIMITES_CANAL,
  ORDEM_FALLBACK,
  contarSegmentosSMS,
  escolherCanal,
  ehCompativelGSM7,
  janelaPermitida,
  limites,
  validarDestino,
} from "../src/canais.js";
import { URGENCIA } from "../src/constantes.js";

const CELULAR = "(11) 98765-4321";
const FIXO = "(11) 3456-7890";
const EMAIL = "maria@exemplo.com";

// Instantes em UTC; BRT (UTC-3) entre parênteses.
const JANELA = { permitido: { de: "08:00", ate: "20:00" }, fusoMinutos: FUSO_PADRAO_MIN };
const DENTRO_DA_JANELA = "2026-09-28T15:00:00.000Z"; // segunda 12:00
const NOITE = "2026-09-29T01:00:00.000Z"; // segunda 22:00
const MADRUGADA = "2026-09-28T09:30:00.000Z"; // segunda 06:30
const SABADO_NOITE = "2026-09-27T01:30:00.000Z"; // sábado 22:30

test("validarDestino aceita e normaliza e-mail", () => {
  const resultado = validarDestino(CANAIS.EMAIL, "  Maria@Exemplo.COM ");
  assert.deepEqual(resultado, { valido: true, motivo: null, canal: "EMAIL", normalizado: "maria@exemplo.com" });
  assert.equal(validarDestino(CANAIS.EMAIL, "maria@exemplo").valido, false);
  assert.equal(validarDestino(CANAIS.EMAIL, null).valido, false);
  assert.equal(validarDestino(CANAIS.EMAIL, "").valido, false);
  assert.match(validarDestino(CANAIS.EMAIL, "a@b@c.com").motivo, /@/);
});

test("validarDestino aceita celular no WhatsApp e devolve só dígitos", () => {
  const resultado = validarDestino(CANAIS.WHATSAPP, CELULAR);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.normalizado, "11987654321");
  assert.equal(validarDestino(CANAIS.WHATSAPP, "+55 11 98765-4321").normalizado, "5511987654321");
  assert.equal(validarDestino(CANAIS.WHATSAPP, { celular: "11987654321" }).valido, true);
});

test("validarDestino rejeita telefone fixo no WhatsApp", () => {
  const resultado = validarDestino(CANAIS.WHATSAPP, FIXO);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo, /celular/);
  assert.match(resultado.motivo, /fixo/);
  assert.equal(resultado.normalizado, null);
});

test("validarDestino rejeita telefone fixo no SMS", () => {
  assert.equal(validarDestino(CANAIS.SMS, FIXO).valido, false);
  assert.equal(validarDestino(CANAIS.SMS, CELULAR).valido, true);
  assert.equal(validarDestino(CANAIS.SMS, "11887654321").valido, false); // 11 dígitos sem 9
  assert.equal(validarDestino(CANAIS.SMS, "123").valido, false);
});

test("validarDestino exige token para PUSH e usuarioId para MURAL", () => {
  assert.equal(validarDestino(CANAIS.PUSH, "token-abc-123").valido, true);
  assert.equal(validarDestino(CANAIS.PUSH, { pushToken: "token-abc" }).normalizado, "token-abc");
  assert.equal(validarDestino(CANAIS.PUSH, "   ").valido, false);
  assert.match(validarDestino(CANAIS.PUSH, null).motivo, /token/);

  assert.equal(validarDestino(CANAIS.MURAL, "USU_1").valido, true);
  assert.equal(validarDestino(CANAIS.MURAL, { usuarioId: "USU_2" }).normalizado, "USU_2");
  assert.equal(validarDestino(CANAIS.MURAL, {}).valido, false);
  assert.match(validarDestino(CANAIS.MURAL, "").motivo, /usuarioId/);
});

test("validarDestino rejeita canal inexistente", () => {
  assert.equal(validarDestino("POMBO", "x").valido, false);
  assert.equal(validarDestino(null, "x").valido, false);
  assert.match(validarDestino("fax", "1").motivo, /Canal desconhecido/);
});

test("limites descreve capacidade e custo de cada canal", () => {
  assert.deepEqual(limites(CANAIS.EMAIL), LIMITES_CANAL.EMAIL);
  assert.equal(limites(CANAIS.WHATSAPP).corpoMaximo, 4096);
  assert.equal(limites(CANAIS.SMS).suportaAnexo, false);
  assert.equal(limites(CANAIS.SMS).suportaAssunto, false);
  assert.equal(limites(CANAIS.PUSH).suportaAnexo, false);
  assert.equal(limites(CANAIS.MURAL).custoRelativo, 0);
  assert.ok(limites(CANAIS.SMS).custoRelativo > limites(CANAIS.EMAIL).custoRelativo);
  assert.equal(limites(CANAIS.WHATSAPP).intrusivo, true);
  assert.equal(limites(CANAIS.EMAIL).intrusivo, false);
  assert.equal(limites("inexistente"), null);
  assert.equal(limites(null), null);
});

test("contarSegmentosSMS respeita as fronteiras 160/161/306/307", () => {
  const casos = [
    [160, 1, 160],
    [161, 2, 153],
    [306, 2, 153],
    [307, 3, 153],
  ];
  for (const [tamanho, segmentos, porSegmento] of casos) {
    const resultado = contarSegmentosSMS("a".repeat(tamanho));
    assert.equal(resultado.caracteres, tamanho, `${tamanho} caracteres`);
    assert.equal(resultado.segmentos, segmentos, `${tamanho} → segmentos`);
    assert.equal(resultado.porSegmento, porSegmento, `${tamanho} → por segmento`);
    assert.equal(resultado.codificacao, "GSM7");
  }
});

test("contarSegmentosSMS trata texto vazio e caractere estendido", () => {
  assert.deepEqual(contarSegmentosSMS(""), { caracteres: 0, segmentos: 0, porSegmento: 0, codificacao: "GSM7" });
  assert.equal(contarSegmentosSMS(null).segmentos, 0);
  // Cada caractere da tabela estendida ocupa 2 posições.
  assert.equal(contarSegmentosSMS("^{}").caracteres, 6);
  assert.equal(contarSegmentosSMS("a".repeat(158) + "^").segmentos, 1); // 160 posições
  assert.equal(contarSegmentosSMS("a".repeat(159) + "^").segmentos, 2); // 161 posições
});

test("contarSegmentosSMS cai para UCS-2 com acento fora da tabela GSM-7", () => {
  assert.equal(ehCompativelGSM7("Confirme sua entrevista"), true);
  assert.equal(ehCompativelGSM7("Confirmação"), false); // ç e ã não estão na tabela básica
  const resultado = contarSegmentosSMS("Confirmação");
  assert.equal(resultado.codificacao, "UCS2");
  assert.equal(resultado.porSegmento, 70);
  assert.equal(resultado.segmentos, 1);
  assert.equal(contarSegmentosSMS("á".repeat(70)).segmentos, 1);
  assert.equal(contarSegmentosSMS("á".repeat(71)).segmentos, 2);
  assert.equal(contarSegmentosSMS("á".repeat(71)).porSegmento, 67);
  assert.equal(contarSegmentosSMS("Olá 🙂").codificacao, "UCS2");
});

test("janelaPermitida libera dentro do horário e barra fora dele", () => {
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, JANELA, DENTRO_DA_JANELA).permitido, true);
  const noite = janelaPermitida(CANAIS.WHATSAPP, JANELA, NOITE);
  assert.equal(noite.permitido, false);
  assert.equal(noite.adiarPara, "2026-09-29T11:00:00.000Z"); // terça 08:00 BRT
  const madrugada = janelaPermitida(CANAIS.SMS, JANELA, MADRUGADA);
  assert.equal(madrugada.permitido, false);
  assert.equal(madrugada.adiarPara, "2026-09-28T11:00:00.000Z"); // mesma segunda 08:00 BRT
});

test("janelaPermitida trata o horário final como exclusivo", () => {
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, JANELA, "2026-09-28T11:00:00.000Z").permitido, true); // 08:00 BRT
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, JANELA, "2026-09-28T23:00:00.000Z").permitido, false); // 20:00 BRT
});

test("janelaPermitida não restringe canal assíncrono", () => {
  assert.equal(janelaPermitida(CANAIS.EMAIL, JANELA, NOITE).permitido, true);
  assert.equal(janelaPermitida(CANAIS.MURAL, JANELA, NOITE).permitido, true);
  assert.equal(janelaPermitida(CANAIS.PUSH, JANELA, NOITE).permitido, false);
});

test("janelaPermitida empurra para o próximo dia útil", () => {
  const politica = { permitido: { de: "08:00", ate: "20:00", diasUteis: true }, fusoMinutos: FUSO_PADRAO_MIN };
  const resultado = janelaPermitida(CANAIS.WHATSAPP, politica, SABADO_NOITE);
  assert.equal(resultado.permitido, false);
  assert.match(resultado.motivo, /dias úteis/);
  assert.equal(resultado.adiarPara, "2026-09-28T11:00:00.000Z"); // segunda 08:00 BRT
});

test("janelaPermitida suporta bloqueio total, ausência de política e janela noturna", () => {
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, null, NOITE).permitido, true);
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, { permitido: false }, DENTRO_DA_JANELA).permitido, false);
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, { permitido: false }, DENTRO_DA_JANELA).adiarPara, null);

  const noturna = { permitido: { de: "22:00", ate: "06:00" }, fusoMinutos: FUSO_PADRAO_MIN };
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, noturna, "2026-09-28T02:00:00.000Z").permitido, true); // 23:00 BRT
  const bloqueada = janelaPermitida(CANAIS.WHATSAPP, noturna, "2026-09-28T13:00:00.000Z"); // 10:00 BRT
  assert.equal(bloqueada.permitido, false);
  assert.equal(bloqueada.adiarPara, "2026-09-29T01:00:00.000Z"); // 22:00 BRT do mesmo dia civil
});

test("janelaPermitida aceita janela por canal", () => {
  const politica = { WHATSAPP: { de: "09:00", ate: "18:00" }, EMAIL: true, fusoMinutos: FUSO_PADRAO_MIN };
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, politica, "2026-09-28T11:00:00.000Z").permitido, false); // 08:00 BRT
  assert.equal(janelaPermitida(CANAIS.WHATSAPP, politica, "2026-09-28T12:00:00.000Z").permitido, true); // 09:00 BRT
  assert.equal(janelaPermitida(CANAIS.EMAIL, politica, NOITE).permitido, true);
});

test("escolherCanal usa a preferência quando o destino é válido", () => {
  const resultado = escolherCanal({
    preferencia: CANAIS.WHATSAPP,
    destino: { WHATSAPP: CELULAR, EMAIL },
    referencia: DENTRO_DA_JANELA,
  });
  assert.equal(resultado.canal, "WHATSAPP");
  assert.equal(resultado.destino, "11987654321");
  assert.equal(resultado.adiarPara, null);
  assert.equal(resultado.motivo, "Canal preferido disponível");
});

test("escolherCanal faz fallback quando o destino da preferência é inválido", () => {
  const resultado = escolherCanal({
    preferencia: [CANAIS.WHATSAPP, CANAIS.EMAIL],
    destino: { WHATSAPP: FIXO, EMAIL },
  });
  assert.equal(resultado.canal, "EMAIL");
  assert.equal(resultado.destino, EMAIL);
  assert.match(resultado.motivo, /Preferência inviável/);
  assert.match(resultado.motivo, /fixo/);
  assert.equal(resultado.adiarPara, null);
});

test("escolherCanal segue ORDEM_FALLBACK quando não há preferência", () => {
  assert.deepEqual([...ORDEM_FALLBACK], ["WHATSAPP", "EMAIL", "SMS", "PUSH", "MURAL"]);
  const resultado = escolherCanal({ destino: { EMAIL, MURAL: "USU_1" } });
  assert.equal(resultado.canal, "EMAIL");
  assert.match(resultado.motivo, /ordem padrão/);
});

test("escolherCanal fora da janela migra para canal assíncrono em vez de adiar", () => {
  const resultado = escolherCanal({
    preferencia: CANAIS.WHATSAPP,
    destino: { WHATSAPP: CELULAR, EMAIL },
    horarios: JANELA,
    referencia: NOITE,
  });
  assert.equal(resultado.canal, "EMAIL");
  assert.equal(resultado.adiarPara, null);
  assert.match(resultado.motivo, /fora da janela permitida/);
});

test("escolherCanal adia em vez de descartar quando não há alternativa", () => {
  const resultado = escolherCanal({
    preferencia: CANAIS.WHATSAPP,
    destino: { WHATSAPP: CELULAR },
    horarios: JANELA,
    referencia: NOITE,
  });
  assert.equal(resultado.canal, "WHATSAPP");
  assert.equal(resultado.destino, "11987654321");
  assert.equal(resultado.adiarPara, "2026-09-29T11:00:00.000Z");
  assert.match(resultado.motivo, /adiado, não descartado/);
});

test("escolherCanal com urgência crítica ignora a janela de horário", () => {
  const resultado = escolherCanal({
    preferencia: CANAIS.WHATSAPP,
    destino: { WHATSAPP: CELULAR },
    horarios: JANELA,
    referencia: NOITE,
    urgencia: URGENCIA.CRITICA,
  });
  assert.equal(resultado.canal, "WHATSAPP");
  assert.equal(resultado.adiarPara, null);
  assert.match(resultado.motivo, /Urgência crítica/);
});

test("escolherCanal não descarta em silêncio: sempre explica", () => {
  const semDestino = escolherCanal({ preferencia: CANAIS.EMAIL, destino: {} });
  assert.equal(semDestino.canal, null);
  assert.equal(semDestino.destino, null);
  assert.match(semDestino.motivo, /Nenhum canal com destino válido/);
  assert.equal(semDestino.adiarPara, null);
  assert.ok(semDestino.tentativas.length >= 5);

  const bloqueado = escolherCanal({
    preferencia: CANAIS.WHATSAPP,
    destino: { WHATSAPP: CELULAR },
    horarios: { permitido: false },
  });
  assert.equal(bloqueado.canal, null);
  assert.match(bloqueado.motivo, /bloqueado pela política/);
});

test("escolherCanal aceita destino solto junto com preferência única", () => {
  const resultado = escolherCanal({ preferencia: CANAIS.WHATSAPP, destino: "11987654321" });
  assert.equal(resultado.canal, "WHATSAPP");
  assert.equal(resultado.destino, "11987654321");
  // Sem preferência declarada, um destino solto é ambíguo e não é usado.
  assert.equal(escolherCanal({ destino: "11987654321" }).canal, null);
});

test("escolherCanal usa campos de contato do candidato (telefone, email)", () => {
  const resultado = escolherCanal({
    preferencia: [CANAIS.EMAIL, CANAIS.WHATSAPP],
    destino: { telefone: CELULAR, email: EMAIL },
  });
  assert.equal(resultado.canal, "EMAIL");
  const invertido = escolherCanal({ preferencia: [CANAIS.WHATSAPP], destino: { telefone: CELULAR } });
  assert.equal(invertido.canal, "WHATSAPP");
});
