/**
 * Página inicial: o que precisa da pessoa hoje, em todos os módulos que o perfil dela libera.
 * Cada pendência diz o que fazer, quantas são, o prazo quando há, e leva à tela que resolve.
 * A competência em trabalho é a do mês anterior (a folha de setembro fecha em outubro).
 */
import { pode } from "../../packages/acesso/src/index.js";
import { STATUS_COMPETENCIA } from "../../packages/folha/src/index.js";
import { validarCA, pendenciasDeEPI } from "../../packages/sst/src/index.js";
import { hoje, somarDias, formatarDataBR } from "../../packages/core/src/datas.js";
import { sucesso } from "./http/resposta.js";
import { exigirUsuario } from "./middleware/contexto.js";
import { obterFechamento } from "./fechamento.js";
import { carregarCadastro } from "./cadastro.js";
import { dadosDaAdmissao } from "./rotas-admissao.js";
import { quintoDiaUtil } from "./rotas-pagamento.js";

const TUDO = { limite: 100_000 };

/** Competência anterior a uma data (AAAA-MM). */
export function competenciaEmTrabalho(data) {
  const [a, m] = data.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

const tela = (c) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Pendências por módulo. Cada uma: { modulo, titulo, detalhe, quantidade, prioridade: ALTA|MEDIA|INFO, link, prazo? }
 */
export async function pendenciasDoInicio(repo, tenant, acesso, data = hoje()) {
  const p = (modulo, acao) => pode(acesso, modulo, acao);
  const competencia = competenciaEmTrabalho(data);
  const itens = [];
  const add = (x) => { if (x.quantidade !== 0) itens.push(x); };
  const cad = await carregarCadastro(repo, tenant);
  const ativos = cad.vinculos.filter((v) => v.admissao <= data && (!v.desligamento || v.desligamento >= data));

  // ---------------------------------------------------------------- folha
  if (p("folha", "ver")) {
    const f = await obterFechamento(repo, tenant, competencia);
    if (f.status === STATUS_COMPETENCIA.ABERTA && p("folha", "editar")) {
      add({ modulo: "folha", titulo: `Folha de ${tela(competencia)} aberta`, detalhe: "Confira os lançamentos e envie para conferência; o prazo é o do pagamento (5º dia útil).", quantidade: null, prioridade: "ALTA", link: "#/folha/resumo", prazo: quintoDiaUtil(competencia, { uf: "AM", municipio: "Manaus" }) });
    }
    if (f.status === STATUS_COMPETENCIA.EM_CONFERENCIA) {
      add(p("folha", "aprovar")
        ? { modulo: "folha", titulo: `Folha de ${tela(competencia)} aguarda seu fechamento`, detalhe: "Feche para publicar os holerites e liberar o pagamento (5º dia útil).", quantidade: null, prioridade: "ALTA", link: "#/folha/resumo", prazo: quintoDiaUtil(competencia, { uf: "AM", municipio: "Manaus" }) }
        : { modulo: "folha", titulo: `Folha de ${tela(competencia)} em conferência`, detalhe: "Aguardando o gestor fechar.", quantidade: null, prioridade: "INFO", link: "#/folha/resumo" });
    }
    const [{ itens: rescisoes }, { itens: ferias }] = await Promise.all([repo.listar(tenant, "rescisoes", {}, TUDO), repo.listar(tenant, "ferias", {}, TUDO)]);
    if (p("folha", "aprovar")) {
      add({ modulo: "folha", titulo: "Rescisões para aprovar", detalhe: "Calculadas pelo DP; aprovadas, o custo vai para o contrato.", quantidade: rescisoes.filter((r) => r.status === "CALCULADA").length, prioridade: "ALTA", link: "#/folha/rescisao", prazo: rescisoes.filter((r) => r.status === "CALCULADA").map((r) => r.prazoPagamento).sort()[0] });
      add({ modulo: "folha", titulo: "Férias para aprovar", detalhe: "Programadas pelo DP.", quantidade: ferias.filter((r) => r.status === "PROGRAMADA").length, prioridade: "MEDIA", link: "#/folha/rescisao", prazo: ferias.filter((r) => r.status === "PROGRAMADA").map((r) => r.prazoPagamento).sort()[0] });
    }
    const vencendo = [...rescisoes, ...ferias].filter((r) => r.status === "APROVADA" && r.prazoPagamento <= somarDias(data, 3));
    add({ modulo: "folha", titulo: "Pagamentos de rescisão ou férias no prazo", detalhe: "Aprovados e ainda não pagos; o prazo é legal (art. 477 e art. 145 da CLT).", quantidade: vencendo.length, prioridade: "ALTA", link: "#/folha/rescisao", prazo: vencendo.map((r) => r.prazoPagamento).sort()[0] });
  }
  if (p("colaboradores", "ver")) {
    const semCPF = ativos.filter((v) => !cad.pessoa.get(v.pessoaId)?.cpf).length;
    add({ modulo: "colaboradores", titulo: "Colaboradores sem CPF", detalhe: "Sem CPF não há eSocial, pagamento nem ponto pelo relógio.", quantidade: semCPF, prioridade: "MEDIA", link: "#/colaboradores" });
  }

  // ---------------------------------------------------------------- ponto
  if (p("ponto", "ver")) {
    const { itens: espelhos } = await repo.listar(tenant, "pontoEspelhos", { competencia }, TUDO);
    const conta = (s) => espelhos.filter((e) => e.status === s).length;
    if (p("ponto", "editar")) {
      add({ modulo: "ponto", titulo: `Espelhos de ${tela(competencia)} contestados pelo tomador`, detalhe: "Trate os dias apontados e envie de novo.", quantidade: conta("CONTESTADO"), prioridade: "ALTA", link: "#/ponto/espelhos" });
      add({ modulo: "ponto", titulo: `Espelhos de ${tela(competencia)} aprovados para lançar na folha`, detalhe: "Horas extras, faltas e noturno entram na folha aberta.", quantidade: conta("APROVADO"), prioridade: "MEDIA", link: "#/ponto/espelhos" });
      const alocados = cad.vinculos.filter((v) => v.tomadorId && v.admissao <= `${competencia}-31` && (!v.desligamento || v.desligamento >= `${competencia}-01`)).length;
      const naoEnviados = Math.max(0, alocados - espelhos.filter((e) => e.status !== "ABERTO").length);
      add({ modulo: "ponto", titulo: `Espelhos de ${tela(competencia)} a enviar ao tomador`, detalhe: "Trate as marcações e envie para aprovação no portal.", quantidade: naoEnviados, prioridade: "MEDIA", link: "#/ponto/espelhos" });
    }
    add({ modulo: "ponto", titulo: `Espelhos de ${tela(competencia)} com o tomador`, detalhe: "Aguardando aprovação no portal do tomador.", quantidade: conta("ENVIADO"), prioridade: "INFO", link: "#/ponto/espelhos" });
  }

  // ---------------------------------------------------------------- admissão e clínica
  if (p("admissao", "ver")) {
    const { itens: admissoes } = await repo.listar(tenant, "admissoes", {}, TUDO);
    const abertas = [];
    for (const a of admissoes.filter((x) => x.status !== "CONCLUIDA")) abertas.push({ ...(await dadosDaAdmissao(repo, tenant, a.matricula, cad)) });
    const prontas = abertas.filter((d) => d.situacao.podeConcluir);
    const bloqueadas = abertas.filter((d) => d.situacao.status === "BLOQUEADA");
    if (p("admissao", "editar")) add({ modulo: "admissao", titulo: "Admissões prontas para concluir", detalhe: "Documentos, ASO apto e contrato aceito.", quantidade: prontas.length, prioridade: "ALTA", link: "#/admissao/admissoes" });
    add({ modulo: "admissao", titulo: "Admissões bloqueadas por ASO inapto", detalhe: "Não podem começar: fale com a clínica e com o tomador.", quantidade: bloqueadas.length, prioridade: "ALTA", link: "#/admissao/admissoes" });
    const andamento = abertas.filter((d) => !d.situacao.podeConcluir && d.situacao.status !== "BLOQUEADA");
    add({ modulo: "admissao", titulo: "Admissões em andamento", detalhe: andamento.length ? `Próximo início em ${formatarDataBR(andamento.map((d) => d.vinculo?.admissao).sort()[0])}; o colaborador completa pelo portal.` : "", quantidade: andamento.length, prioridade: "MEDIA", link: "#/admissao/admissoes", prazo: andamento.map((d) => d.vinculo?.admissao).sort()[0] });
  }
  if (p("clinica", "ver")) {
    const { itens: exames } = await repo.listar(tenant, "exames", {}, TUDO);
    if (p("clinica", "editar")) add({ modulo: "clinica", titulo: "Exames a agendar", detalhe: "O admissional precisa ser feito antes do início.", quantidade: exames.filter((e) => e.status === "A_AGENDAR").length, prioridade: "ALTA", link: "#/clinica/agenda", prazo: exames.filter((e) => e.status === "A_AGENDAR").map((e) => e.limite).filter(Boolean).sort()[0] });
    if (p("clinica", "aprovar")) add({ modulo: "clinica", titulo: "ASO a emitir", detalhe: "Exames agendados até hoje sem ASO.", quantidade: exames.filter((e) => e.status === "AGENDADO" && e.agendadoPara <= data).length, prioridade: "ALTA", link: "#/clinica/agenda" });
  }

  // ---------------------------------------------------------------- financeiro
  if (p("financeiro", "ver")) {
    const [{ itens: medicoes }, { itens: remessas }, f] = await Promise.all([
      repo.listar(tenant, "medicoes", { competencia }, TUDO), repo.listar(tenant, "remessasPagamento", {}, TUDO), obterFechamento(repo, tenant, competencia),
    ]);
    const conta = (s) => medicoes.filter((m) => m.status === s).length;
    if (f.status === STATUS_COMPETENCIA.FECHADA && !remessas.some((r) => r.origem === "FOLHA" && r.competencia === competencia) && p("financeiro", "criar")) {
      add({ modulo: "financeiro", titulo: `Pagamento da folha de ${tela(competencia)}`, detalhe: "Folha fechada: gere o arquivo do banco.", quantidade: null, prioridade: "ALTA", link: "#/financeiro/pagamentos", prazo: quintoDiaUtil(competencia, { uf: "AM", municipio: "Manaus" }) });
    }
    const comPreco = cad.contratos.filter((c) => c.faturamento && c.inicio <= `${competencia}-31` && (!c.fim || c.fim >= `${competencia}-01`)).length;
    if (p("financeiro", "editar")) {
      add({ modulo: "financeiro", titulo: `Medições de ${tela(competencia)} a enviar`, detalhe: "Calculadas do centro de custos e do ponto aprovado.", quantidade: Math.max(0, comPreco - medicoes.length) + conta("RASCUNHO"), prioridade: "MEDIA", link: "#/financeiro/medicoes" });
      add({ modulo: "financeiro", titulo: "Medições contestadas pelo tomador", detalhe: "Revise e reenvie.", quantidade: conta("CONTESTADA"), prioridade: "ALTA", link: "#/financeiro/medicoes" });
    }
    if (p("financeiro", "criar")) add({ modulo: "financeiro", titulo: "Medições aprovadas para faturar", detalhe: "Emita o RPS.", quantidade: conta("APROVADA"), prioridade: "ALTA", link: "#/financeiro/medicoes" });
    const semCusto = cad.contratos.filter((c) => !c.faturamento && (!c.fim || c.fim >= `${competencia}-01`)).length;
    add({ modulo: "financeiro", titulo: "Contratos sem preço de faturamento", detalhe: "Sem preço não há medição nem margem no resultado.", quantidade: semCusto, prioridade: "MEDIA", link: "#/financeiro/resultado" });
  }

  // ---------------------------------------------------------------- SST
  if (p("sst", "ver")) {
    const { itens: epis } = await repo.listar(tenant, "itensCusto", { tipo: "EPI" }, TUDO);
    const vencidos = epis.filter((e) => e.ca && !validarCA(e.ca, data).valido);
    add({ modulo: "sst", titulo: "EPI com CA vencido", detalhe: vencidos.map((e) => e.nome).join(", ") + ": não pode ser entregue até renovar o CA.", quantidade: vencidos.length, prioridade: "ALTA", link: "#/sst/pgr" });
    const { itens: entregas } = await repo.listar(tenant, "episEntregues", {}, TUDO);
    let semEPI = 0;
    for (const v of ativos.filter((x) => x.postoId)) {
      const posto = cad.posto.get(v.postoId);
      const exigidos = (posto?.episExigidos ?? []).map((id) => epis.find((e) => e.id === id)).filter(Boolean).map((e) => ({ itemId: e.id, nome: e.nome, vidaUtilMeses: e.vidaUtilMeses ?? null }));
      if (pendenciasDeEPI(exigidos, entregas.filter((e) => e.matricula === v.matricula), data).length) semEPI += 1;
    }
    add({ modulo: "sst", titulo: "Colaboradores sem o EPI exigido no posto", detalhe: "Pelo PGR do posto: não entregue ou troca vencida.", quantidade: semEPI, prioridade: "MEDIA", link: "#/sst/colaboradores" });
  }

  const ordem = { ALTA: 0, MEDIA: 1, INFO: 2 };
  itens.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade] || String(a.prazo ?? "9").localeCompare(String(b.prazo ?? "9")));
  return { data, competencia, itens };
}

export function registrarRotasInicio(r, { repo }) {
  r.get("/api/inicio/pendencias", async (req, res, ctx) => {
    exigirUsuario(ctx);
    const tenant = ctx.tenant;
    if (ctx.tipoConta !== "INTERNO") return sucesso(res, { data: hoje(), competencia: null, itens: [] });
    sucesso(res, await pendenciasDoInicio(repo, tenant, ctx.acesso, hoje()));
  });
}
