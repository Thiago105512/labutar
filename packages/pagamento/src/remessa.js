/**
 * Quem recebe, quanto e como: a partir da folha fechada (holerites), das rescisões e das férias
 * aprovadas e dos dados bancários da pessoa. Sem CPF ou sem conta/chave PIX válida, vira
 * pendência — o pagamento não entra no arquivo.
 */
import { validarCPF } from "../../core/src/validacao.js";
import { validarChavePix, TIPO_CHAVE_PIX } from "./pix.js";

export const ORIGEM_PAGAMENTO = Object.freeze({
  FOLHA: Object.freeze({ prefixo: "FOL", nome: "Folha mensal" }),
  RESCISAO: Object.freeze({ prefixo: "RES", nome: "Rescisão" }),
  FERIAS: Object.freeze({ prefixo: "FER", nome: "Férias" }),
});

/** Identificador do pagamento no arquivo e no retorno (até 20 caracteres). */
export function seuNumero(origem, matricula, referencia) {
  return `${ORIGEM_PAGAMENTO[origem].prefixo}${String(referencia).replace(/\D/g, "")}${String(matricula).replace(/\D/g, "")}`.slice(0, 20);
}

/**
 * Forma de pagamento de uma pessoa: conta no mesmo banco da empresa → crédito em conta; conta em
 * outro banco → TED; sem conta (ou preferindo PIX) e com chave válida → PIX.
 * @returns { forma, banco?, agencia?, conta?, chavePix?, iniciacao? } | { erro }
 */
export function formaDePagamento(banco, bancoEmpresa, { preferirPix = false } = {}) {
  const temConta = Boolean(banco?.banco && banco?.agencia && banco?.conta);
  const pix = banco?.pix ? validarChavePix(banco.pix) : null;
  if (pix?.valida && (preferirPix || !temConta)) return { forma: "PIX", chavePix: pix.chave, tipoChave: pix.tipo, iniciacao: TIPO_CHAVE_PIX[pix.tipo].iniciacao };
  if (temConta) return { forma: banco.banco === bancoEmpresa ? "CREDITO_CONTA" : "TED", banco: banco.banco, agencia: banco.agencia, conta: banco.conta };
  if (pix && !pix.valida) return { erro: `chave PIX inválida: ${pix.motivo}` };
  return { erro: "sem conta bancária nem chave PIX no cadastro" };
}

/**
 * @param itens [{ origem, referencia, matricula, nome, cpf, valor, pessoa }]
 * @returns { pagamentos, pendencias: [{ matricula, nome, valor, motivo }] }
 */
export function montarPagamentos(itens, { bancoEmpresa, data, preferirPix = false }) {
  const pagamentos = [];
  const pendencias = [];
  for (const i of itens) {
    if (!(i.valor > 0)) continue;
    const pendencia = (motivo) => pendencias.push({ origem: i.origem, matricula: i.matricula, nome: i.nome, valor: i.valor, motivo });
    const cpf = i.cpf ?? i.pessoa?.cpf;
    if (!cpf || !validarCPF(cpf).valido) { pendencia("CPF ausente ou inválido"); continue; }
    const forma = formaDePagamento(i.pessoa?.banco, bancoEmpresa, { preferirPix });
    if (forma.erro) { pendencia(forma.erro); continue; }
    pagamentos.push({
      ...forma, origem: i.origem, referencia: i.referencia, matricula: i.matricula, nome: i.nome, cpf: validarCPF(cpf).digitos,
      valor: i.valor, data, seuNumero: seuNumero(i.origem, i.matricula, i.referencia),
    });
  }
  return { pagamentos, pendencias };
}
