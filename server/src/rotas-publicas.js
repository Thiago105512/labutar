import * as ats from "../../packages/ats/src/index.js";
import { gerarToken } from "../../packages/core/src/ids.js";
import { criarRoteador } from "./http/roteador.js";
import { sucesso, erroValidacao, erroNaoEncontrado } from "./http/resposta.js";
import { exigirEscopo } from "./middleware/contexto.js";

/**
 * Projeção pública da vaga.
 *
 * O que sai daqui é deliberadamente menor que a vaga completa: `regrasTriagem`,
 * `corteMinimo`, pesos e a marcação de pergunta `eliminatoria` não vão para o
 * portal. Revelados, permitiriam otimizar o currículo para o algoritmo em vez
 * de para a vaga — e tornariam o score um alvo de jogo, não um instrumento.
 */
export function projetarVagaPublica(vaga) {
  return {
    id: vaga.id,
    slug: vaga.slug,
    titulo: vaga.titulo,
    resumo: vaga.resumo ?? "",
    descricao: vaga.descricao ?? "",
    responsabilidades: vaga.responsabilidades ?? [],
    requisitos: vaga.requisitos ?? [],
    beneficios: vaga.beneficios ?? [],
    // nomes apenas: peso e nível mínimo são configuração interna da triagem
    competencias: (vaga.competencias ?? []).map((c) => c.nome),
    area: vaga.area ?? null,
    nivel: vaga.nivel ?? null,
    tipoContrato: vaga.tipoContrato ?? null,
    jornada: vaga.jornada ?? null,
    local: {
      modelo: vaga.local?.modelo ?? null,
      cidade: vaga.local?.cidade ?? null,
      uf: vaga.local?.uf ?? null,
    },
    salario: vaga.salario?.exibir ? { min: vaga.salario.min, max: vaga.salario.max } : null,
    quantidadeVagas: vaga.quantidadeVagas ?? 1,
    idiomas: vaga.idiomas ?? [],
    acessibilidade: vaga.acessibilidade?.descricao ?? null,
    perguntas: (vaga.knockout ?? []).map((p) => ({
      id: p.id,
      pergunta: p.pergunta,
      tipo: p.tipo,
      obrigatoria: p.obrigatoria !== false,
      opcoes: p.opcoes ?? p.opcoesAceitas ?? null,
      min: p.min ?? null,
      max: p.max ?? null,
      minChars: p.minChars ?? null,
    })),
    publicadaEm: vaga.datas?.abertaEm ?? null,
    encerraEm: vaga.datas?.encerradaEm ?? null,
  };
}

export function registrarRotasPublicas({ repo, log = () => {} }) {
  const r = criarRoteador();

  r.get("/api/publico/vagas", async (req, res, ctx) => {
    const tenant = exigirEscopo(ctx);
    const { itens, total } = await repo.listar(
      tenant, "vagas", { status: ats.STATUS_VAGA.ABERTA }, { limite: 200, ordenarPor: "datas.abertaEm:desc" }
    );
    const busca = (ctx.query.busca ?? "").trim().toLowerCase();
    const filtradas = busca
      ? itens.filter((v) => `${v.titulo} ${v.resumo} ${v.area ?? ""}`.toLowerCase().includes(busca))
      : itens;
    sucesso(res, { itens: filtradas.map(projetarVagaPublica), total: filtradas.length, retornados: filtradas.length, totalAbertas: total });
  });

  r.get("/api/publico/vagas/:slug", async (req, res, ctx) => {
    const tenant = exigirEscopo(ctx);
    const { itens } = await repo.listar(tenant, "vagas", { status: ats.STATUS_VAGA.ABERTA }, { limite: 200 });
    const vaga = itens.find((v) => v.slug === ctx.params.slug);
    if (!vaga) throw erroNaoEncontrado("vaga não encontrada ou não está mais aberta");

    sucesso(res, {
      vaga: projetarVagaPublica(vaga),
      // embutido para o front injetar em <head> sem segunda chamada — SEO
      jobPosting: ats.gerarJobPosting(vaga, { baseUrl: ctx.query.baseUrl, tenantSlug: ctx.query.tenantSlug }),
    });
  });

  r.post("/api/publico/candidaturas", async (req, res, ctx, corpo) => {
    const tenant = exigirEscopo(ctx);

    if (!corpo?.vagaSlug) throw erroValidacao("vagaSlug é obrigatório", ["vagaSlug"]);
    if (corpo?.consentimento?.aceito !== true || !corpo.consentimento?.versaoTermo) {
      // Sem consentimento válido não há base legal para tratar o currículo
      // (LGPD art. 7º, I). Recusar é obrigatório, não conveniência.
      throw erroValidacao(
        "consentimento explícito é obrigatório para enviar a candidatura",
        ["consentimento.aceito", "consentimento.versaoTermo"]
      );
    }
    if (!corpo?.candidato?.dados?.nome) throw erroValidacao("candidato.dados.nome é obrigatório", ["candidato.dados.nome"]);

    const abertas = await repo.listar(tenant, "vagas", { status: ats.STATUS_VAGA.ABERTA }, { limite: 200 });
    const vaga = abertas.itens.find((v) => v.slug === corpo.vagaSlug);
    if (!vaga) throw erroNaoEncontrado("vaga não encontrada ou não está mais aberta");

    const agora = new Date().toISOString();
    let candidato;
    try {
      candidato = ats.criarCandidato({
        ...corpo.candidato,
        tenantId: tenant,
        origem: corpo.origem ?? { canal: "PORTAL_LABUTAR" },
        consentimento: { ...corpo.consentimento, em: agora, ip: ctx.ip ?? null },
      });
    } catch (erro) {
      throw erroValidacao(erro.message);
    }

    // deduplicação: quem já está no banco é fundido, não duplicado
    const existentes = await repo.listar(tenant, "candidatos", {}, { limite: 1000 });
    const duplicado = ats.encontrarDuplicado(candidato, existentes.itens);
    let candidatoGravado;
    if (duplicado) {
      candidatoGravado = await repo.atualizar(
        tenant, "candidatos", duplicado.candidato.id,
        ats.mesclarCandidatos(duplicado.candidato, candidato)
      );
    } else {
      candidatoGravado = await repo.inserir(tenant, "candidatos", candidato);
    }

    let candidatura;
    try {
      candidatura = ats.criarCandidatura({
        vaga, candidato: candidatoGravado, respostas: corpo.respostas ?? [],
        origem: corpo.origem ?? { canal: "PORTAL_LABUTAR" }, agora,
      });
    } catch (erro) {
      throw erroValidacao(erro.message);
    }

    const gravada = await repo.inserir(tenant, "candidaturas", candidatura);
    const token = gerarToken(24);
    await repo.inserir(tenant, "tickets", {
      id: token, candidaturaId: gravada.id, candidatoId: candidatoGravado.id, criadoEm: agora,
    });

    // O candidato recebe só o token e o que já sabe: nada de score, corte ou
    // posição relativa. LGPD art. 20 dá direito à revisão de decisão
    // automatizada, e o canal para exercê-lo vem na confirmação.
    sucesso(res, {
      token,
      candidaturaId: gravada.id,
      etapa: "recebida",
      mensagem: "Candidatura recebida. Você será avisado por e-mail sobre cada etapa.",
      revisaoHumana: "Esta candidatura passa por triagem automática e por revisão de uma pessoa. Para pedir revisão ou explicação, responda ao e-mail de confirmação.",
      duplicado: Boolean(duplicado),
    }, 201);
  });

  r.get("/api/publico/candidaturas/:token", async (req, res, ctx) => {
    const tenant = exigirEscopo(ctx);
    const ticket = await repo.obter(tenant, "tickets", ctx.params.token);
    if (!ticket) throw erroNaoEncontrado("acompanhamento não encontrado");

    const candidatura = await repo.obter(tenant, "candidaturas", ticket.candidaturaId);
    if (!candidatura) throw erroNaoEncontrado("acompanhamento não encontrado");
    const vaga = await repo.obter(tenant, "vagas", candidatura.vagaId);

    // Projeção para o candidato: etapa e data, sem score nem motivo de recusa.
    // Devolver o corte permitiria deduzir a nota e contestar o algoritmo em vez
    // do critério — e motivo detalhado de reprovação é comunicação do RH.
    sucesso(res, {
      vaga: vaga ? { titulo: vaga.titulo, slug: vaga.slug } : null,
      etapa: candidatura.etapaAtualId,
      status: candidatura.status === ats.STATUS_CANDIDATURA.EM_ANDAMENTO ? "em andamento" : candidatura.status.toLowerCase(),
      recebidaEm: candidatura.criadoEm,
      atualizadaEm: candidatura.atualizadoEm,
      historico: (candidatura.historico ?? []).map((h) => ({ em: h.em })),
    });
  });

  r.post("/api/publico/candidaturas/:token/desistir", async (req, res, ctx, corpo) => {
    const tenant = exigirEscopo(ctx);
    const ticket = await repo.obter(tenant, "tickets", ctx.params.token);
    if (!ticket) throw erroNaoEncontrado("acompanhamento não encontrado");

    const candidatura = await repo.obter(tenant, "candidaturas", ticket.candidaturaId);
    if (!candidatura) throw erroNaoEncontrado("acompanhamento não encontrado");
    const vaga = await repo.obter(tenant, "vagas", candidatura.vagaId);
    if (!vaga) throw erroNaoEncontrado("vaga não encontrada");

    const resultado = ats.desistir(candidatura, { vaga, motivo: corpo?.motivo ?? "desistência pelo portal" });
    if (!resultado.ok) throw erroValidacao(resultado.motivo);

    sucesso(res, await repo.atualizar(tenant, "candidaturas", candidatura.id, resultado.candidatura));
  });

  return r;
}
