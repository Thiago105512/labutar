/**
 * Pagamento: prévia de quem recebe (folha fechada, rescisões e férias aprovadas), arquivo de
 * remessa CNAB 240 para o banco e leitura do retorno. É do Financeiro: gerar a remessa é "criar",
 * registrar o retorno é "editar". Pago no retorno, a rescisão e as férias viram "Pagas".
 */
import { createHash } from "node:crypto";
import { montarPagamentos, gerarRemessaCNAB240, lerRetornoCNAB240, FORMA_LANCAMENTO } from "../../packages/pagamento/src/index.js";
import {
  validarCompetencia, STATUS_COMPETENCIA, feriadosDoAno, STATUS_RESCISAO, STATUS_FERIAS, ACAO_RESCISAO, ACAO_FERIAS,
  NOME_STATUS_RESCISAO, NOME_STATUS_FERIAS, aplicarAcaoRegistro,
} from "../../packages/folha/src/index.js";
import { somarDias, dataNoFuso, horaNoFuso } from "../../packages/core/src/datas.js";
import { novoId } from "../../packages/core/src/ids.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito } from "./http/resposta.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { carregarCadastro } from "./cadastro.js";
import { obterFechamento } from "./fechamento.js";

const TUDO = { limite: 100_000 };
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 5º dia útil do mês seguinte (art. 459, § 1º, da CLT). O sábado conta como dia útil para o
 * pagamento de salário; domingo e feriado, não.
 */
export function quintoDiaUtil(competencia, local = {}) {
  const [ano, mes] = competencia.split("-").map(Number);
  const proximo = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const feriados = new Set(feriadosDoAno(Number(proximo.slice(0, 4)), local).map((f) => f.data));
  let dia = `${proximo}-01`;
  let uteis = 0;
  for (;;) {
    const domingo = new Date(`${dia}T12:00:00Z`).getUTCDay() === 0;
    if (!domingo && !feriados.has(dia)) uteis += 1;
    if (uteis === 5) return dia;
    dia = somarDias(dia, 1);
  }
}

async function pessoasPorMatricula(repo, tenant) {
  const cad = await carregarCadastro(repo, tenant);
  return new Map(cad.vinculos.map((v) => [v.matricula, cad.pessoa.get(v.pessoaId) ?? null]));
}

/** Itens a pagar de uma origem. FOLHA: líquido dos holerites da competência fechada. */
async function itensAPagar(repo, tenant, { origem, competencia }) {
  const pessoas = await pessoasPorMatricula(repo, tenant);
  const { itens: remessas } = await repo.listar(tenant, "remessasPagamento", {}, TUDO);
  if (origem === "FOLHA") {
    if (!validarCompetencia(competencia ?? "")) throw erroValidacao("competência inválida: use AAAA-MM", ["competencia"]);
    const f = await obterFechamento(repo, tenant, competencia);
    if (f.status !== STATUS_COMPETENCIA.FECHADA) throw erroConflito(`competência ${competencia} não está fechada: feche a folha antes de pagar`);
    const jaGerada = remessas.find((r) => r.origem === "FOLHA" && r.competencia === competencia);
    const empresa = f.fotografia.empresa ?? {};
    return {
      jaGerada: jaGerada ? { id: jaGerada.id, nsa: jaGerada.nsa, geradaEm: jaGerada.geradaEm } : null,
      dataSugerida: quintoDiaUtil(competencia, empresa.local),
      itens: f.fotografia.holerites.map((h) => ({
        origem: "FOLHA", referencia: competencia, matricula: h.colaborador.matricula, nome: h.colaborador.nome,
        cpf: pessoas.get(h.colaborador.matricula)?.cpf ?? h.colaborador.cpf, valor: h.liquido, pessoa: pessoas.get(h.colaborador.matricula),
      })),
    };
  }
  if (origem === "REGISTROS") {
    // Rescisões e férias aprovadas que ainda não estão numa remessa (ou foram rejeitadas no retorno).
    const emRemessa = new Set(remessas.flatMap((r) => r.itens.filter((i) => i.status !== "REJEITADO").map((i) => i.registroId).filter(Boolean)));
    const [{ itens: rescisoes }, { itens: ferias }] = await Promise.all([
      repo.listar(tenant, "rescisoes", { status: STATUS_RESCISAO.APROVADA }, TUDO),
      repo.listar(tenant, "ferias", { status: STATUS_FERIAS.APROVADA }, TUDO),
    ]);
    return {
      jaGerada: null,
      dataSugerida: null,
      itens: [
        ...rescisoes.filter((x) => !emRemessa.has(x.id)).map((x) => ({
          origem: "RESCISAO", referencia: x.desligamento, registroId: x.id, data: x.prazoPagamento, matricula: x.matricula, nome: x.nome,
          cpf: pessoas.get(x.matricula)?.cpf ?? x.cpf, valor: x.resultado.liquido, pessoa: pessoas.get(x.matricula),
        })),
        ...ferias.filter((x) => !emRemessa.has(x.id)).map((x) => ({
          origem: "FERIAS", referencia: x.inicio, registroId: x.id, data: x.prazoPagamento, matricula: x.matricula, nome: x.nome,
          cpf: pessoas.get(x.matricula)?.cpf ?? null, valor: x.recibo.liquido, pessoa: pessoas.get(x.matricula),
        })),
      ],
    };
  }
  throw erroValidacao("origem do pagamento: FOLHA ou REGISTROS", ["origem"]);
}

function contaDaEmpresa(empresa) {
  const c = empresa.contaPagamento;
  if (!c?.banco?.codigo || !c?.conta?.numero) throw erroConflito("cadastre a conta da empresa para pagamentos (banco, agência, conta e convênio) nos parâmetros da folha");
  return c;
}

/** Prévia: pagamentos com a forma (crédito, TED, PIX), pendências e totais por forma. */
async function previa(repo, tenant, { origem, competencia, data, preferirPix }) {
  const empresa = (await repo.obter(tenant, "folhaParametros", "empresa")) ?? {};
  const conta = contaDaEmpresa(empresa);
  const a = await itensAPagar(repo, tenant, { origem, competencia });
  const dataPagamento = data ?? a.dataSugerida;
  // Rescisão e férias: cada uma na data do seu prazo (ou na informada, se anterior).
  const porData = new Map();
  for (const i of a.itens) {
    const d = i.data && (!dataPagamento || i.data < dataPagamento) ? i.data : dataPagamento;
    if (!d) throw erroValidacao("informe a data de pagamento", ["data"]);
    porData.set(i, d);
  }
  const resultados = a.itens.map((i) => ({ i, ...montarPagamentos([i], { bancoEmpresa: conta.banco.codigo, data: porData.get(i), preferirPix }) }));
  const pagamentos = resultados.flatMap((r) => r.pagamentos.map((p) => ({ ...p, registroId: r.i.registroId ?? null })));
  const pendencias = resultados.flatMap((r) => r.pendencias);
  const totais = Object.keys(FORMA_LANCAMENTO).map((f) => {
    const l = pagamentos.filter((p) => p.forma === f);
    return { forma: f, nome: FORMA_LANCAMENTO[f].nome, quantidade: l.length, total: l.reduce((s, p) => s + p.valor, 0) };
  }).filter((t) => t.quantidade);
  return { origem, competencia: competencia ?? null, data: dataPagamento, empresa, conta, jaGerada: a.jaGerada, pagamentos, pendencias, totais };
}

const resumoRemessa = (r) => ({
  id: r.id, nsa: r.nsa, origem: r.origem, competencia: r.competencia, data: r.data, geradaEm: r.geradaEm, nomeArquivo: r.nomeArquivo,
  quantidade: r.quantidade, total: r.total, lotes: r.lotes, pendencias: r.pendencias.length, hash: r.hash, status: r.status,
  pagos: r.itens.filter((i) => i.status === "PAGO").length, rejeitados: r.itens.filter((i) => i.status === "REJEITADO").length,
});

export function registrarRotasPagamento(r, { repo }) {
  r.get("/api/pagamentos/previa", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "financeiro", "ver");
    const q = ctx.query;
    if (q.data && !DATA.test(q.data)) throw erroValidacao("data inválida", ["data"]);
    const p = await previa(repo, tenant, { origem: String(q.origem ?? "FOLHA"), competencia: q.competencia, data: q.data, preferirPix: q.preferirPix === "1" });
    const { itens: fechamentos } = await repo.listar(tenant, "folhaFechamentos", { status: STATUS_COMPETENCIA.FECHADA }, TUDO);
    sucesso(res, {
      ...p, empresa: undefined, conta: { banco: p.conta.banco, agencia: p.conta.conta.agencia, numero: p.conta.conta.numero },
      competenciasFechadas: fechamentos.map((f) => f.id).sort().reverse(),
    });
  });

  r.get("/api/pagamentos/remessas", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "financeiro", "ver");
    const { itens } = await repo.listar(tenant, "remessasPagamento", {}, TUDO);
    sucesso(res, itens.sort((a, b) => b.nsa - a.nsa).map(resumoRemessa));
  });

  r.get("/api/pagamentos/remessas/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "financeiro", "ver");
    const rem = await repo.obter(tenant, "remessasPagamento", ctx.params.id);
    if (!rem) throw erroNaoEncontrado("remessa não encontrada");
    sucesso(res, { ...resumoRemessa(rem), itens: rem.itens, listaPendencias: rem.pendencias, conteudo: rem.conteudo, retornos: rem.retornos ?? [] });
  });

  r.post("/api/pagamentos/remessas", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "financeiro", "criar");
    const d = corpo ?? {};
    if (d.data && !DATA.test(d.data)) throw erroValidacao("data inválida", ["data"]);
    const p = await previa(repo, tenant, { origem: String(d.origem ?? "FOLHA"), competencia: d.competencia, data: d.data, preferirPix: Boolean(d.preferirPix) });
    if (p.jaGerada) throw erroConflito(`a folha de ${p.competencia} já tem remessa (arquivo ${p.jaGerada.nsa}): não gere de novo para não pagar em dobro`);
    if (!p.pagamentos.length) throw erroConflito("nenhum pagamento com dados completos para gerar o arquivo");
    const { itens: anteriores } = await repo.listar(tenant, "remessasPagamento", {}, TUDO);
    const nsa = anteriores.reduce((m, x) => Math.max(m, x.nsa), 0) + 1;
    const geradoEm = new Date();
    const local = { data: dataNoFuso(geradoEm), hora: horaNoFuso(geradoEm) };
    const arquivo = gerarRemessaCNAB240({
      empresa: { cnpj: p.empresa.cnpj, razaoSocial: p.empresa.razaoSocial, banco: p.conta.banco, conta: p.conta.conta, convenio: p.conta.convenio, endereco: p.empresa.endereco },
      pagamentos: p.pagamentos, nsa, geradoEm: local,
      mensagem: p.origem === "FOLHA" ? `SALARIO ${p.competencia}` : "RESCISAO E FERIAS",
    });
    const rem = await repo.inserir(tenant, "remessasPagamento", {
      id: novoId("REM"), nsa, origem: p.origem, competencia: p.competencia, data: p.data, geradaEm: geradoEm.toISOString(), por: ctx.usuario ?? null,
      nomeArquivo: `CNAB240_${p.conta.banco.codigo}_${local.data.replace(/-/g, "")}_${String(nsa).padStart(6, "0")}.REM`,
      quantidade: arquivo.quantidade, total: arquivo.total, lotes: arquivo.lotes, conteudo: arquivo.conteudo,
      hash: createHash("sha256").update(arquivo.conteudo).digest("hex"), status: "GERADA",
      itens: p.pagamentos.map((x) => ({
        seuNumero: x.seuNumero, origem: x.origem, registroId: x.registroId, matricula: x.matricula, nome: x.nome, valor: x.valor, data: x.data,
        forma: x.forma, destino: x.forma === "PIX" ? x.chavePix : `${x.banco} ${x.agencia} ${x.conta}`, status: "ENVIADO", ocorrencias: [],
      })),
      pendencias: p.pendencias, retornos: [],
    });
    sucesso(res, { ...resumoRemessa(rem), conteudo: rem.conteudo }, 201);
  });

  /** Retorno de teste (homologação): o próprio arquivo com todas as ocorrências "00". Não grava nada. */
  r.get("/api/pagamentos/remessas/:id/retorno-teste", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "financeiro", "ver");
    const rem = await repo.obter(tenant, "remessasPagamento", ctx.params.id);
    if (!rem) throw erroNaoEncontrado("remessa não encontrada");
    const conteudo = rem.conteudo.split("\r\n").map((l) => (l[7] === "3" && l[13] === "A" ? `${l.slice(0, 230)}00${" ".repeat(8)}` : l)).join("\r\n");
    sucesso(res, { nomeArquivo: rem.nomeArquivo.replace(/\.REM$/, ".RET"), conteudo });
  });

  r.post("/api/pagamentos/remessas/:id/retorno", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "financeiro", "editar");
    const rem = await repo.obter(tenant, "remessasPagamento", ctx.params.id);
    if (!rem) throw erroNaoEncontrado("remessa não encontrada");
    const lidos = lerRetornoCNAB240(corpo?.conteudo ?? "");
    if (!lidos.length) throw erroValidacao("arquivo de retorno sem segmentos A (confira se é o retorno CNAB 240 desta remessa)", ["conteudo"]);
    const porNumero = new Map(lidos.map((l) => [l.seuNumero, l]));
    const em = new Date().toISOString();
    const itens = rem.itens.map((i) => {
      const l = porNumero.get(i.seuNumero);
      if (!l || i.status === "PAGO") return i;
      return { ...i, status: l.pago ? "PAGO" : "REJEITADO", ocorrencias: l.ocorrencias };
    });
    // Rescisões e férias pagas no retorno: registra o pagamento na data da remessa.
    for (const i of itens.filter((x) => x.status === "PAGO" && x.registroId)) {
      const colecao = i.origem === "RESCISAO" ? "rescisoes" : "ferias";
      const reg = await repo.obter(tenant, colecao, i.registroId);
      if (!reg || reg.status !== "APROVADA") continue;
      const [regras, nomes] = i.origem === "RESCISAO" ? [ACAO_RESCISAO, NOME_STATUS_RESCISAO] : [ACAO_FERIAS, NOME_STATUS_FERIAS];
      const r2 = aplicarAcaoRegistro(regras, nomes, reg, { acao: "PAGAR", usuario: ctx.usuario ?? null, em });
      if (r2.ok) await repo.atualizar(tenant, colecao, reg.id, { ...r2.estado, pagoEm: i.data, foraDoPrazo: i.data > reg.prazoPagamento });
    }
    const naoEncontrados = lidos.filter((l) => !rem.itens.some((i) => i.seuNumero === l.seuNumero)).length;
    const pagos = itens.filter((i) => i.status === "PAGO").length;
    const status = pagos === itens.length ? "PAGA" : itens.some((i) => i.status === "REJEITADO") ? "COM_REJEICOES" : rem.status;
    const gravado = await repo.atualizar(tenant, "remessasPagamento", rem.id, {
      itens, status, retornos: [...(rem.retornos ?? []), { em, por: ctx.usuario ?? null, lidos: lidos.length, naoEncontrados }],
    });
    sucesso(res, { ...resumoRemessa(gravado), naoEncontrados });
  });
}

