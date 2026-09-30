/**
 * Exames ocupacionais do PCMSO (NR-7, na redação vigente desde 2022) com o código do eSocial
 * (S-2220, campo tpExameOcup — conferido no XSD S-1.3). docs/17-clinica-sst.md.
 */
import { somarDias, somarMeses, diferencaDias } from "../../core/src/datas.js";

export const TIPO_EXAME = Object.freeze({
  ADMISSIONAL: { codigo: "0", nome: "Admissional", quando: "Antes de o colaborador começar a trabalhar" },
  PERIODICO: { codigo: "1", nome: "Periódico", quando: "Anual para quem está exposto a risco do PGR ou tem doença crônica que aumente a suscetibilidade; a cada 2 anos para os demais" },
  RETORNO: { codigo: "2", nome: "Retorno ao trabalho", quando: "Antes de reassumir, após afastamento de 30 dias ou mais por doença ou acidente, ocupacional ou não" },
  MUDANCA_RISCO: { codigo: "3", nome: "Mudança de risco ocupacional", quando: "Antes da mudança de função, posto ou local que altere a exposição a risco" },
  MONITORACAO_PONTUAL: { codigo: "4", nome: "Monitoração pontual", quando: "Fora dos demais casos, a critério do médico (ex.: exposição acidental, exame complementar isolado)" },
  DEMISSIONAL: { codigo: "9", nome: "Demissional", quando: "Até 10 dias após o fim do contrato; dispensável se o último exame clínico for recente (135 dias em grau de risco 1 e 2; 90 dias em 3 e 4)" },
});

/** Resultado do ASO no eSocial: só apto ou inapto (restrições vão escritas no próprio ASO). */
export const RESULTADO_ASO = Object.freeze({ APTO: "1", INAPTO: "2" });

/** Próximo periódico a partir do último exame clínico. */
export function proximoPeriodico(ultimoExame, { expostoARisco = false, doencaCronica = false, mesesACriterioMedico = null } = {}) {
  const meses = mesesACriterioMedico ?? (expostoARisco || doencaCronica ? 12 : 24);
  return somarMeses(ultimoExame, meses);
}

/** Retorno ao trabalho é obrigatório após afastamento de 30 dias ou mais (doença ou acidente). */
export function exigeExameDeRetorno({ inicioAfastamento, fimAfastamento, motivo }) {
  const dias = diferencaDias(inicioAfastamento, fimAfastamento) + 1;
  return (motivo === "DOENCA" || motivo === "ACIDENTE") && dias >= 30;
}

/**
 * Demissional: até 10 dias após o fim do contrato. Pode ser dispensado se o exame clínico mais
 * recente foi feito há menos de 135 dias (grau de risco 1 e 2) ou 90 dias (grau 3 e 4) — o grau
 * de risco vem do CNAE (NR-4).
 */
export function exameDemissional({ fimDoContrato, ultimoExameClinico, grauDeRisco }) {
  const limite = grauDeRisco >= 3 ? 90 : 135;
  const diasDesdeUltimo = ultimoExameClinico ? diferencaDias(ultimoExameClinico, fimDoContrato) : Infinity;
  return {
    dispensavel: diasDesdeUltimo < limite,
    prazoAte: somarDias(fimDoContrato, 10),
    limiteDias: limite,
    diasDesdeUltimo: Number.isFinite(diasDesdeUltimo) ? diasDesdeUltimo : null,
  };
}

/** Audiometria de quem está exposto a ruído (NR-7, Anexo II): admissão, 6 meses, depois anual e na demissão. */
export function proximaAudiometria({ admissao, ultimaAudiometria = null }) {
  if (!ultimaAudiometria) return admissao;
  if (diferencaDias(admissao, ultimaAudiometria) < 180) return somarMeses(admissao, 6);
  return somarMeses(ultimaAudiometria, 12);
}

/**
 * Toxicológico do motorista profissional (CNH C, D ou E): exigido pelo empregador antes da
 * admissão e no desligamento (CLT, art. 168, § 6º; eSocial S-2221). O periódico de 2 anos e meio
 * é da renovação da CNH (CTB, art. 148-A) — o Labutar só alerta.
 */
export function exigeToxicologico({ motoristaProfissional, categoriaCNH }) {
  return Boolean(motoristaProfissional) && ["C", "D", "E"].includes(String(categoriaCNH ?? "").toUpperCase());
}

/** O que não pode ser exigido em exame ocupacional. */
export const EXAMES_PROIBIDOS = Object.freeze([
  { nome: "Teste de gravidez ou de esterilização", base: "Lei 9.029/1995, art. 2º" },
  { nome: "Teste de HIV", base: "Portaria MTE 1.246/2010" },
]);
