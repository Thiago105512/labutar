import test from "node:test";
import assert from "node:assert/strict";
import { gerarRemessaCNAB240, lerRetornoCNAB240, montarPagamentos, validarChavePix, formaDePagamento, textoCNAB, separarConta } from "../src/index.js";

/** CPF fictício válido a partir de 9 dígitos. */
function cpfFicticio(base) {
  const dv = (d, p) => { const s = d.split("").reduce((a, n, i) => a + Number(n) * (p - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = dv(base, 10);
  return `${base}${d1}${dv(`${base}${d1}`, 11)}`;
}

const EMPRESA = {
  cnpj: "11222333000181", razaoSocial: "Empresa Fictícia de Serviços Ltda",
  banco: { codigo: "001", nome: "Banco Fictício" }, conta: { agencia: "1234", agenciaDv: "5", numero: "98765", contaDv: "0" }, convenio: "123456",
  endereco: { logradouro: "Rua Exemplo", numero: "100", cidade: "Manaus", cep: "69000-000", uf: "AM" },
};

test("chave PIX: tipos e normalização", () => {
  assert.deepEqual(validarChavePix("Pessoa@Exemplo.com"), { valida: true, tipo: "EMAIL", chave: "pessoa@exemplo.com" });
  assert.equal(validarChavePix("+55 (92) 98888-7777").chave, "+5592988887777");
  assert.equal(validarChavePix(cpfFicticio("123456789")).tipo, "CPF_CNPJ");
  assert.equal(validarChavePix("123e4567-e89b-12d3-a456-426614174000").tipo, "ALEATORIA");
  assert.equal(validarChavePix("12345").valida, false);
});

test("forma de pagamento: mesmo banco, outro banco, PIX e pendência", () => {
  assert.equal(formaDePagamento({ banco: "001", agencia: "1", conta: "2-3" }, "001").forma, "CREDITO_CONTA");
  assert.equal(formaDePagamento({ banco: "237", agencia: "1", conta: "2-3" }, "001").forma, "TED");
  assert.equal(formaDePagamento({ pix: "pessoa@exemplo.com" }, "001").forma, "PIX");
  assert.equal(formaDePagamento({ banco: "237", agencia: "1", conta: "2-3", pix: "pessoa@exemplo.com" }, "001", { preferirPix: true }).forma, "PIX");
  assert.match(formaDePagamento(null, "001").erro, /sem conta/);
  assert.deepEqual(separarConta("12345-6"), ["12345", "6"]);
  assert.equal(textoCNAB("Márcia Conceição"), "MARCIA CONCEICAO");
});

test("remessa CNAB 240: registros de 240 posições, lotes por forma e totais", () => {
  const itens = [
    { origem: "FOLHA", referencia: "2026-08", matricula: "10000001", nome: "Ana Fictícia", cpf: cpfFicticio("111444777"), valor: 150_000, pessoa: { banco: { banco: "001", agencia: "1234", conta: "55555-1" } } },
    { origem: "FOLHA", referencia: "2026-08", matricula: "10000002", nome: "Bruno Exemplo", cpf: cpfFicticio("222555888"), valor: 98_765, pessoa: { banco: { banco: "237", agencia: "0987", conta: "12345-X" } } },
    { origem: "FOLHA", referencia: "2026-08", matricula: "10000003", nome: "Carla Teste", cpf: cpfFicticio("333666999"), valor: 200_001, pessoa: { banco: { pix: "carla@exemplo.com" } } },
    { origem: "FOLHA", referencia: "2026-08", matricula: "10000004", nome: "Sem Conta", cpf: cpfFicticio("444777000"), valor: 100_000, pessoa: {} },
    { origem: "FOLHA", referencia: "2026-08", matricula: "10000005", nome: "Sem Cpf", cpf: null, valor: 100_000, pessoa: { banco: { pix: "x@exemplo.com" } } },
  ];
  const { pagamentos, pendencias } = montarPagamentos(itens, { bancoEmpresa: "001", data: "2026-09-04" });
  assert.equal(pagamentos.length, 3);
  assert.deepEqual(pendencias.map((p) => p.matricula), ["10000004", "10000005"]);
  assert.equal(pagamentos[0].seuNumero, "FOL20260810000001");

  const r = gerarRemessaCNAB240({ empresa: EMPRESA, pagamentos, nsa: 7, geradoEm: { data: "2026-09-02", hora: "09:45:10" } });
  const linhas = r.conteudo.split("\r\n").filter(Boolean);
  assert.ok(linhas.every((l) => l.length === 240));
  // 1 header + 3 lotes × (header + A + B + trailer) + trailer
  assert.equal(linhas.length, 1 + 3 * 4 + 1);
  assert.equal(r.total, 150_000 + 98_765 + 200_001);
  assert.deepEqual(r.lotes.map((l) => l.forma), ["CREDITO_CONTA", "TED", "PIX"]);
  assert.equal(linhas[0].slice(143, 151), "02092026");
  assert.equal(linhas[0].slice(151, 157), "094510");
  assert.equal(linhas[0].slice(157, 163), "000007");
  const lotePix = linhas.slice(9, 13);
  assert.equal(lotePix[0].slice(11, 13), "45");
  assert.equal(lotePix[1].slice(17, 20), "009");
  assert.equal(lotePix[2].slice(14, 17), "02 ");
  assert.equal(lotePix[2].slice(127, 226).trim(), "carla@exemplo.com");
  assert.equal(linhas[2].slice(119, 134), "000000000150000");
  assert.equal(linhas[4].slice(23, 41), String(150_000).padStart(18, "0"));
  assert.equal(linhas.at(-1).slice(17, 23), "000003");
  assert.equal(linhas.at(-1).slice(23, 29), "000014");

  // Retorno do banco: mesmo arquivo com as ocorrências preenchidas.
  const retorno = linhas.map((l) => (l[7] === "3" && l[13] === "A" ? `${l.slice(0, 230)}${l.includes("BRUNO") ? "AG" : "00"}${" ".repeat(8)}` : l)).join("\r\n");
  const lido = lerRetornoCNAB240(retorno);
  assert.equal(lido.length, 3);
  assert.deepEqual(lido.map((x) => x.pago), [true, false, true]);
  assert.equal(lido[1].ocorrencias[0].descricao, "Agência ou conta inválida");
  assert.equal(lido[1].seuNumero, "FOL20260810000002");
});
