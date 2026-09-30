/**
 * 13º salário, férias e rescisão a partir do cadastro. As rotas "simular" só calculam: nada é
 * gravado, e por isso bastam permissão de ver a folha. O cálculo é do motor (packages/folha).
 */
import {
  calcularRescisao, calcularFerias, validarProgramacaoFerias, calcularPrimeiraParcela, calcularDecimoTerceiro,
  periodosAquisitivos, MOTIVO_DESLIGAMENTO, tabelaDaCompetencia,
} from "../../packages/folha/src/index.js";
import { sucesso, erroValidacao, erroNaoEncontrado } from "./http/resposta.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { carregarCadastro, colaboradoresDaFolha } from "./cadastro.js";
import { colaboradorDaFolha } from "../../packages/cadastro/src/index.js";
import { hoje } from "../../packages/core/src/datas.js";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

const opcoesDaEmpresa = (empresa, colaborador) => ({
  local: colaborador.local ?? empresa.local,
  arredondamentoINSS: empresa.arredondamentoINSS,
  arredondamentoFGTS: empresa.arredondamentoFGTS,
  dispensarIRRFAte10: empresa.dispensarIRRFAte10,
});

function centavos(valor, campo) {
  if (valor === undefined || valor === null || valor === "") return 0;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw erroValidacao(`${campo}: valor em centavos, inteiro e não negativo`, [campo]);
  return n;
}

function tabelaVigente(data, campo) {
  try { return tabelaDaCompetencia(data.slice(0, 7)); } catch (e) { throw erroValidacao(e.message, [campo]); }
}

async function carregar(repo, tenant, matricula, dataReferencia) {
  const [cad, empresa] = await Promise.all([carregarCadastro(repo, tenant), repo.obter(tenant, "folhaParametros", "empresa")]);
  const vinculo = cad.vinculos.find((v) => v.matricula === matricula);
  if (!vinculo) throw erroNaoEncontrado("colaborador não encontrado");
  const colaborador = colaboradorDaFolha({
    vinculo, pessoa: cad.pessoa.get(vinculo.pessoaId), posto: cad.posto.get(vinculo.postoId), tomador: cad.tomador.get(vinculo.tomadorId), empresa: empresa ?? {},
  }, dataReferencia.slice(0, 7));
  return { vinculo, colaborador, empresa: empresa ?? {} };
}

/**
 * Períodos aquisitivos já gozados. Sem histórico de férias no cadastro (dados importados), os
 * períodos anteriores ao último completo são tratados como gozados — com aviso para conferir.
 */
function gozados(vinculo, ate, avisos) {
  if (Array.isArray(vinculo.periodosGozados)) return vinculo.periodosGozados;
  const completos = periodosAquisitivos(vinculo.admissao, ate).filter((p) => p.completo);
  if (completos.length > 1) avisos.push("Sem histórico de férias no cadastro: considerados gozados os períodos anteriores ao último completo. Confira antes de pagar.");
  return completos.slice(0, -1).map((p) => p.inicio);
}

export function registrarRotasRescisaoFerias(r, { repo }) {
  r.get("/api/folha/rescisao/motivos", async (req, res, ctx) => {
    exigirPermissao(ctx, "folha", "ver");
    sucesso(res, Object.entries(MOTIVO_DESLIGAMENTO).sort(([a], [b]) => a.localeCompare(b)).map(([codigo, m]) => ({ codigo, nome: m.nome, aviso: m.aviso, multaFGTS: m.multaFGTS })));
  });

  r.post("/api/folha/rescisao/simular", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const d = corpo ?? {};
    if (!DATA.test(d.desligamento ?? "")) throw erroValidacao("data de desligamento inválida", ["desligamento"]);
    if (!MOTIVO_DESLIGAMENTO[d.motivo]) throw erroValidacao("motivo de desligamento inválido (Tabela 19 do eSocial)", ["motivo"]);
    const tabela = tabelaVigente(d.desligamento, "desligamento");
    const { vinculo, colaborador, empresa } = await carregar(repo, tenant, d.matricula, d.desligamento);
    if (d.desligamento < vinculo.admissao) throw erroValidacao("desligamento antes da admissão", ["desligamento"]);
    const avisosCadastro = [];
    const resultado = calcularRescisao({
      colaborador: { ...colaborador, desligamento: null },
      desligamento: d.desligamento,
      motivo: d.motivo,
      avisoIndenizado: Boolean(d.avisoIndenizado),
      avisoNaoCumprido: Boolean(d.avisoNaoCumprido),
      medias: centavos(d.medias, "medias"),
      saldoFGTS: centavos(d.saldoFGTS, "saldoFGTS"),
      primeiraParcela13: centavos(d.primeiraParcela13, "primeiraParcela13"),
      periodosGozados: gozados(vinculo, d.desligamento, avisosCadastro),
      lancamentos: { adiantamento: centavos(d.adiantamento, "adiantamento") },
    }, { ...opcoesDaEmpresa(empresa, colaborador), tabela });
    resultado.avisos.unshift(...avisosCadastro);
    sucesso(res, resultado);
  });

  r.post("/api/folha/ferias/simular", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const d = corpo ?? {};
    if (!DATA.test(d.inicio ?? "")) throw erroValidacao("data de início inválida", ["inicio"]);
    const dias = Number(d.dias), abonoDias = Number(d.abonoDias ?? 0);
    if (!Number.isInteger(dias) || dias < 5 || dias > 30) throw erroValidacao("dias de gozo entre 5 e 30", ["dias"]);
    if (!Number.isInteger(abonoDias) || abonoDias < 0 || abonoDias > 10) throw erroValidacao("abono de 0 a 10 dias", ["abonoDias"]);
    const tabela = tabelaVigente(d.inicio, "inicio");
    const { vinculo, colaborador, empresa } = await carregar(repo, tenant, d.matricula, d.inicio);
    const avisosCadastro = [];
    const jaGozados = new Set(gozados(vinculo, d.inicio, avisosCadastro));
    const periodo = periodosAquisitivos(vinculo.admissao, d.inicio).find((p) => p.completo && p.fim < d.inicio && !jaGozados.has(p.inicio));
    if (!periodo) throw erroValidacao("sem período aquisitivo completo em aberto nesta data", ["inicio"]);
    // Parcela única nesta simulação: o que sobra do direito fica para outro período de gozo.
    const programacao = validarProgramacaoFerias({
      periodo, parcelas: [{ inicio: d.inicio, dias }], abonoDias, faltas: Number(d.faltas ?? 0), hoje: hoje(), local: colaborador.local ?? empresa.local,
    });
    const restante = programacao.direito - dias - abonoDias;
    programacao.erros = programacao.erros.filter((e) => !e.startsWith("dias de gozo"));
    if (restante < 0) programacao.erros.push(`dias de gozo + abono passam do direito de ${programacao.direito} dias`);
    else if (restante > 0) programacao.avisos.push(`Restam ${restante} dias deste período para outro gozo (mínimo de 5 dias, e um dos períodos com 14 ou mais).`);
    const recibo = calcularFerias({
      colaborador, inicio: d.inicio, dias, abonoDias, medias: centavos(d.medias, "medias"), diasEmDobro: programacao.parcelas[0]?.diasEmDobro ?? 0,
    }, { ...opcoesDaEmpresa(empresa, colaborador), tabela });
    sucesso(res, { periodo, programacao: { ...programacao, ok: programacao.erros.length === 0, avisos: [...avisosCadastro, ...programacao.avisos] }, recibo });
  });

  /** 13º do ano para todos os colaboradores ativos: ?parcela=1 (até 30/11) ou 2 (até 20/12). */
  r.get("/api/folha/decimo-terceiro/:ano", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const ano = Number(ctx.params.ano);
    if (!Number.isInteger(ano)) throw erroValidacao("ano inválido", ["ano"]);
    const parcela = String(ctx.query.parcela ?? "2") === "1" ? 1 : 2;
    const competencia = `${ano}-${parcela === 1 ? "11" : "12"}`;
    const prazo = parcela === 1 ? `${ano}-11-30` : `${ano}-12-20`;
    const tabela = tabelaVigente(`${competencia}-01`, "ano");
    const [cad, empresa] = await Promise.all([carregarCadastro(repo, tenant), repo.obter(tenant, "folhaParametros", "empresa")]);
    const itens = colaboradoresDaFolha(cad, competencia, empresa ?? {})
      .filter((c) => !c.desligamento)
      .map((c) => {
        const opcoes = { ...opcoesDaEmpresa(empresa ?? {}, c), tabela };
        const primeira = calcularPrimeiraParcela({ colaborador: c, ano }, opcoes);
        const calc = parcela === 1 ? primeira : calcularDecimoTerceiro({ colaborador: c, ano, primeiraParcela: primeira.valor }, opcoes);
        // Contrato que termina antes do prazo: o 13º (ou o que falta dele) vai na rescisão.
        const naRescisao = Boolean(c.fimPrevisto && c.fimPrevisto < prazo);
        return { matricula: c.matricula, nome: c.nome, cpf: c.cpf, vinculo: c.vinculo, lotacao: c.lotacao, fimPrevisto: c.fimPrevisto, naRescisao, avos: calc.avos, base: calc.base, itens: calc.itens, proventos: calc.proventos, descontos: calc.descontos, liquido: calc.liquido, fgts: calc.fgts };
      });
    const pagos = itens.filter((i) => !i.naRescisao);
    const soma = (k) => pagos.reduce((s, i) => s + i[k], 0);
    sucesso(res, {
      ano, parcela, prazo,
      totais: { colaboradores: pagos.length, naRescisao: itens.length - pagos.length, proventos: soma("proventos"), descontos: soma("descontos"), liquido: soma("liquido"), fgts: soma("fgts") },
      itens,
    });
  });
}
