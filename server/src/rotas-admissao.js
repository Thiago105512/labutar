/**
 * Admissão digital e exames da clínica do grupo.
 * - Ao admitir (POST /api/colaboradores), nasce a admissão e o exame admissional a agendar.
 * - O colaborador completa os dados e aceita o contrato no portal.
 * - A clínica agenda e registra o ASO (o resultado é do médico: nível Gestor na Clínica). O custo
 *   do exame vai para o centro de custos do contrato — o admissional já entra no kit de admissão,
 *   então não é lançado de novo.
 * - O DP conclui a admissão só com tudo em ordem e ASO apto.
 * O RH vê do exame só a conclusão do ASO (apto/inapto e restrições), nunca prontuário.
 */
import { createHash } from "node:crypto";
import { situacaoDaAdmissao, textoDoContrato, validarPIS, STATUS_ADMISSAO } from "../../packages/admissao/src/index.js";
import { TIPO_EXAME } from "../../packages/clinica/src/index.js";
import { validarLancamentoDeCusto } from "../../packages/custos/src/index.js";
import { validarChavePix } from "../../packages/pagamento/src/index.js";
import { TIPO_CONTA } from "../../packages/acesso/src/index.js";
import { validarDataISO } from "../../packages/core/src/validacao.js";
import { novoId } from "../../packages/core/src/ids.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito } from "./http/resposta.js";
import { exigirPermissao, exigirConta } from "./middleware/contexto.js";
import { carregarCadastro } from "./cadastro.js";
import { gravarLancamentos } from "./rotas-custos.js";
import { pessoaDoColaborador, matriculasDaPessoa } from "./portal-pessoa.js";

const TUDO = { limite: 100_000 };
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const ITEM_DO_EXAME = Object.freeze({ ADMISSIONAL: "ITC_EXAME_ADM", PERIODICO: "ITC_EXAME_PER", DEMISSIONAL: "ITC_EXAME_DEM" });
const STATUS_EXAME = Object.freeze({ A_AGENDAR: "A_AGENDAR", AGENDADO: "AGENDADO", REALIZADO: "REALIZADO", CANCELADO: "CANCELADO" });

/** Abre a admissão e o exame admissional de um vínculo recém-criado. */
export async function iniciarAdmissao(repo, tenant, vinculo, pessoa, usuario = null) {
  const em = new Date().toISOString();
  await repo.inserir(tenant, "admissoes", { id: vinculo.matricula, matricula: vinculo.matricula, pessoaId: vinculo.pessoaId, status: STATUS_ADMISSAO.PENDENTE, contrato: null, criadaEm: em, criadaPor: usuario });
  await repo.inserir(tenant, "exames", {
    id: novoId("EXA"), matricula: vinculo.matricula, pessoaId: vinculo.pessoaId, nome: pessoa?.nome ?? vinculo.matricula, tipo: "ADMISSIONAL",
    codigoESocial: TIPO_EXAME.ADMISSIONAL.codigo, status: STATUS_EXAME.A_AGENDAR, limite: vinculo.admissao, criadoEm: em,
    tomadorId: vinculo.tomadorId ?? null, cargo: vinculo.cargo ?? null,
  });
}

async function exameAdmissional(repo, tenant, matricula) {
  const { itens } = await repo.listar(tenant, "exames", { matricula, tipo: "ADMISSIONAL" }, TUDO);
  return itens.filter((e) => e.status !== STATUS_EXAME.CANCELADO).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0] ?? null;
}

/** Conclusão do ASO, sem nada de saúde além dela. */
const conclusaoDoExame = (e) => e && ({
  id: e.id, tipo: e.tipo, status: e.status, agendadoPara: e.agendadoPara ?? null, hora: e.hora ?? null, local: e.local ?? null,
  resultado: e.resultado ?? null, restricoes: e.restricoes ?? null, asoEm: e.asoEm ?? null, medico: e.medico ?? null,
});

async function dadosDaAdmissao(repo, tenant, matricula, cad = null) {
  const adm = await repo.obter(tenant, "admissoes", matricula);
  if (!adm) throw erroNaoEncontrado("admissão não encontrada");
  cad ??= await carregarCadastro(repo, tenant);
  const vinculo = cad.vinculos.find((v) => v.matricula === matricula);
  const pessoa = cad.pessoa.get(vinculo?.pessoaId) ?? null;
  const exame = await exameAdmissional(repo, tenant, matricula);
  const tomador = cad.tomador.get(vinculo?.tomadorId) ?? null;
  const empresa = (await repo.obter(tenant, "folhaParametros", "empresa")) ?? {};
  const contrato = contratoDe(empresa, { pessoa, vinculo, tomador });
  // Aceite vale para o texto aceito: se os dados do contrato mudaram depois, precisa aceitar de novo.
  const aceiteValido = adm.contrato?.hash === contrato.hash;
  const situacao = situacaoDaAdmissao({ pessoa, admissao: aceiteValido ? adm : { ...adm, contrato: null }, exame });
  return { adm, vinculo, pessoa, exame, situacao, tomador, contrato, aceiteValido };
}

const resumoAdmissao = ({ adm, vinculo, pessoa, exame, situacao, tomador }) => ({
  matricula: adm.matricula, nome: pessoa?.nome ?? adm.matricula, cpf: pessoa?.cpf ?? null, tipo: vinculo?.tipo, cargo: vinculo?.cargo ?? null,
  admissao: vinculo?.admissao, tomador: tomador ? tomador.nomeFantasia || tomador.razaoSocial : null,
  status: situacao.status, etapas: situacao.etapas, podeConcluir: situacao.podeConcluir, exame: conclusaoDoExame(exame),
  contratoAceitoEm: situacao.etapas.find((x) => x.id === "CONTRATO").ok ? adm.contrato.aceitoEm : null, concluidaEm: adm.concluidaEm ?? null,
});

function contratoDe(empresa, d) {
  const texto = textoDoContrato({ empresa, pessoa: d.pessoa ?? {}, vinculo: d.vinculo ?? {}, tomador: d.tomador });
  return { texto, hash: createHash("sha256").update(texto).digest("hex") };
}

/** Dados que o colaborador completa no portal; valida antes de gravar na pessoa. */
function lerDadosDoPortal(corpo) {
  const d = corpo ?? {};
  const erros = [];
  const saida = {};
  for (const campo of ["nomeMae", "rg", "nascimento"]) if (d[campo] != null && String(d[campo]).trim()) saida[campo] = String(d[campo]).trim();
  if (saida.nascimento && !validarDataISO(saida.nascimento).valido) erros.push("data de nascimento inválida");
  if (d.pis) { if (validarPIS(d.pis)) saida.pis = String(d.pis).replace(/\D/g, ""); else erros.push("PIS/NIS inválido"); }
  if (d.endereco) {
    const e = d.endereco;
    const cep = String(e.cep ?? "").replace(/\D/g, "");
    if (cep && cep.length !== 8) erros.push("CEP com 8 dígitos");
    saida.endereco = { cep, logradouro: String(e.logradouro ?? "").trim(), numero: String(e.numero ?? "").trim(), complemento: String(e.complemento ?? "").trim(), bairro: String(e.bairro ?? "").trim(), municipio: String(e.municipio ?? "").trim(), uf: String(e.uf ?? "").trim().toUpperCase().slice(0, 2) };
  }
  if (d.banco) {
    const b = d.banco;
    const pix = b.pix ? validarChavePix(b.pix) : null;
    if (pix && !pix.valida) erros.push(`chave PIX: ${pix.motivo}`);
    saida.banco = {
      banco: b.banco ? String(b.banco).replace(/\D/g, "").padStart(3, "0").slice(-3) : null,
      agencia: b.agencia ? String(b.agencia).replace(/\D/g, "") : null, conta: b.conta ? String(b.conta).trim() : null, pix: pix?.chave ?? null,
    };
  }
  if (erros.length) throw erroValidacao(erros.join("; "), erros);
  return saida;
}

export function registrarRotasAdmissao(r, { repo }) {
  // ------------------------------------------------------------ admissões (DP)

  r.get("/api/admissoes", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "admissao", "ver");
    const cad = await carregarCadastro(repo, tenant);
    const { itens } = await repo.listar(tenant, "admissoes", {}, TUDO);
    const lista = [];
    for (const a of itens) lista.push(resumoAdmissao(await dadosDaAdmissao(repo, tenant, a.matricula, cad)));
    sucesso(res, lista.sort((a, b) => (a.status === "CONCLUIDA") - (b.status === "CONCLUIDA") || String(a.admissao).localeCompare(String(b.admissao))));
  });

  r.get("/api/admissoes/:matricula", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "admissao", "ver");
    const d = await dadosDaAdmissao(repo, tenant, ctx.params.matricula);
    sucesso(res, { ...resumoAdmissao(d), contrato: { ...d.contrato, aceite: d.aceiteValido ? d.adm.contrato : null } });
  });

  r.post("/api/admissoes/:matricula/concluir", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "admissao", "editar");
    const d = await dadosDaAdmissao(repo, tenant, ctx.params.matricula);
    if (d.situacao.status === STATUS_ADMISSAO.CONCLUIDA) throw erroConflito("admissão já concluída");
    if (!d.situacao.podeConcluir) throw erroConflito(`não dá para concluir: ${d.situacao.bloqueios.map((b) => b.motivo).join("; ")}`);
    const em = new Date().toISOString();
    await repo.atualizar(tenant, "admissoes", d.adm.id, { status: STATUS_ADMISSAO.CONCLUIDA, concluidaEm: em, concluidaPor: ctx.usuario ?? null });
    await repo.atualizar(tenant, "vinculos", d.vinculo.id, { admissaoConcluida: true });
    sucesso(res, { status: STATUS_ADMISSAO.CONCLUIDA, concluidaEm: em });
  });

  // ------------------------------------------------------------ clínica: agenda e ASO

  r.get("/api/clinica/exames", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "clinica", "ver");
    const status = String(ctx.query.status ?? "");
    const { itens } = await repo.listar(tenant, "exames", status ? { status } : {}, TUDO);
    const ordem = { A_AGENDAR: 0, AGENDADO: 1, REALIZADO: 2, CANCELADO: 3 };
    sucesso(res, itens.sort((a, b) => ordem[a.status] - ordem[b.status] || String(a.agendadoPara ?? a.limite ?? "").localeCompare(String(b.agendadoPara ?? b.limite ?? ""))));
  });

  r.post("/api/clinica/exames", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "clinica", "criar");
    const d = corpo ?? {};
    if (!TIPO_EXAME[d.tipo]) throw erroValidacao("tipo de exame inválido", ["tipo"]);
    const v = await repo.obter(tenant, "vinculos", d.matricula ?? "");
    if (!v) throw erroNaoEncontrado("colaborador não encontrado");
    const pessoa = await repo.obter(tenant, "pessoas", v.pessoaId);
    const exame = await repo.inserir(tenant, "exames", {
      id: novoId("EXA"), matricula: v.matricula, pessoaId: v.pessoaId, nome: pessoa?.nome ?? v.matricula, tipo: d.tipo, codigoESocial: TIPO_EXAME[d.tipo].codigo,
      status: STATUS_EXAME.A_AGENDAR, limite: d.limite ?? null, criadoEm: new Date().toISOString(), tomadorId: v.tomadorId ?? null, cargo: v.cargo ?? null,
    });
    sucesso(res, exame, 201);
  });

  r.post("/api/clinica/exames/:id/agendar", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "clinica", "editar");
    const e = await repo.obter(tenant, "exames", ctx.params.id);
    if (!e) throw erroNaoEncontrado("exame não encontrado");
    if (e.status === STATUS_EXAME.REALIZADO || e.status === STATUS_EXAME.CANCELADO) throw erroConflito("exame já encerrado");
    const d = corpo ?? {};
    if (!validarDataISO(d.data ?? "").valido) throw erroValidacao("data inválida", ["data"]);
    if (!HORA.test(d.hora ?? "")) throw erroValidacao("hora no formato HH:MM", ["hora"]);
    if (e.tipo === "ADMISSIONAL" && e.limite && d.data > e.limite) throw erroConflito(`o admissional precisa ser feito antes do início (${e.limite})`);
    sucesso(res, await repo.atualizar(tenant, "exames", e.id, { status: STATUS_EXAME.AGENDADO, agendadoPara: d.data, hora: d.hora, local: String(d.local ?? "Clínica do grupo").slice(0, 120) }));
  });

  /** ASO: só o médico (nível Gestor na Clínica) registra o resultado. */
  r.post("/api/clinica/exames/:id/resultado", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "clinica", "aprovar");
    const e = await repo.obter(tenant, "exames", ctx.params.id);
    if (!e) throw erroNaoEncontrado("exame não encontrado");
    if (e.status === STATUS_EXAME.REALIZADO) throw erroConflito("ASO já emitido");
    const d = corpo ?? {};
    if (d.resultado !== "APTO" && d.resultado !== "INAPTO") throw erroValidacao("resultado: APTO ou INAPTO", ["resultado"]);
    if (String(d.medico?.nome ?? "").trim().length < 5 || !/^\d{4,7}\/?[A-Z]{0,2}$/i.test(String(d.medico?.crm ?? "").replace(/[^\dA-Za-z/]/g, ""))) {
      throw erroValidacao("informe o médico e o CRM (ex.: 12345/AM)", ["medico"]);
    }
    const asoEm = validarDataISO(d.data ?? "").valido ? d.data : e.agendadoPara;
    if (!asoEm) throw erroValidacao("informe a data do exame", ["data"]);
    // Custo no centro de custos: o admissional já foi lançado no kit de admissão.
    let custoLancamentoId = null;
    const itemId = ITEM_DO_EXAME[e.tipo] ?? ITEM_DO_EXAME.PERIODICO;
    const item = await repo.obter(tenant, "itensCusto", itemId);
    const { itens: jaLancados } = await repo.listar(tenant, "custosLancamentos", { itemId }, TUDO);
    const doKit = jaLancados.find((l) => l.destino?.matricula === e.matricula && l.origem === "ADMISSAO");
    if (doKit) custoLancamentoId = doKit.id;
    else if (item) {
      const v = validarLancamentoDeCusto({
        data: asoEm, tipo: "EXAME", descricao: `${TIPO_EXAME[e.tipo].nome}: ${e.nome}`, quantidade: 1, custoUnitario: item.custoUnitario,
        itemId: item.id, destino: { tipo: "COLABORADOR", matricula: e.matricula },
      });
      if (v.ok) custoLancamentoId = (await gravarLancamentos(repo, tenant, [v.lancamento], { usuario: ctx.usuario ?? null, origem: "CLINICA" }))[0].id;
    }
    const gravado = await repo.atualizar(tenant, "exames", e.id, {
      status: STATUS_EXAME.REALIZADO, resultado: d.resultado, restricoes: String(d.restricoes ?? "").trim() || null, asoEm,
      medico: { nome: String(d.medico.nome).trim(), crm: String(d.medico.crm).trim().toUpperCase() }, registradoPor: ctx.usuario ?? null, custoLancamentoId,
    });
    sucesso(res, gravado);
  });

  // ------------------------------------------------------------ portal do colaborador

  async function admissaoDoColaborador(ctx) {
    const { tenant, escopo } = exigirConta(ctx, TIPO_CONTA.COLABORADOR);
    const pessoa = await pessoaDoColaborador(repo, tenant, escopo);
    for (const m of await matriculasDaPessoa(repo, tenant, pessoa)) {
      const adm = await repo.obter(tenant, "admissoes", m);
      if (adm && adm.status !== STATUS_ADMISSAO.CONCLUIDA) return { tenant, pessoa, matricula: m };
    }
    throw erroNaoEncontrado("nenhuma admissão em andamento");
  }

  r.get("/api/portal/colaborador/admissao", async (req, res, ctx) => {
    const { tenant, matricula } = await admissaoDoColaborador(ctx);
    const d = await dadosDaAdmissao(repo, tenant, matricula);
    const p = d.pessoa ?? {};
    sucesso(res, {
      ...resumoAdmissao(d),
      dados: { nome: p.nome, cpf: p.cpf, nascimento: p.nascimento ?? null, nomeMae: p.nomeMae ?? null, rg: p.rg ?? null, pis: p.pis ?? null, endereco: p.endereco ?? null, banco: p.banco ?? null },
      contrato: { ...d.contrato, aceite: d.aceiteValido ? d.adm.contrato : null },
    });
  });

  r.put("/api/portal/colaborador/admissao/dados", async (req, res, ctx, corpo) => {
    const { tenant, pessoa, matricula } = await admissaoDoColaborador(ctx);
    const dados = lerDadosDoPortal(corpo);
    await repo.atualizar(tenant, "pessoas", pessoa.id, dados);
    const d = await dadosDaAdmissao(repo, tenant, matricula);
    sucesso(res, resumoAdmissao(d));
  });

  r.post("/api/portal/colaborador/admissao/contrato", async (req, res, ctx, corpo) => {
    const { tenant, matricula } = await admissaoDoColaborador(ctx);
    const d = await dadosDaAdmissao(repo, tenant, matricula);
    const { hash } = d.contrato;
    if (corpo?.aceito !== true) throw erroValidacao("marque que leu e aceita o contrato", ["aceito"]);
    if (corpo?.hash !== hash) throw erroConflito("o contrato mudou desde que você abriu: leia a versão atual antes de aceitar");
    const aceite = { aceitoEm: new Date().toISOString(), hash, ip: req.socket?.remoteAddress ?? null, navegador: String(req.headers?.["user-agent"] ?? "").slice(0, 200) };
    await repo.atualizar(tenant, "admissoes", matricula, { contrato: aceite });
    sucesso(res, resumoAdmissao(await dadosDaAdmissao(repo, tenant, matricula)));
  });
}
