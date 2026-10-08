/**
 * Ponto eletrônico: importação do AFD dos relógios, espelho de ponto por colaborador e mês,
 * tratamento pelo DP (inclusão ou desconsideração de marcação e abono, sempre com motivo e com a
 * marcação original preservada — Portaria MTP 671/2021), aprovação pelo tomador no portal e
 * lançamento na folha com o banco de horas da convenção.
 *
 * Espelho: ABERTO → ENVIADO (DP manda ao tomador) → APROVADO ou CONTESTADO (tomador) → LANCADO
 * (DP lança na folha). Colaborador próprio, sem tomador, é aprovado pelo gestor interno.
 */
import { lerAFD, apurarMes, aplicarBancoDeHoras, lancamentosDoPonto, ESCALAS } from "../../packages/ponto/src/index.js";
import { validarCompetencia, feriadosDoAno, STATUS_FERIAS } from "../../packages/folha/src/index.js";
import { instrumentoAplicavel } from "../../packages/convencoes/src/index.js";
import { PAPEIS_TOMADOR, TIPO_CONTA, podeNoTomador } from "../../packages/acesso/src/index.js";
import { somarDias } from "../../packages/core/src/datas.js";
import { novoId } from "../../packages/core/src/ids.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito, erroSemPermissao } from "./http/resposta.js";
import { exigirPermissao, exigirConta } from "./middleware/contexto.js";
import { carregarCadastro } from "./cadastro.js";
import { carregarConvencoes, instrumentosDoSindicato } from "./convencoes.js";
import { exigirCompetenciaAberta } from "./fechamento.js";

const TUDO = { limite: 100_000 };
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const STATUS_ESPELHO = Object.freeze({ ABERTO: "ABERTO", ENVIADO: "ENVIADO", APROVADO: "APROVADO", CONTESTADO: "CONTESTADO", LANCADO: "LANCADO" });
const EDITAVEL = new Set(["ABERTO", "CONTESTADO"]);

const fimDoMes = (c) => { const [a, m] = c.split("-").map(Number); return `${c}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`; };

function competenciaValida(ctx) {
  const c = ctx.params.competencia;
  if (!validarCompetencia(c)) throw erroValidacao("competência inválida: use AAAA-MM", ["competencia"]);
  return c;
}

/** Tudo o que a apuração de um mês precisa, carregado uma vez. */
async function contextoDoMes(repo, tenant, competencia) {
  const [cad, instrumentos, ferias, espelhos, bancos] = await Promise.all([
    carregarCadastro(repo, tenant),
    carregarConvencoes(repo, tenant),
    repo.listar(tenant, "ferias", {}, TUDO).then((r) => r.itens.filter((f) => f.status !== STATUS_FERIAS.CANCELADA)),
    repo.listar(tenant, "pontoEspelhos", { competencia }, TUDO).then((r) => new Map(r.itens.map((e) => [e.matricula, e]))),
    repo.listar(tenant, "pontoBancoHoras", {}, TUDO).then((r) => new Map(r.itens.map((b) => [b.id, b]))),
  ]);
  const inicio = `${competencia}-01`;
  const fim = fimDoMes(competencia);
  const vinculos = cad.vinculos.filter((v) => v.admissao <= fim && (!v.desligamento || v.desligamento >= inicio));
  return { cad, instrumentos, ferias, espelhos, bancos, vinculos, inicio, fim };
}

/** Apuração de um vínculo no mês: espelho, banco de horas e lançamentos para a folha. */
async function apurarVinculo(repo, tenant, competencia, v, ctxMes) {
  const { cad, instrumentos, ferias, espelhos, bancos, inicio, fim } = ctxMes;
  const pessoa = cad.pessoa.get(v.pessoaId);
  const posto = cad.posto.get(v.postoId);
  const tomador = cad.tomador.get(v.tomadorId);
  const escala = v.escala ?? posto?.escala ?? "44H_SEG_SEX";
  const local = tomador ? { uf: tomador.uf, municipio: tomador.municipio } : { uf: "AM", municipio: "Manaus" };
  const feriados = new Set([...feriadosDoAno(Number(competencia.slice(0, 4)), local)].map((f) => f.data));
  // Até o dia seguinte ao fim do mês: a saída do último plantão noturno.
  const marcacoes = pessoa?.cpf
    ? (await repo.listar(tenant, "pontoMarcacoes", { cpf: pessoa.cpf }, TUDO)).itens.filter((m) => m.data >= inicio && m.data <= somarDias(fim, 1))
    : [];
  const foraDoContrato = new Set();
  for (const f of ferias.filter((x) => x.matricula === v.matricula)) for (let d = f.inicio; d <= f.fim; d = somarDias(d, 1)) foraDoContrato.add(d);
  const espelho = espelhos.get(v.matricula) ?? null;
  const { principal } = instrumentoAplicavel(instrumentosDoSindicato(instrumentos, v.sindicato?.cnpj), {
    data: fim, tomadorCnpj: tomador?.cnpj, postoId: posto?.id, tipoVinculo: v.tipo,
  });
  const doze36 = String(escala).startsWith("12X36");
  const apuracao = apurarMes({
    competencia, escala, marcacoes, feriados, inicio12x36: v.inicio12x36 ?? posto?.inicio12x36 ?? v.admissao,
    ajustes: espelho?.ajustes ?? {}, admissao: v.admissao, desligamento: v.desligamento, foraDoContrato,
  }, {
    noturnoReduzido: !(doze36 && principal?.escala12x36?.horaNoturnaReduzida === false),
    domingoFeriadoEm100: !(doze36 && principal?.escala12x36?.domingosEFeriadosCompensados),
  });
  // Banco: parte do saldo antes deste mês (o que já foi lançado deste mês é refeito do zero).
  const banco = bancos.get(v.matricula);
  const lotesAntes = banco?.aplicadas?.[competencia]?.lotesAntes ?? banco?.lotes ?? [];
  const resultadoBanco = aplicarBancoDeHoras(principal?.bancoHoras ?? null, {
    adesao: Boolean(v.bancoHorasAdesao), extras: apuracao.totais.extras, debito: apuracao.totais.debito, lotes: lotesAntes, competencia, fimDoMes: fim,
  });
  // Mês sem nenhuma marcação (nem ajuste): o AFD dessa pessoa não veio — não são faltas.
  const semMarcacoes = !marcacoes.length && !Object.keys(espelho?.ajustes ?? {}).length;
  const pendencias = !pessoa?.cpf
    ? ["sem CPF: as marcações do relógio (por CPF) não são identificadas"]
    : semMarcacoes ? ["nenhuma marcação no mês: importe o AFD do relógio ou ajuste os dias"] : [];
  return {
    semMarcacoes,
    matricula: v.matricula, nome: pessoa?.nome ?? v.matricula, cpf: pessoa?.cpf ?? null, tipo: v.tipo,
    tomadorId: v.tomadorId ?? null, tomador: tomador ? tomador.nomeFantasia || tomador.razaoSocial : null,
    escala, nomeEscala: ESCALAS[escala]?.nome ?? escala, bancoHorasAdesao: Boolean(v.bancoHorasAdesao),
    instrumento: principal ? principal.registroMTE : null,
    status: espelho?.status ?? STATUS_ESPELHO.ABERTO, espelho, apuracao, banco: { ...resultadoBanco, lotesAntes },
    lancamentos: semMarcacoes ? {} : lancamentosDoPonto(apuracao, resultadoBanco),
    pendencias,
  };
}

const resumo = (a) => ({
  matricula: a.matricula, nome: a.nome, tipo: a.tipo, tomadorId: a.tomadorId, tomador: a.tomador, escala: a.nomeEscala,
  status: a.status, totais: a.apuracao.totais, semMarcacoes: a.semMarcacoes, saldoBanco: a.banco.saldo, bancoHorasAdesao: a.bancoHorasAdesao,
  lancamentos: a.lancamentos, pendencias: a.pendencias, ajustes: Object.keys(a.espelho?.ajustes ?? {}).length,
});

async function gravarEspelho(repo, tenant, competencia, matricula, dados) {
  const id = `${competencia}:${matricula}`;
  const atual = await repo.obter(tenant, "pontoEspelhos", id);
  if (atual) return repo.atualizar(tenant, "pontoEspelhos", id, dados);
  return repo.inserir(tenant, "pontoEspelhos", { id, competencia, matricula, status: STATUS_ESPELHO.ABERTO, ajustes: {}, historico: [], ...dados });
}

const passo = (acao, para, ctxOuNome, motivo = null) => ({ acao, para, por: ctxOuNome, motivo, em: new Date().toISOString() });

async function apurarUm(repo, tenant, competencia, matricula) {
  const ctxMes = await contextoDoMes(repo, tenant, competencia);
  const v = ctxMes.vinculos.find((x) => x.matricula === matricula);
  if (!v) throw erroNaoEncontrado("colaborador sem vínculo nesta competência");
  return apurarVinculo(repo, tenant, competencia, v, ctxMes);
}

/**
 * Importa o AFD: grava cada marcação uma vez (CPF + data + hora), mesmo que o arquivo venha de
 * novo com as anteriores. Marcação de CPF fora do cadastro fica guardada e é contada à parte.
 */
export async function importarAFD(repo, tenant, conteudo, { nome = "AFD", usuario = null } = {}) {
  const lido = lerAFD(conteudo);
  if (!lido.marcacoes.length) throw erroValidacao("nenhuma marcação no arquivo (confira se é o AFD do relógio)", ["conteudo"]);
  const cad = await carregarCadastro(repo, tenant);
  const porCpf = new Set(cad.pessoas.map((p) => p.cpf).filter(Boolean));
  const importacao = { id: novoId("AFD"), nome: String(nome ?? "AFD").slice(0, 120), formato: lido.formato, empregador: lido.empregador, em: new Date().toISOString(), por: usuario };
  let novas = 0, duplicadas = 0;
  const desconhecidos = new Set();
  const competencias = new Set();
  for (const m of lido.marcacoes) {
    if (!m.cpf) { desconhecidos.add(`PIS ${m.pis}`); continue; }
    if (!porCpf.has(m.cpf)) desconhecidos.add(m.cpf);
    const id = `${m.cpf}:${m.data}T${m.hora}`;
    if (await repo.obter(tenant, "pontoMarcacoes", id)) { duplicadas += 1; continue; }
    await repo.inserir(tenant, "pontoMarcacoes", { id, cpf: m.cpf, data: m.data, hora: m.hora, competencia: m.data.slice(0, 7), nsr: m.nsr, importacaoId: importacao.id });
    competencias.add(m.data.slice(0, 7));
    novas += 1;
  }
  const resultado = { ...importacao, lidas: lido.marcacoes.length, novas, duplicadas, naoIdentificadas: desconhecidos.size, competencias: [...competencias].sort(), erros: lido.erros.slice(0, 50) };
  await repo.inserir(tenant, "pontoImportacoes", resultado);
  return resultado;
}

export function registrarRotasPonto(r, { repo }) {
  r.post("/api/ponto/afd", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "ponto", "criar");
    sucesso(res, await importarAFD(repo, tenant, corpo?.conteudo ?? "", { nome: corpo?.nome, usuario: ctx.usuario ?? null }), 201);
  });

  r.get("/api/ponto/importacoes", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "ponto", "ver");
    const { itens } = await repo.listar(tenant, "pontoImportacoes", {}, TUDO);
    sucesso(res, itens.sort((a, b) => b.em.localeCompare(a.em)));
  });

  r.get("/api/ponto/:competencia", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "ponto", "ver");
    const competencia = competenciaValida(ctx);
    const ctxMes = await contextoDoMes(repo, tenant, competencia);
    const itens = [];
    for (const v of ctxMes.vinculos) itens.push(resumo(await apurarVinculo(repo, tenant, competencia, v, ctxMes)));
    itens.sort((a, b) => (a.tomador ?? "~").localeCompare(b.tomador ?? "~") || a.nome.localeCompare(b.nome, "pt-BR"));
    const conta = (s) => itens.filter((i) => i.status === s).length;
    sucesso(res, {
      competencia, itens,
      resumo: { colaboradores: itens.length, abertos: conta("ABERTO"), enviados: conta("ENVIADO"), aprovados: conta("APROVADO"), contestados: conta("CONTESTADO"), lancados: conta("LANCADO"), inconsistencias: itens.filter((i) => i.totais.inconsistencias).length },
    });
  });

  r.get("/api/ponto/:competencia/:matricula", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "ponto", "ver");
    const a = await apurarUm(repo, tenant, competenciaValida(ctx), ctx.params.matricula);
    sucesso(res, { ...resumo(a), dias: a.apuracao.dias, banco: a.banco, historico: a.espelho?.historico ?? [], contestacao: a.espelho?.contestacao ?? null, instrumento: a.instrumento });
  });

  /** Tratamento do DP num dia: marcações corrigidas e/ou abono, com motivo. A original fica guardada. */
  r.put("/api/ponto/:competencia/:matricula/ajustes/:data", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "ponto", "editar");
    const competencia = competenciaValida(ctx);
    const data = ctx.params.data;
    if (!DATA.test(data) || !data.startsWith(competencia)) throw erroValidacao("data fora da competência", ["data"]);
    const d = corpo ?? {};
    if (String(d.motivo ?? "").trim().length < 5) throw erroValidacao("informe o motivo do ajuste", ["motivo"]);
    const horas = d.horas == null ? null : d.horas;
    if (horas && (!Array.isArray(horas) || horas.some((h) => !HORA.test(h)))) throw erroValidacao("marcações no formato HH:MM", ["horas"]);
    const a = await apurarUm(repo, tenant, competencia, ctx.params.matricula);
    if (!EDITAVEL.has(a.status)) throw erroConflito("espelho já enviado ao tomador: só se ajusta depois de contestado");
    const ajustes = { ...(a.espelho?.ajustes ?? {}), [data]: { horas: horas ? [...horas].sort() : null, abonado: Boolean(d.abonado), motivo: String(d.motivo).trim(), por: ctx.usuario ?? null, em: new Date().toISOString() } };
    if (!ajustes[data].horas) delete ajustes[data].horas;
    await gravarEspelho(repo, tenant, competencia, a.matricula, { ajustes, tomadorId: a.tomadorId });
    sucesso(res, { ok: true });
  });

  r.delete("/api/ponto/:competencia/:matricula/ajustes/:data", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "ponto", "editar");
    const competencia = competenciaValida(ctx);
    const a = await apurarUm(repo, tenant, competencia, ctx.params.matricula);
    if (!EDITAVEL.has(a.status)) throw erroConflito("espelho já enviado ao tomador");
    const ajustes = { ...(a.espelho?.ajustes ?? {}) };
    delete ajustes[ctx.params.data];
    await gravarEspelho(repo, tenant, competencia, a.matricula, { ajustes });
    sucesso(res, { ok: true });
  });

  /** Envia ao tomador os espelhos abertos (sem marcação ímpar). Próprios vão para o gestor interno. */
  r.post("/api/ponto/:competencia/enviar", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "ponto", "editar");
    const competencia = competenciaValida(ctx);
    const ctxMes = await contextoDoMes(repo, tenant, competencia);
    const filtro = corpo?.matriculas ? new Set(corpo.matriculas) : null;
    const enviados = [], bloqueados = [];
    for (const v of ctxMes.vinculos.filter((x) => !filtro || filtro.has(x.matricula))) {
      const a = await apurarVinculo(repo, tenant, competencia, v, ctxMes);
      if (!EDITAVEL.has(a.status)) continue;
      if (a.pendencias.length || a.apuracao.totais.inconsistencias) { bloqueados.push({ matricula: a.matricula, nome: a.nome, motivo: a.pendencias[0] ?? `${a.apuracao.totais.inconsistencias} dia(s) com marcação ímpar` }); continue; }
      await gravarEspelho(repo, tenant, competencia, a.matricula, {
        status: STATUS_ESPELHO.ENVIADO, tomadorId: a.tomadorId, totais: a.apuracao.totais, lancamentos: a.lancamentos,
        historico: [...(a.espelho?.historico ?? []), passo("ENVIAR", "ENVIADO", ctx.usuario ?? null)],
      });
      enviados.push(a.matricula);
    }
    sucesso(res, { enviados: enviados.length, bloqueados });
  });

  /** Gestor interno aprova o espelho de quem não tem tomador (próprios) ou no lugar do tomador, com motivo. */
  r.post("/api/ponto/:competencia/:matricula/aprovar", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "ponto", "aprovar");
    const competencia = competenciaValida(ctx);
    const a = await apurarUm(repo, tenant, competencia, ctx.params.matricula);
    if (a.status !== STATUS_ESPELHO.ENVIADO) throw erroConflito("só espelho enviado pode ser aprovado");
    if (a.tomadorId && String(corpo?.motivo ?? "").trim().length < 10) throw erroConflito("espelho de tomador é aprovado no portal; para aprovar no lugar dele, informe o motivo");
    await gravarEspelho(repo, tenant, competencia, a.matricula, {
      status: STATUS_ESPELHO.APROVADO, aprovacao: { por: ctx.usuario ?? null, nome: null, interno: true, em: new Date().toISOString() },
      historico: [...(a.espelho?.historico ?? []), passo("APROVAR", "APROVADO", ctx.usuario ?? null, corpo?.motivo ?? null)],
    });
    sucesso(res, { status: STATUS_ESPELHO.APROVADO });
  });

  /** Lança na folha os espelhos aprovados (campos de ponto do lançamento) e grava o banco de horas. */
  r.post("/api/ponto/:competencia/lancar", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "ponto", "editar");
    exigirPermissao(ctx, "folha", "editar");
    const competencia = competenciaValida(ctx);
    await exigirCompetenciaAberta(repo, tenant, competencia);
    const ctxMes = await contextoDoMes(repo, tenant, competencia);
    const lancados = [];
    for (const v of ctxMes.vinculos) {
      const a = await apurarVinculo(repo, tenant, competencia, v, ctxMes);
      if (a.status !== STATUS_ESPELHO.APROVADO) continue;
      const id = `${competencia}:${a.matricula}`;
      const atual = (await repo.obter(tenant, "folhaLancamentos", id)) ?? null;
      // Os campos do ponto são substituídos; os demais lançamentos do DP ficam.
      const campos = ["horasExtras50", "horasExtras100", "horasNoturnas", "faltasDias", "dsrPerdidos", "atrasosHoras", "intervaloSuprimidoHoras"];
      const base = Object.fromEntries(Object.entries(atual ?? {}).filter(([k]) => !campos.includes(k)));
      const doc = { ...base, id, competencia, matricula: a.matricula, ...a.lancamentos, origemPonto: true, alteradoPor: ctx.usuario ?? null };
      if (atual) await repo.atualizar(tenant, "folhaLancamentos", id, doc); else await repo.inserir(tenant, "folhaLancamentos", doc);
      const banco = ctxMes.bancos.get(a.matricula);
      const registroBanco = { lotes: a.banco.lotes, aplicadas: { ...(banco?.aplicadas ?? {}), [competencia]: { lotesAntes: a.banco.lotesAntes, creditado: a.banco.creditado, compensado: a.banco.compensado, vencido: a.banco.vencido } } };
      if (banco) await repo.atualizar(tenant, "pontoBancoHoras", a.matricula, registroBanco); else await repo.inserir(tenant, "pontoBancoHoras", { id: a.matricula, ...registroBanco });
      await gravarEspelho(repo, tenant, competencia, a.matricula, {
        status: STATUS_ESPELHO.LANCADO, lancamentos: a.lancamentos,
        historico: [...(a.espelho?.historico ?? []), passo("LANCAR", "LANCADO", ctx.usuario ?? null)],
      });
      lancados.push({ matricula: a.matricula, nome: a.nome, lancamentos: a.lancamentos });
    }
    sucesso(res, { lancados: lancados.length, itens: lancados });
  });

  // ------------------------------------------------------------ portal do tomador

  function exigirTomador(ctx, acao) {
    const conta = exigirConta(ctx, TIPO_CONTA.TOMADOR);
    if (acao && !podeNoTomador(conta.escopo.papel, acao)) throw erroSemPermissao(`seu papel (${PAPEIS_TOMADOR.find((p) => p.id === conta.escopo.papel)?.nome ?? "—"}) não permite esta ação`);
    return conta;
  }

  r.get("/api/portal/tomador/ponto", async (req, res, ctx) => {
    const { tenant, escopo } = exigirTomador(ctx, "verPresenca");
    const { itens } = await repo.listar(tenant, "pontoEspelhos", { tomadorId: escopo.tomadorId }, TUDO);
    const visiveis = itens.filter((e) => e.status !== STATUS_ESPELHO.ABERTO);
    const cad = await carregarCadastro(repo, tenant);
    const nome = (m) => cad.pessoa.get(cad.vinculos.find((v) => v.matricula === m)?.pessoaId)?.nome ?? m;
    sucesso(res, {
      podeAprovar: podeNoTomador(escopo.papel, "aprovarPonto"),
      itens: visiveis.map((e) => ({ competencia: e.competencia, matricula: e.matricula, nome: nome(e.matricula), status: e.status, totais: e.totais, contestacao: e.contestacao ?? null }))
        .sort((a, b) => b.competencia.localeCompare(a.competencia) || a.nome.localeCompare(b.nome, "pt-BR")),
    });
  });

  r.get("/api/portal/tomador/ponto/:competencia/:matricula", async (req, res, ctx) => {
    const { tenant, escopo } = exigirTomador(ctx, "verPresenca");
    const competencia = competenciaValida(ctx);
    const e = await repo.obter(tenant, "pontoEspelhos", `${competencia}:${ctx.params.matricula}`);
    if (!e || e.tomadorId !== escopo.tomadorId || e.status === STATUS_ESPELHO.ABERTO) throw erroNaoEncontrado("espelho não encontrado");
    const a = await apurarUm(repo, tenant, competencia, e.matricula);
    sucesso(res, {
      competencia, matricula: a.matricula, nome: a.nome, escala: a.nomeEscala, status: e.status, totais: a.apuracao.totais,
      dias: a.apuracao.dias.map((d) => ({ data: d.data, marcacoes: d.marcacoes, previsto: d.previsto, trabalhado: d.trabalhado, extra: d.extra, extra100: d.extra100, debito: d.debito, falta: d.falta, abonado: d.abonado, ajustado: Boolean(d.ajuste), motivoAjuste: d.ajuste?.motivo ?? null, foraDoContrato: Boolean(d.foraDoContrato) })),
    });
  });

  r.post("/api/portal/tomador/ponto/:competencia/:matricula", async (req, res, ctx, corpo) => {
    const { tenant, escopo, usuario } = exigirTomador(ctx, "aprovarPonto");
    const competencia = competenciaValida(ctx);
    const e = await repo.obter(tenant, "pontoEspelhos", `${competencia}:${ctx.params.matricula}`);
    if (!e || e.tomadorId !== escopo.tomadorId) throw erroNaoEncontrado("espelho não encontrado");
    if (e.status !== STATUS_ESPELHO.ENVIADO) throw erroConflito("este espelho não está aguardando aprovação");
    const acao = corpo?.acao;
    const motivo = String(corpo?.motivo ?? "").trim();
    if (acao === "CONTESTAR" && motivo.length < 10) throw erroValidacao("descreva o que está errado (pelo menos 10 caracteres)", ["motivo"]);
    if (acao !== "APROVAR" && acao !== "CONTESTAR") throw erroValidacao("ação: APROVAR ou CONTESTAR", ["acao"]);
    const para = acao === "APROVAR" ? STATUS_ESPELHO.APROVADO : STATUS_ESPELHO.CONTESTADO;
    const quem = { id: usuario.id, nome: usuario.nome, tomador: escopo.tomadorNome ?? escopo.tomadorId };
    await repo.atualizar(tenant, "pontoEspelhos", e.id, {
      status: para,
      ...(acao === "APROVAR" ? { aprovacao: { ...quem, em: new Date().toISOString() } } : { contestacao: { ...quem, motivo, em: new Date().toISOString() } }),
      historico: [...(e.historico ?? []), passo(acao, para, `${quem.nome} (${quem.tomador})`, motivo || null)],
    });
    sucesso(res, { status: para });
  });
}
