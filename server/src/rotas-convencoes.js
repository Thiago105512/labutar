/**
 * Convenções e acordos coletivos: consulta dos instrumentos, enquadramento da empresa e da
 * função de cada posto (ou vínculo próprio) na tabela de pisos.
 */
import { sugerirFuncoes, pisoDaFuncao, emVigencia } from "../../packages/convencoes/src/index.js";
import { sucesso, erroValidacao, erroNaoEncontrado } from "./http/resposta.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { carregarConvencoes, instrumentosDaEmpresa } from "./convencoes.js";
import { hoje } from "../../packages/core/src/datas.js";

const resumo = (i, empresa) => ({
  id: i.id, tipo: i.tipo, registroMTE: i.registroMTE, dataRegistro: i.dataRegistro, vigencia: i.vigencia, dataBase: i.dataBase,
  sindicatoLaboral: i.sindicatoLaboral, sindicatoPatronal: i.sindicatoPatronal ?? null, abrangencia: i.abrangencia,
  pisoGeral: i.pisoGeral, funcoes: (i.pisos ?? []).reduce((s, p) => s + p.funcoes.length, 0),
  vigente: emVigencia(i, hoje()),
  enquadramento: (empresa?.enquadramentoSindical ?? []).find((e) => e.instrumentoId === i.id) ?? null,
});

export function registrarRotasConvencoes(r, { repo }) {
  r.get("/api/convencoes", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const [instrumentos, empresa] = await Promise.all([carregarConvencoes(repo, tenant), repo.obter(tenant, "folhaParametros", "empresa")]);
    sucesso(res, instrumentos.map((i) => resumo(i, empresa)).sort((a, b) => b.vigencia.inicio.localeCompare(a.vigencia.inicio)));
  });

  r.get("/api/convencoes/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const [i, empresa] = await Promise.all([repo.obter(tenant, "convencoes", ctx.params.id), repo.obter(tenant, "folhaParametros", "empresa")]);
    if (!i) throw erroNaoEncontrado("convenção ou acordo não encontrado");
    sucesso(res, { ...i, ...resumo(i, empresa) });
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
    const empresa = await repo.obter(tenant, "folhaParametros", "empresa");
    const instrumentos = instrumentosDaEmpresa(await carregarConvencoes(repo, tenant), empresa ?? {});
    if (funcao && !instrumentos.some((i) => pisoDaFuncao(i, funcao).enquadrada)) {
      throw erroValidacao(`"${funcao}" não está na tabela de pisos das convenções da empresa`, ["funcaoConvencao"]);
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
