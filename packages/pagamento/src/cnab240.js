/**
 * Arquivo de remessa de pagamentos no padrão CNAB 240 da FEBRABAN (registros de 240 posições):
 * header de arquivo (0), header de lote (1), segmentos A e B (3), trailer de lote (5) e trailer
 * de arquivo (9). Um lote por forma de lançamento: crédito em conta no mesmo banco, TED para
 * outros bancos e PIX por chave.
 *
 * Cada banco publica a sua versão do layout e exige homologação (arquivo de teste aceito pelo
 * banco) antes de usar em produção: as versões e os campos "reservados ao banco" ficam em
 * `opcoes` para ajustar sem mudar o gerador.
 */

/** Formas de lançamento (G029) e câmara centralizadora (P001) usadas na folha. */
export const FORMA_LANCAMENTO = Object.freeze({
  CREDITO_CONTA: Object.freeze({ codigo: "01", camara: "000", nome: "Crédito em conta (mesmo banco)" }),
  TED: Object.freeze({ codigo: "41", camara: "018", nome: "TED para outro banco" }),
  PIX: Object.freeze({ codigo: "45", camara: "009", nome: "PIX por chave" }),
});

/** Serviço do lote (G025): 30 = pagamento de salários; 20 = pagamento a fornecedor. */
export const SERVICO = Object.freeze({ SALARIOS: "30", DIVERSOS: "98" });

const VERSAO_PADRAO = Object.freeze({ arquivo: "103", lote: "046" });

/** Texto em maiúsculas, sem acentos e só com caracteres aceitos pelos bancos. */
export function textoCNAB(valor) {
  return String(valor ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,\-/@&()+]/g, " ");
}

const alfa = (valor, tamanho) => textoCNAB(valor).slice(0, tamanho).padEnd(tamanho, " ");
const num = (valor, tamanho) => {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (d.length > tamanho) throw new Error(`campo numérico com ${d.length} dígitos não cabe em ${tamanho}`);
  return d.padStart(tamanho, "0");
};
const brancos = (n) => " ".repeat(n);
/** Campo copiado sem transformar (chave PIX: e-mail e chave aleatória vão como cadastradas). */
const literal = (valor, tamanho) => String(valor ?? "").slice(0, tamanho).padEnd(tamanho, " ");
const dataCNAB = (iso) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;

function registro(partes) {
  const linha = partes.join("");
  if (linha.length !== 240) throw new Error(`registro com ${linha.length} posições (deve ter 240)`);
  return linha;
}

function contaDaEmpresa(e) {
  const c = e.conta;
  return [num(c.agencia, 5), alfa(c.agenciaDv ?? "", 1), num(c.numero, 12), alfa(c.contaDv ?? "", 1), alfa("", 1)];
}

/** Separa conta e dígito ("12345-6" → ["12345", "6"]). */
export function separarConta(conta) {
  const t = String(conta ?? "").trim();
  const m = /^(\d+)[-\s]?([\dXx])$/.exec(t.replace(/\./g, ""));
  if (t.includes("-") && m) return [m[1], m[2].toUpperCase()];
  const d = t.replace(/\D/g, "");
  return [d.slice(0, -1), d.slice(-1)];
}

/**
 * @param dados {
 *   empresa: { cnpj, razaoSocial, banco: { codigo, nome }, conta: { agencia, agenciaDv?, numero, contaDv? },
 *     convenio, endereco?: { logradouro, numero, complemento, cidade, cep, uf } },
 *   pagamentos: [{ forma (chave de FORMA_LANCAMENTO), nome, cpf, valor (centavos), data (ISO), seuNumero,
 *     banco?, agencia?, conta?, chavePix?, tipoChavePix? }],
 *   nsa (número sequencial do arquivo), geradoEm: { data (ISO), hora (HH:MM:SS) } no fuso da empresa,
 *   servico?: SERVICO, mensagem?
 * }
 * @param opcoes { versao?: { arquivo, lote } }
 * @returns { conteudo (linhas com CRLF), linhas, lotes: [{ forma, quantidade, total }], total, quantidade }
 */
export function gerarRemessaCNAB240({ empresa, pagamentos, nsa, geradoEm, servico = SERVICO.SALARIOS, mensagem = "" }, opcoes = {}) {
  const versao = { ...VERSAO_PADRAO, ...opcoes.versao };
  const banco = num(empresa.banco.codigo, 3);
  const inscricao = [num("2", 1), num(empresa.cnpj, 14)];
  const convenio = alfa(empresa.convenio ?? "", 20);
  const end = empresa.endereco ?? {};
  const linhas = [];

  linhas.push(registro([
    banco, "0000", "0", brancos(9), ...inscricao, convenio, ...contaDaEmpresa(empresa),
    alfa(empresa.razaoSocial, 30), alfa(empresa.banco.nome ?? "", 30), brancos(10),
    "1", dataCNAB(geradoEm.data), geradoEm.hora.replace(/:/g, ""), num(nsa, 6), versao.arquivo, "00000",
    brancos(20), brancos(20), brancos(29),
  ]));

  const resumoLotes = [];
  const ordem = Object.keys(FORMA_LANCAMENTO);
  const grupos = ordem.map((f) => [f, pagamentos.filter((p) => p.forma === f)]).filter(([, l]) => l.length);
  grupos.forEach(([forma, lista], i) => {
    const lote = num(i + 1, 4);
    const f = FORMA_LANCAMENTO[forma];
    linhas.push(registro([
      banco, lote, "1", "C", servico, f.codigo, versao.lote, brancos(1), ...inscricao, convenio, ...contaDaEmpresa(empresa),
      alfa(empresa.razaoSocial, 30), alfa(mensagem, 40),
      alfa(end.logradouro, 30), num(end.numero ?? 0, 5), alfa(end.complemento, 15), alfa(end.cidade, 20),
      num(String(end.cep ?? "").replace(/\D/g, "").slice(0, 5), 5), num(String(end.cep ?? "").replace(/\D/g, "").slice(5, 8), 3), alfa(end.uf, 2),
      "01", brancos(6), brancos(10),
    ]));
    let seq = 0;
    let total = 0;
    for (const p of lista) {
      const pix = forma === "PIX";
      const [conta, dv] = pix ? ["", ""] : separarConta(p.conta);
      linhas.push(registro([
        banco, lote, "3", num(++seq, 5), "A", "0", "00", f.camara,
        num(pix ? "" : p.banco, 3), num(pix ? "" : p.agencia, 5), brancos(1), num(conta, 12), alfa(dv, 1), brancos(1),
        alfa(p.nome, 30), alfa(p.seuNumero, 20), dataCNAB(p.data), "BRL", num(0, 15), num(p.valor, 15),
        brancos(20), num(0, 8), num(0, 15), alfa(mensagem, 40), brancos(2), forma === "TED" ? "00006" : brancos(5), brancos(2), brancos(3), "0", brancos(10),
      ]));
      // Segmento B: CPF do favorecido; no PIX, a forma de iniciação e a chave.
      linhas.push(registro(pix
        ? [banco, lote, "3", num(++seq, 5), "B", alfa(p.iniciacao, 3), "1", num(p.cpf, 14), brancos(35), brancos(60), literal(p.chavePix, 99), brancos(6), num(0, 8)]
        : [banco, lote, "3", num(++seq, 5), "B", brancos(3), "1", num(p.cpf, 14), brancos(30), num(0, 5), brancos(15), brancos(15), brancos(20), num(0, 8), brancos(2),
          num(0, 8), num(0, 15), num(0, 15), num(0, 15), num(0, 15), num(0, 15), brancos(15), "0", brancos(6), brancos(8)]));
      total += p.valor;
    }
    linhas.push(registro([banco, lote, "5", brancos(9), num(seq + 2, 6), num(total, 18), num(0, 18), num(0, 6), brancos(165), brancos(10)]));
    resumoLotes.push({ forma, nome: f.nome, quantidade: lista.length, total });
  });

  linhas.push(registro([banco, "9999", "9", brancos(9), num(grupos.length, 6), num(linhas.length + 1, 6), num(0, 6), brancos(205)]));
  return {
    conteudo: `${linhas.join("\r\n")}\r\n`,
    linhas: linhas.length,
    lotes: resumoLotes,
    total: resumoLotes.reduce((s, l) => s + l.total, 0),
    quantidade: pagamentos.length,
  };
}

/** Ocorrências do retorno (G059) mais comuns. */
export const OCORRENCIA_RETORNO = Object.freeze({
  "00": "Crédito ou débito efetivado",
  BD: "Pagamento agendado",
  AG: "Agência ou conta inválida",
  AM: "CPF ou CNPJ do favorecido inválido",
  AP: "Data de pagamento inválida",
  PA: "Chave PIX inválida ou não encontrada",
  ZA: "Agência ou conta do favorecido encerrada",
});

/**
 * Lê o arquivo de retorno: por segmento A, o "seu número" (que identifica o pagamento) e as
 * ocorrências (posições 231 a 240, até 5 códigos de 2).
 * @returns [{ seuNumero, valor, ocorrencias: [{ codigo, descricao }], pago }]
 */
export function lerRetornoCNAB240(conteudo) {
  const saida = [];
  for (const linha of String(conteudo).split(/\r?\n/)) {
    if (linha.length < 240 || linha[7] !== "3" || linha[13] !== "A") continue;
    const codigos = linha.slice(230, 240).match(/.{2}/g).map((c) => c.trim()).filter(Boolean);
    saida.push({
      seuNumero: linha.slice(73, 93).trim(),
      valor: Number(linha.slice(119, 134)),
      ocorrencias: codigos.map((c) => ({ codigo: c, descricao: OCORRENCIA_RETORNO[c] ?? "Ocorrência do banco (ver manual)" })),
      pago: codigos.includes("00"),
    });
  }
  return saida;
}
