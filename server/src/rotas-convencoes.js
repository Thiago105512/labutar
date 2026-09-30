/**
 * Convenções e acordos coletivos: consulta dos instrumentos, enquadramento da empresa e da
 * função de cada posto (ou vínculo próprio) na tabela de pisos.
 */
import { sugerirFuncoes, pisoDaFuncao, emVigencia } from "../../packages/convencoes/src/index.js";
import { sucesso, erroValidacao, erroNaoEncontrado } from "./http/resposta.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { carregarConvencoes, instrumentosDoSindicato } from "./convencoes.js";
import { hoje } from "../../packages/core/src/datas.js";

const resumo = (i, vinculados) => ({
  id: i.id, tipo: i.tipo, registroMTE: i.registroMTE, dataRegistro: i.dataRegistro, vigencia: i.vigencia, dataBase: i.dataBase,
  sindicatoLaboral: i.sindicatoLaboral, sindicatoPatronal: i.sindicatoPatronal ?? null, abrangencia: i.abrangencia,
  pisoGeral: i.pisoGeral, funcoes: (i.pisos ?? []).reduce((s, p) => s + p.funcoes.length, 0),
  vigente: emVigencia(i, hoje()),
  // Colaboradores ativos vinculados ao sindicato laboral do instrumento, por tipo de vínculo.
  vinculados: vinculados?.[i.sindicatoLaboral?.cnpj] ?? {},
});

export function registrarRotasConvencoes(r, { repo }) {
  const vinculadosPorSindicato = async (tenant) => {
    const { itens } = await repo.listar(tenant, "vinculos", {}, { limite: 100_000 });
    const mapa = {};
    for (const v of itens.filter((x) => !x.desligamento && x.sindicato?.cnpj)) {
      mapa[v.sindicato.cnpj] ??= {};
      mapa[v.sindicato.cnpj][v.tipo] = (mapa[v.sindicato.cnpj][v.tipo] ?? 0) + 1;
    }
    return mapa;
  };

  r.get("/api/convencoes", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const [instrumentos, vinculados] = await Promise.all([carregarConvencoes(repo, tenant), vinculadosPorSindicato(tenant)]);
    sucesso(res, instrumentos.map((i) => resumo(i, vinculados)).sort((a, b) => b.vigencia.inicio.localeCompare(a.vigencia.inicio)));
  });

  r.get("/api/convencoes/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const [i, vinculados] = await Promise.all([repo.obter(tenant, "convencoes", ctx.params.id), vinculadosPorSindicato(tenant)]);
    if (!i) throw erroNaoEncontrado("convenção ou acordo não encontrado");
    sucesso(res, { ...i, ...resumo(i, vinculados) });
  });

  /** Funções da tabela parecidas com um cargo, para enquadrar o posto. */
  r.get("/api/convencoes/:id/sugestoes", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const i = await repo.obter(tenant, "convencoes", ctx.params.id);
    if (!i) throw erroNaoEncontrado("convenção ou acordo não encontrado");
    sucesso(res, sugerirFuncoes(i, String(ctx.query.cargo ?? ""), 8));
  });

  /**
   * Enquadra a função do posto (ou do vínculo próprio, sem posto) na tabela de pisos. Vazio volta
   * para o cargo como está (piso geral se não houver na tabela).
   */
  r.patch("/api/enquadramento/:matricula", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "editar");
    const vinculo = await repo.obter(tenant, "vinculos", ctx.params.matricula);
    if (!vinculo) throw erroNaoEncontrado("colaborador não encontrado");
    const funcao = String(corpo?.funcaoConvencao ?? "").trim() || null;
    const instrumentos = instrumentosDoSindicato(await carregarConvencoes(repo, tenant), vinculo.sindicato?.cnpj);
    if (!instrumentos.length) throw erroValidacao("o sindicato do colaborador não tem convenção cadastrada", ["sindicato"]);
    if (funcao && !instrumentos.some((i) => pisoDaFuncao(i, funcao).enquadrada)) {
      throw erroValidacao(`"${funcao}" não está na tabela de pisos da convenção do sindicato do colaborador`, ["funcaoConvencao"]);
    }
    // No posto vale para todos que o ocupam; próprio sem posto guarda no vínculo.
    if (vinculo.postoId) {
      const posto = await repo.atualizar(tenant, "postos", vinculo.postoId, { funcaoConvencao: funcao });
      return sucesso(res, { onde: "POSTO", postoId: posto.id, funcaoConvencao: funcao });
    }
    await repo.atualizar(tenant, "vinculos", vinculo.id, { funcaoConvencao: funcao });
    sucesso(res, { onde: "VINCULO", matricula: vinculo.matricula, funcaoConvencao: funcao });
  });
}
