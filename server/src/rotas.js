import * as ats from "../../packages/ats/src/index.js";
import { mascararNome, mascararEmail, mascararTelefone } from "../../packages/core/src/texto.js";
import { statusIntegracao } from "../../packages/esocial/src/index.js";
import { criarRoteador } from "./http/roteador.js";
import {
  sucesso,
  erroValidacao,
  erroTransicao,
  erroNaoEncontrado,
  erroConflito,
  ErroApi,
  CODIGOS,
} from "./http/resposta.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { versao, IA_HABILITADA } from "./versao.js";

/**
 * Coleções são planas (com `vagaId` no documento) em vez das subcoleções de
 * docs/02-modelo-de-dados.md. Motivo: o dashboard precisa de candidaturas de
 * todas as vagas, o que em Firestore exigiria collection-group query. O driver
 * continua aceitando caminho aninhado quando fizer sentido.
 */
const COLECOES = Object.freeze({
  vagas: "vagas",
  candidatos: "candidatos",
  candidaturas: "candidaturas",
  modelos: "modelosProcesso",
});

function numero(valor, padrao, minimo = 0, maximo = 1000) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(minimo, Math.min(maximo, n)) : padrao;
}

function paginacao(query) {
  return { limite: numero(query.limite, 50, 1, 200), iniciarEm: numero(query.iniciarEm, 0, 0, 100000) };
}

async function obterOu404(repo, tenant, colecao, id, rotulo) {
  const doc = await repo.obter(tenant, colecao, id);
  if (!doc) throw erroNaoEncontrado(`${rotulo} não encontrado`);
  return doc;
}

export function registrarRotas({ repo, log = () => {} }) {
  const r = criarRoteador();

  // ------------------------------------------------------------ saúde
  r.get("/api/saude", async (req, res) => {
    sucesso(res, {
      status: "ok",
      versao,
      driver: repo.nome,
      persistente: repo.persistente,
      ambiente: process.env.NODE_ENV ?? "development",
      esocial: statusIntegracao(),
      ia: { habilitado: IA_HABILITADA, motivo: IA_HABILITADA ? null : "packages/ia em construção" },
      rotas: r.rotas().length,
    });
  });

  r.get("/api/canais", async (req, res) => {
    sucesso(res, Object.values(ats.CANAIS_PUBLICACAO).map((canal) => ats.planoDePublicacao(canal)));
  });

  // ------------------------------------------------------------ modelos de processo
  r.get("/api/modelos-processo", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    sucesso(res, await repo.listar(tenant, COLECOES.modelos, {}, { ordenarPor: "nome" }));
  });

  r.post("/api/modelos-processo", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "configurar");
    if (!corpo?.nome || !Array.isArray(corpo.etapas)) {
      throw erroValidacao("modelo de processo exige nome e etapas", ["nome", "etapas"]);
    }
    const modelo = ats.criarModeloProcesso({ nome: corpo.nome, etapas: corpo.etapas, tenantId: tenant });
    sucesso(res, await repo.inserir(tenant, COLECOES.modelos, modelo), 201);
  });

  // ------------------------------------------------------------ vagas
  r.get("/api/vagas", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const filtro = {};
    if (ctx.query.status) filtro.status = ctx.query.status;
    if (ctx.query.area) filtro.area = ctx.query.area;
    if (ctx.query.busca) filtro.titulo = { contem: ctx.query.busca };
    sucesso(res, await repo.listar(tenant, COLECOES.vagas, filtro, {
      ...paginacao(ctx.query),
      ordenarPor: ctx.query.ordenarPor || "datas.criadaEm:desc",
    }));
  });

  r.post("/api/vagas", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "criar");
    if (!corpo?.titulo) throw erroValidacao("titulo é obrigatório", ["titulo"]);

    const vaga = ats.criarVaga({ ...corpo, tenantId: tenant });
    // Rascunho incompleto é aceito de propósito: o recrutador monta a vaga em
    // etapas. A validade é exigida na ABERTURA, não na criação.
    const validacao = ats.validarVaga(vaga);
    sucesso(res, { vaga: await repo.inserir(tenant, COLECOES.vagas, vaga), validacao }, 201);
  });

  r.get("/api/vagas/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    const candidaturas = await repo.listar(tenant, COLECOES.candidaturas, { vagaId: vaga.id }, {});
    sucesso(res, {
      vaga,
      validacao: ats.validarVaga(vaga),
      auditoria: ats.auditarAnuncio(vaga),
      contagens: { candidaturas: candidaturas.total },
    });
  });

  r.patch("/api/vagas/:id", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "editar");
    const atual = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    const patch = { ...corpo };
    delete patch.id;
    delete patch.tenantId;

    const candidata = { ...atual, ...patch };
    const validacao = ats.validarVaga(candidata);
    if (!validacao.valido) throw erroValidacao("alteração deixaria a vaga inválida", validacao.erros);

    sucesso(res, { vaga: await repo.atualizar(tenant, COLECOES.vagas, atual.id, patch), validacao });
  });

  r.post("/api/vagas/:id/status", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "editar");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    if (!corpo?.para) throw erroValidacao("campo 'para' é obrigatório", ["para"]);

    const resultado = ats.mudarStatus(vaga, corpo.para, { motivo: corpo.motivo });
    if (!resultado.ok) {
      throw erroTransicao(resultado.motivo, ats.transicoesPermitidas(vaga.status));
    }

    // Abrir é o ato que expõe a vaga a candidatos: aqui a validade é obrigatória.
    if (corpo.para === ats.STATUS_VAGA.ABERTA) {
      const validacao = ats.validarVaga(resultado.vaga);
      if (!validacao.valido) {
        throw erroTransicao("não é possível abrir uma vaga inválida", validacao.erros);
      }
    }

    sucesso(res, { vaga: await repo.atualizar(tenant, COLECOES.vagas, vaga.id, resultado.vaga) });
  });

  r.get("/api/vagas/:id/etapas", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    sucesso(res, { ativas: ats.etapasAtivas(vaga), saidas: ats.etapasDeSaida(vaga) });
  });

  r.get("/api/vagas/:id/candidaturas", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    sucesso(res, await repo.listar(tenant, COLECOES.candidaturas, { vagaId: vaga.id }, {
      ...paginacao(ctx.query),
      ordenarPor: ctx.query.ordenarPor || "score.total:desc",
    }));
  });

  r.get("/api/vagas/:id/funil", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    const { itens } = await repo.listar(tenant, COLECOES.candidaturas, { vagaId: vaga.id }, { limite: 200 });
    sucesso(res, ats.funil(itens, vaga));
  });

  r.get("/api/vagas/:id/publicacoes", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    sucesso(res, ats.publicacaoInicial(vaga, { baseUrl: ctx.query.baseUrl, tenantSlug: ctx.query.tenantSlug }));
  });

  r.get("/api/vagas/:id/job-posting", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    sucesso(res, ats.gerarJobPosting(vaga, { baseUrl: ctx.query.baseUrl, tenantSlug: ctx.query.tenantSlug }));
  });

  r.get("/api/vagas/:id/anuncio/:canal", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    const plano = ats.planoDePublicacao(ctx.params.canal);
    if (plano.metodo === ats.METODO_PUBLICACAO.INDISPONIVEL) {
      throw erroValidacao(`canal ${ctx.params.canal} indisponível`, [plano.bloqueio]);
    }
    sucesso(res, ats.gerarTextoParaRedes(vaga, ctx.params.canal, { baseUrl: ctx.query.baseUrl, tenantSlug: ctx.query.tenantSlug }));
  });

  r.get("/api/vagas/:id/auditoria", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.params.id, "vaga");
    sucesso(res, ats.auditarAnuncio(vaga));
  });

  // ------------------------------------------------------------ candidatos
  r.get("/api/candidatos", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const filtro = {};
    if (ctx.query.cidade) filtro["contato.cidade"] = ctx.query.cidade;
    if (ctx.query.uf) filtro["contato.uf"] = ctx.query.uf.toUpperCase();

    const { itens, total } = await repo.listar(tenant, COLECOES.candidatos, filtro, { limite: 500 });
    const competencias = (ctx.query.competencias ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const filtrados = ats.buscarCandidatos(itens, { texto: ctx.query.busca, competencias });
    const { limite, iniciarEm } = paginacao(ctx.query);
    const pagina = filtrados.slice(iniciarEm, iniciarEm + limite);
    sucesso(res, { itens: pagina, total: filtrados.length, retornados: pagina.length, ocultos: total - itens.length });
  });

  r.post("/api/candidatos", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "criar");
    if (!corpo?.dados?.nome) throw erroValidacao("dados.nome é obrigatório", ["dados.nome"]);

    let candidato;
    try {
      candidato = ats.criarCandidato({ ...corpo, tenantId: tenant });
    } catch (erro) {
      throw erroValidacao(erro.message);
    }

    const { itens } = await repo.listar(tenant, COLECOES.candidatos, {}, { limite: 1000 });
    const duplicado = ats.encontrarDuplicado(candidato, itens);
    if (duplicado) {
      throw erroConflito("candidato já cadastrado", { duplicadoDe: duplicado.candidato.id, chave: duplicado.chave });
    }

    sucesso(res, { candidato: await repo.inserir(tenant, COLECOES.candidatos, candidato), duplicadoDe: null }, 201);
  });

  r.get("/api/candidatos/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const candidato = await obterOu404(repo, tenant, COLECOES.candidatos, ctx.params.id, "candidato");
    if (ctx.query.mascarar === "1") {
      return sucesso(res, {
        candidato: {
          ...candidato,
          dados: { ...candidato.dados, nome: mascararNome(candidato.dados.nome), cpf: null },
          contato: {
            ...candidato.contato,
            email: mascararEmail(candidato.contato.email),
            telefone: mascararTelefone(candidato.contato.telefone),
          },
          curriculoTexto: "",
        },
        mascarado: true,
      });
    }
    sucesso(res, { candidato, consentimento: ats.validarConsentimento(candidato), mascarado: false });
  });

  r.patch("/api/candidatos/:id", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "editar");
    const atual = await obterOu404(repo, tenant, COLECOES.candidatos, ctx.params.id, "candidato");
    const patch = { ...corpo };
    delete patch.id;
    delete patch.tenantId;
    sucesso(res, await repo.atualizar(tenant, COLECOES.candidatos, atual.id, { ...patch, atualizadoEm: new Date().toISOString() }));
  });

  r.get("/api/candidatos/:id/consentimento", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const candidato = await obterOu404(repo, tenant, COLECOES.candidatos, ctx.params.id, "candidato");
    sucesso(res, ats.validarConsentimento(candidato, { retencaoMeses: numero(ctx.query.retencaoMeses, 24, 1, 240) }));
  });

  r.post("/api/candidatos/:id/anonimizar", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "excluir");
    const candidato = await obterOu404(repo, tenant, COLECOES.candidatos, ctx.params.id, "candidato");
    const anonimizado = ats.anonimizarCandidato(candidato, { motivo: corpo?.motivo });
    sucesso(res, await repo.atualizar(tenant, COLECOES.candidatos, candidato.id, anonimizado));
  });

  r.post("/api/candidatos/:id/fundir", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "excluir");
    const base = await obterOu404(repo, tenant, COLECOES.candidatos, ctx.params.id, "candidato");
    const outro = await obterOu404(repo, tenant, COLECOES.candidatos, corpo?.outroId, "candidato a fundir");
    const fundido = ats.mesclarCandidatos(base, outro);
    await repo.atualizar(tenant, COLECOES.candidatos, base.id, fundido);
    await repo.remover(tenant, COLECOES.candidatos, outro.id);
    sucesso(res, fundido);
  });

  // ------------------------------------------------------------ candidaturas
  r.post("/api/candidaturas", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "criar");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, corpo?.vagaId, "vaga");
    const candidato = await obterOu404(repo, tenant, COLECOES.candidatos, corpo?.candidatoId, "candidato");

    let candidatura;
    try {
      candidatura = ats.criarCandidatura({
        vaga, candidato, respostas: corpo.respostas ?? [], origem: corpo.origem ?? null,
      });
    } catch (erro) {
      throw erroValidacao(erro.message);
    }
    sucesso(res, { candidatura: await repo.inserir(tenant, COLECOES.candidaturas, candidatura), triagem: candidatura.triagem }, 201);
  });

  r.get("/api/candidaturas/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const candidatura = await obterOu404(repo, tenant, COLECOES.candidaturas, ctx.params.id, "candidatura");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, candidatura.vagaId, "vaga");
    const pessoa = await repo.obter(tenant, COLECOES.candidatos, candidatura.candidatoId);
    sucesso(res, { candidatura, sla: ats.calcularSLA(candidatura, vaga), pessoa, etapaAtual: ats.etapaPorId(vaga, candidatura.etapaAtualId) });
  });

  r.get("/api/candidaturas/:id/triagem", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const candidatura = await obterOu404(repo, tenant, COLECOES.candidaturas, ctx.params.id, "candidatura");
    sucesso(res, candidatura.triagem ?? null);
  });

  r.post("/api/candidaturas/:id/mover", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "editar");
    const usuario = ctx.usuario;
    const candidatura = await obterOu404(repo, tenant, COLECOES.candidaturas, ctx.params.id, "candidatura");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, candidatura.vagaId, "vaga");
    if (!corpo?.paraEtapaId) throw erroValidacao("paraEtapaId é obrigatório", ["paraEtapaId"]);

    const resultado = ats.moverEtapa(candidatura, {
      vaga, paraEtapaId: corpo.paraEtapaId, usuarioId: usuario,
      observacao: corpo.observacao ?? "", reabrir: corpo.reabrir === true,
    });
    if (!resultado.ok) throw erroTransicao(resultado.motivo);

    sucesso(res, await repo.atualizar(tenant, COLECOES.candidaturas, candidatura.id, resultado.candidatura));
  });

  r.post("/api/candidaturas/:id/desistir", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "editar");
    const candidatura = await obterOu404(repo, tenant, COLECOES.candidaturas, ctx.params.id, "candidatura");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, candidatura.vagaId, "vaga");
    const resultado = ats.desistir(candidatura, { vaga, motivo: corpo?.motivo ?? "" });
    if (!resultado.ok) throw erroTransicao(resultado.motivo);
    sucesso(res, await repo.atualizar(tenant, COLECOES.candidaturas, candidatura.id, resultado.candidatura));
  });

  r.post("/api/candidaturas/:id/avaliacao", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "editar");
    const usuario = ctx.usuario;
    const candidatura = await obterOu404(repo, tenant, COLECOES.candidaturas, ctx.params.id, "candidatura");
    let atualizada;
    try {
      atualizada = ats.registrarAvaliacaoInterna(candidatura, {
        usuarioId: usuario, nota: corpo?.nota, parecer: corpo?.parecer ?? "",
      });
    } catch (erro) {
      throw erroValidacao(erro.message);
    }
    sucesso(res, await repo.atualizar(tenant, COLECOES.candidaturas, candidatura.id, atualizada));
  });

  r.post("/api/candidaturas/:id/anexo", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "editar");
    const candidatura = await obterOu404(repo, tenant, COLECOES.candidaturas, ctx.params.id, "candidatura");
    let atualizada;
    try {
      atualizada = ats.registrarAnexo(candidatura, { nome: corpo?.nome, url: corpo?.url, tipo: corpo?.tipo });
    } catch (erro) {
      throw erroValidacao(erro.message);
    }
    sucesso(res, await repo.atualizar(tenant, COLECOES.candidaturas, candidatura.id, atualizada));
  });

  // ------------------------------------------------------------ métricas
  r.get("/api/metricas/funil", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.query.vagaId, "vaga");
    const { itens } = await repo.listar(tenant, COLECOES.candidaturas, { vagaId: vaga.id }, { limite: 500 });
    sucesso(res, ats.funil(itens, vaga));
  });

  r.get("/api/metricas/origens", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const filtro = ctx.query.vagaId ? { vagaId: ctx.query.vagaId } : {};
    const { itens } = await repo.listar(tenant, COLECOES.candidaturas, filtro, { limite: 500 });
    sucesso(res, ats.origensDasCandidaturas(itens));
  });

  r.get("/api/metricas/tempos", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vaga = await obterOu404(repo, tenant, COLECOES.vagas, ctx.query.vagaId, "vaga");
    const { itens } = await repo.listar(tenant, COLECOES.candidaturas, { vagaId: vaga.id }, { limite: 500 });
    sucesso(res, ats.tempoMedioPorEtapa(itens, vaga));
  });

  r.get("/api/metricas/resumo", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "recrutamento", "ver");
    const vagas = await repo.listar(tenant, COLECOES.vagas, {}, { limite: 500 });
    const candidaturas = await repo.listar(tenant, COLECOES.candidaturas, {}, { limite: 1000 });

    const contar = (lista, fn) => lista.filter(fn).length;
    const atrasadas = [];
    for (const c of candidaturas.itens) {
      const vaga = vagas.itens.find((v) => v.id === c.vagaId);
      if (!vaga) continue;
      if (ats.calcularSLA(c, vaga).atrasada) atrasadas.push({ candidaturaId: c.id, vagaId: vaga.id, etapa: c.etapaAtualId });
    }

    sucesso(res, {
      vagas: {
        total: vagas.total,
        abertas: contar(vagas.itens, (v) => v.status === ats.STATUS_VAGA.ABERTA),
        pausadas: contar(vagas.itens, (v) => v.status === ats.STATUS_VAGA.PAUSADA),
        rascunho: contar(vagas.itens, (v) => v.status === ats.STATUS_VAGA.RASCUNHO),
        encerradas: contar(vagas.itens, (v) => v.status === ats.STATUS_VAGA.ENCERRADA),
      },
      candidaturas: {
        total: candidaturas.total,
        emAndamento: contar(candidaturas.itens, (c) => c.status === ats.STATUS_CANDIDATURA.EM_ANDAMENTO),
        aprovados: contar(candidaturas.itens, (c) => c.status === ats.STATUS_CANDIDATURA.APROVADO),
        reprovados: contar(candidaturas.itens, (c) => c.status === ats.STATUS_CANDIDATURA.REPROVADO),
        destaques: contar(candidaturas.itens, (c) => c.score?.destaque === true),
      },
      slaAtrasadas: atrasadas,
    });
  });

  return r;
}

export { COLECOES };
