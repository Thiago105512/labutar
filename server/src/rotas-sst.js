/**
 * SST: EPI com CA e ficha do colaborador, riscos por posto (PGR), CAT e PPP. A entrega de EPI
 * lança o custo no centro de custos do contrato (como uniforme e exame) e o colaborador confirma
 * o recebimento no portal.
 */
import { validarCA, pendenciasDeEPI, prazoDaCAT, validarCAT, validarRiscos, montarPPP, TIPO_RISCO, TIPO_CAT } from "../../packages/sst/src/index.js";
import { validarLancamentoDeCusto } from "../../packages/custos/src/index.js";
import { feriadosDoAno } from "../../packages/folha/src/index.js";
import { TIPO_CONTA } from "../../packages/acesso/src/index.js";
import { validarDataISO } from "../../packages/core/src/validacao.js";
import { hoje, somarDias } from "../../packages/core/src/datas.js";
import { novoId } from "../../packages/core/src/ids.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito } from "./http/resposta.js";
import { exigirPermissao, exigirConta } from "./middleware/contexto.js";
import { carregarCadastro } from "./cadastro.js";
import { gravarLancamentos } from "./rotas-custos.js";
import { pessoaDoColaborador, matriculasDaPessoa } from "./portal-pessoa.js";

const TUDO = { limite: 100_000 };

async function episDoCatalogo(repo, tenant) {
  const { itens } = await repo.listar(tenant, "itensCusto", { tipo: "EPI" }, TUDO);
  return itens;
}

const exigidosDoPosto = (posto, epis) => (posto?.episExigidos ?? []).map((id) => epis.find((e) => e.id === id)).filter(Boolean).map((e) => ({ itemId: e.id, nome: e.nome, vidaUtilMeses: e.vidaUtilMeses ?? null }));

/** Situação de SST de um vínculo: posto, riscos, entregas e pendências de EPI. */
async function situacaoDoVinculo(repo, tenant, v, cad, epis, data) {
  const posto = cad.posto.get(v.postoId) ?? null;
  const { itens: entregas } = await repo.listar(tenant, "episEntregues", { matricula: v.matricula }, TUDO);
  const exigidos = exigidosDoPosto(posto, epis);
  return {
    matricula: v.matricula, nome: cad.pessoa.get(v.pessoaId)?.nome ?? v.matricula, cargo: v.cargo ?? posto?.funcao ?? null,
    tomador: cad.tomador.get(v.tomadorId)?.razaoSocial ?? null, postoId: posto?.id ?? null, riscos: posto?.riscos ?? [],
    exigidos, entregas: entregas.sort((a, b) => b.data.localeCompare(a.data)), pendencias: pendenciasDeEPI(exigidos, entregas, data),
  };
}

export function registrarRotasSST(r, { repo }) {
  r.get("/api/sst/painel", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "sst", "ver");
    const data = hoje();
    const [cad, epis, { itens: cats }] = await Promise.all([carregarCadastro(repo, tenant), episDoCatalogo(repo, tenant), repo.listar(tenant, "cats", {}, TUDO)]);
    const ativos = cad.vinculos.filter((v) => v.postoId && (!v.desligamento || v.desligamento >= data) && v.admissao <= data);
    const colaboradores = [];
    for (const v of ativos) colaboradores.push(await situacaoDoVinculo(repo, tenant, v, cad, epis, data));
    sucesso(res, {
      data,
      epis: epis.map((e) => ({ id: e.id, nome: e.nome, custoUnitario: e.custoUnitario, vidaUtilMeses: e.vidaUtilMeses ?? null, ca: e.ca ?? null, situacaoCA: validarCA(e.ca, data) })),
      postos: cad.postos.map((p) => ({ id: p.id, funcao: p.funcao, tomador: cad.tomador.get(p.tomadorId)?.razaoSocial ?? null, riscos: p.riscos ?? [], episExigidos: p.episExigidos ?? [], insalubridadeGrau: p.insalubridadeGrau ?? null })),
      colaboradores: colaboradores.sort((a, b) => b.pendencias.length - a.pendencias.length || a.nome.localeCompare(b.nome, "pt-BR")),
      cats: cats.sort((a, b) => b.data.localeCompare(a.data)),
      tiposRisco: TIPO_RISCO, tiposCAT: TIPO_CAT,
    });
  });

  r.patch("/api/sst/epis/:itemId", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "sst", "editar");
    const item = await repo.obter(tenant, "itensCusto", ctx.params.itemId);
    if (!item || item.tipo !== "EPI") throw erroNaoEncontrado("EPI não encontrado no catálogo");
    const ca = { numero: String(corpo?.ca?.numero ?? "").trim(), validade: corpo?.ca?.validade ?? null };
    if (!/^\d{1,6}$/.test(ca.numero)) throw erroValidacao("número do CA com até 6 dígitos", ["ca.numero"]);
    if (!validarDataISO(ca.validade ?? "").valido) throw erroValidacao("validade do CA inválida", ["ca.validade"]);
    const vida = corpo?.vidaUtilMeses == null ? item.vidaUtilMeses ?? null : Number(corpo.vidaUtilMeses);
    if (vida != null && !(Number.isInteger(vida) && vida >= 1 && vida <= 60)) throw erroValidacao("vida útil de 1 a 60 meses", ["vidaUtilMeses"]);
    sucesso(res, await repo.atualizar(tenant, "itensCusto", item.id, { ca, vidaUtilMeses: vida }));
  });

  r.put("/api/sst/postos/:postoId/riscos", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "sst", "editar");
    const posto = await repo.obter(tenant, "postos", ctx.params.postoId);
    if (!posto) throw erroNaoEncontrado("posto não encontrado");
    const riscos = (corpo?.riscos ?? []).map((x) => ({ tipo: x.tipo, agente: String(x.agente ?? "").trim(), intensidade: x.intensidade ?? null, medidas: x.medidas ?? null }));
    const v = validarRiscos(riscos);
    if (!v.ok) throw erroValidacao(v.erros.join("; "), v.erros);
    const epis = await episDoCatalogo(repo, tenant);
    const episExigidos = [...new Set(corpo?.episExigidos ?? [])];
    const desconhecido = episExigidos.find((id) => !epis.some((e) => e.id === id));
    if (desconhecido) throw erroValidacao(`EPI ${desconhecido} não está no catálogo`, ["episExigidos"]);
    sucesso(res, await repo.atualizar(tenant, "postos", posto.id, { riscos, episExigidos, riscosAtualizadosEm: hoje(), riscosPor: ctx.usuario ?? null }));
  });

  /** Entrega de EPI: só com CA válido; vai para a ficha e para o custo do contrato. */
  r.post("/api/sst/entregas", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "sst", "criar");
    const d = corpo ?? {};
    const data = d.data ?? hoje();
    if (!validarDataISO(data).valido) throw erroValidacao("data inválida", ["data"]);
    const quantidade = Number(d.quantidade ?? 1);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 100) throw erroValidacao("quantidade de 1 a 100", ["quantidade"]);
    const v = await repo.obter(tenant, "vinculos", d.matricula ?? "");
    if (!v) throw erroNaoEncontrado("colaborador não encontrado");
    const item = await repo.obter(tenant, "itensCusto", d.itemId ?? "");
    if (!item || item.tipo !== "EPI") throw erroNaoEncontrado("EPI não encontrado no catálogo");
    const ca = validarCA(item.ca, data);
    if (!ca.valido) throw erroConflito(`não entregue: ${ca.motivo} (NR-6 exige CA válido)`);
    const lanc = validarLancamentoDeCusto({
      data, tipo: "EPI", descricao: `${item.nome} (CA ${item.ca.numero})`, quantidade, custoUnitario: item.custoUnitario,
      amortizarMeses: item.amortizarMeses ?? 1, itemId: item.id, destino: { tipo: "COLABORADOR", matricula: v.matricula },
    });
    const [custo] = await gravarLancamentos(repo, tenant, [lanc.lancamento], { usuario: ctx.usuario ?? null, origem: "SST" });
    const entrega = await repo.inserir(tenant, "episEntregues", {
      id: novoId("EPI"), matricula: v.matricula, pessoaId: v.pessoaId, itemId: item.id, nome: item.nome, quantidade, data,
      ca: { ...item.ca }, entreguePor: ctx.usuario ?? null, confirmadaEm: null, custoLancamentoId: custo.id,
    });
    sucesso(res, entrega, 201);
  });

  r.post("/api/sst/cats", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "sst", "criar");
    const d = { ...corpo, diasAfastamento: corpo?.diasAfastamento == null ? undefined : Number(corpo.diasAfastamento) };
    const v = validarCAT(d);
    if (!v.ok) throw erroValidacao(v.erros.join("; "), v.erros);
    const vinculo = await repo.obter(tenant, "vinculos", d.matricula ?? "");
    if (!vinculo) throw erroNaoEncontrado("colaborador não encontrado");
    const ano = Number(d.data.slice(0, 4));
    const feriados = new Set([...feriadosDoAno(ano, { uf: "AM", municipio: "Manaus" }), ...feriadosDoAno(ano + 1, { uf: "AM", municipio: "Manaus" })].map((f) => f.data));
    const prazo = prazoDaCAT({ data: d.data, obito: Boolean(d.obito) }, feriados);
    const registradaEm = hoje();
    const pessoa = await repo.obter(tenant, "pessoas", vinculo.pessoaId);
    const cat = await repo.inserir(tenant, "cats", {
      id: novoId("CAT"), matricula: vinculo.matricula, nome: pessoa?.nome ?? vinculo.matricula, data: d.data, hora: d.hora ?? null, tipo: d.tipo,
      descricao: String(d.descricao).trim(), parteAtingida: String(d.parteAtingida).trim(), afastamento: Boolean(d.afastamento),
      diasAfastamento: d.afastamento ? d.diasAfastamento : null, obito: Boolean(d.obito), prazo, registradaEm, foraDoPrazo: registradaEm > prazo,
      tomadorId: vinculo.tomadorId ?? null, por: ctx.usuario ?? null,
      // Afastamento acima de 15 dias: a partir do 16º dia é benefício do INSS (S-2230); ASO de retorno se 30 dias ou mais.
      retornoComASO: Boolean(d.afastamento && d.diasAfastamento >= 30),
      retornoPrevisto: d.afastamento ? somarDias(d.data, d.diasAfastamento) : null,
    });
    sucesso(res, cat, 201);
  });

  r.get("/api/sst/colaboradores/:matricula", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "sst", "ver");
    const cad = await carregarCadastro(repo, tenant);
    const v = cad.vinculos.find((x) => x.matricula === ctx.params.matricula);
    if (!v) throw erroNaoEncontrado("colaborador não encontrado");
    const [epis, empresa, { itens: exames }, { itens: cats }] = await Promise.all([
      episDoCatalogo(repo, tenant), repo.obter(tenant, "folhaParametros", "empresa"),
      repo.listar(tenant, "exames", { matricula: v.matricula }, TUDO), repo.listar(tenant, "cats", { matricula: v.matricula }, TUDO),
    ]);
    const s = await situacaoDoVinculo(repo, tenant, v, cad, epis, hoje());
    const posto = cad.posto.get(v.postoId) ?? null;
    sucesso(res, {
      ...s, cats,
      ppp: montarPPP({ empresa: empresa ?? {}, pessoa: cad.pessoa.get(v.pessoaId) ?? {}, vinculo: v, posto, tomador: cad.tomador.get(v.tomadorId) ?? null, riscos: posto?.riscos ?? [], entregas: s.entregas, exames, cats }),
    });
  });

  // ------------------------------------------------------------ portal do colaborador

  r.get("/api/portal/colaborador/epis", async (req, res, ctx) => {
    const { tenant, escopo } = exigirConta(ctx, TIPO_CONTA.COLABORADOR);
    const matriculas = await matriculasDaPessoa(repo, tenant, await pessoaDoColaborador(repo, tenant, escopo));
    const lista = [];
    for (const m of matriculas) lista.push(...(await repo.listar(tenant, "episEntregues", { matricula: m }, TUDO)).itens);
    sucesso(res, lista.sort((a, b) => b.data.localeCompare(a.data)).map((e) => ({ id: e.id, nome: e.nome, quantidade: e.quantidade, data: e.data, ca: e.ca, confirmadaEm: e.confirmadaEm })));
  });

  /** O colaborador confirma que recebeu o EPI e foi orientado sobre o uso (NR-6). */
  r.post("/api/portal/colaborador/epis/:id/confirmar", async (req, res, ctx) => {
    const { tenant, escopo } = exigirConta(ctx, TIPO_CONTA.COLABORADOR);
    const matriculas = await matriculasDaPessoa(repo, tenant, await pessoaDoColaborador(repo, tenant, escopo));
    const e = await repo.obter(tenant, "episEntregues", ctx.params.id);
    if (!e || !matriculas.has(e.matricula)) throw erroNaoEncontrado("entrega não encontrada");
    if (e.confirmadaEm) throw erroConflito("recebimento já confirmado");
    sucesso(res, await repo.atualizar(tenant, "episEntregues", e.id, { confirmadaEm: new Date().toISOString() }));
  });
}
