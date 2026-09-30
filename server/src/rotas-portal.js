import * as ats from "../../packages/ats/src/index.js";
import { PAPEIS_TOMADOR, TIPO_CONTA, podeNoTomador } from "../../packages/acesso/src/index.js";
import { exigirTenant } from "./db/guard.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito, erroSemPermissao } from "./http/resposta.js";
import { exigirConta, exigirUsuario } from "./middleware/contexto.js";
import { ATOR_SISTEMA } from "./auth/servico.js";

/**
 * Portais dos públicos externos (candidato, colaborador, tomador) e a gestão
 * dessas contas pela equipe.
 *
 * Regra que segura tudo aqui: o identificador do dono vem SEMPRE do escopo
 * gravado na conta (exigirConta), nunca de parâmetro da requisição. Recurso
 * de outra pessoa responde 404 — nem a existência é confirmada.
 */
const ROTULO_STATUS = {
  EM_ANDAMENTO: "Em andamento",
  APROVADO: "Aprovado",
  REPROVADO: "Encerrado",
  DESISTENTE: "Você desistiu",
  BANCO: "No banco de talentos",
};

/** O que o candidato vê da própria candidatura: etapa e datas — sem score, corte ou motivo interno. */
function projetarCandidatura(c, vaga) {
  const etapas = (vaga?.etapas ?? []).filter((e) => e.tipo !== "SAIDA").sort((a, b) => a.ordem - b.ordem);
  const indice = etapas.findIndex((e) => e.id === c.etapaAtualId);
  return {
    id: c.id,
    vaga: vaga ? { titulo: vaga.titulo, slug: vaga.slug, local: vaga.local ?? null } : null,
    etapaAtual: etapas[indice]?.nome ?? null,
    etapas: etapas.map((e) => e.nome),
    indiceEtapa: indice,
    status: c.status,
    rotuloStatus: ROTULO_STATUS[c.status] ?? c.status,
    recebidaEm: c.criadoEm ?? null,
    atualizadaEm: c.atualizadoEm ?? null,
    podeDesistir: c.status === ats.STATUS_CANDIDATURA.EM_ANDAMENTO,
  };
}

const CAMPOS_EDITAVEIS_CANDIDATO = ["curriculoTexto", "pretensaoSalarial", "competencias", "experiencias", "formacao", "idiomas"];

export function registrarRotasPortal(r, { repo, acesso }) {
  // ------------------------------------------------------------ candidato: cadastro

  r.post("/api/portal/candidato/cadastro", async (req, res, ctx, corpo) => {
    const tenant = String(corpo?.empresa ?? "").trim().toLowerCase();
    try { exigirTenant(tenant); } catch { throw erroValidacao("empresa inválida", ["empresa"]); }
    if (corpo?.consentimento?.aceito !== true || !corpo.consentimento?.versaoTermo) {
      throw erroValidacao("é preciso aceitar o termo de uso dos seus dados para criar a conta", ["consentimento"]);
    }
    const email = String(corpo?.email ?? "").trim().toLowerCase();
    if (await acesso.usuarioPorEmail(tenant, email, TIPO_CONTA.CANDIDATO)) {
      throw erroConflito("já existe uma conta de candidato com este e-mail; entre com sua senha");
    }

    // Quem já se candidatou sem conta só é ligado ao cadastro antigo se provar
    // que é o dono dele (código de acompanhamento). Sem isso, qualquer um que
    // soubesse o e-mail de outra pessoa leria as candidaturas dela.
    const { itens } = await repo.listar(tenant, "candidatos", {}, { limite: 5000 });
    const existente = itens.find((c) => String(c.contato?.email ?? "").toLowerCase() === email);
    let candidato;
    if (existente) {
      const ticket = corpo.codigoAcompanhamento ? await repo.obter(tenant, "tickets", String(corpo.codigoAcompanhamento)) : null;
      if (!ticket || ticket.candidatoId !== existente.id) {
        throw erroConflito(
          "já existe um currículo com este e-mail. Para ligá-lo à sua conta, informe o código de acompanhamento que você recebeu ao se candidatar.",
          { precisaCodigo: true }
        );
      }
      candidato = existente;
    } else {
      try {
        candidato = ats.criarCandidato({
          tenantId: tenant,
          dados: { nome: corpo.nome },
          contato: { email, telefone: corpo.telefone ?? null, cidade: corpo.cidade ?? null, uf: corpo.uf ?? null },
          origem: { canal: "PORTAL_LABUTAR" },
          consentimento: { ...corpo.consentimento, em: new Date().toISOString(), ip: ctx.ip ?? null },
        });
      } catch (erro) {
        throw erroValidacao(erro.message);
      }
      candidato = await repo.inserir(tenant, "candidatos", candidato);
    }

    const conta = await acesso.criarContaExterna(tenant, {
      tipo: TIPO_CONTA.CANDIDATO, nome: corpo.nome ?? candidato.dados?.nome, email, senha: corpo.senha,
      escopo: { candidatoId: candidato.id }, trocarSenha: false,
    }, { atorAcesso: ATOR_SISTEMA, atorId: "AUTOCADASTRO" });
    await repo.atualizar(tenant, "candidatos", candidato.id, { contaUid: conta.id });

    sucesso(res, await acesso.entrar({ tenant, email, senha: corpo.senha, tipo: TIPO_CONTA.CANDIDATO, ip: ctx.ip, userAgent: ctx.userAgent }), 201);
  });

  // ------------------------------------------------------------ candidato: área logada

  r.get("/api/portal/candidato/eu", async (req, res, ctx) => {
    const { tenant, escopo } = exigirConta(ctx, TIPO_CONTA.CANDIDATO);
    const candidato = await repo.obter(tenant, "candidatos", escopo.candidatoId);
    if (!candidato) throw erroNaoEncontrado("cadastro não encontrado");
    sucesso(res, { candidato });
  });

  r.patch("/api/portal/candidato/perfil", async (req, res, ctx, corpo) => {
    const { tenant, escopo } = exigirConta(ctx, TIPO_CONTA.CANDIDATO);
    const atual = await repo.obter(tenant, "candidatos", escopo.candidatoId);
    if (!atual) throw erroNaoEncontrado("cadastro não encontrado");

    const patch = {};
    for (const campo of CAMPOS_EDITAVEIS_CANDIDATO) if (corpo?.[campo] !== undefined) patch[campo] = corpo[campo];
    for (const lista of ["competencias", "experiencias", "formacao", "idiomas"]) {
      if (patch[lista] !== undefined && (!Array.isArray(patch[lista]) || patch[lista].length > 50)) {
        throw erroValidacao(`${lista} deve ser uma lista com até 50 itens`);
      }
    }
    if (patch.curriculoTexto !== undefined) patch.curriculoTexto = String(patch.curriculoTexto).slice(0, 5000);
    if (corpo?.contato) {
      // E-mail é o login: muda só pela troca de conta, não por aqui.
      const { telefone, cidade, uf, links } = corpo.contato;
      patch.contato = { ...atual.contato, ...(telefone !== undefined && { telefone }), ...(cidade !== undefined && { cidade }), ...(uf !== undefined && { uf }), ...(links !== undefined && { links }) };
    }
    patch.atualizadoEm = new Date().toISOString();
    sucesso(res, { candidato: await repo.atualizar(tenant, "candidatos", atual.id, patch) });
  });

  r.get("/api/portal/candidato/candidaturas", async (req, res, ctx) => {
    const { tenant, escopo } = exigirConta(ctx, TIPO_CONTA.CANDIDATO);
    const { itens } = await repo.listar(tenant, "candidaturas", { candidatoId: escopo.candidatoId }, { ordenarPor: "criadoEm:desc" });
    const vagas = new Map();
    for (const c of itens) if (!vagas.has(c.vagaId)) vagas.set(c.vagaId, await repo.obter(tenant, "vagas", c.vagaId));
    sucesso(res, { itens: itens.map((c) => projetarCandidatura(c, vagas.get(c.vagaId))) });
  });

  r.post("/api/portal/candidato/candidaturas", async (req, res, ctx, corpo) => {
    const { tenant, escopo } = exigirConta(ctx, TIPO_CONTA.CANDIDATO);
    const candidato = await repo.obter(tenant, "candidatos", escopo.candidatoId);
    if (!candidato) throw erroNaoEncontrado("cadastro não encontrado");
    const { itens: abertas } = await repo.listar(tenant, "vagas", { status: ats.STATUS_VAGA.ABERTA }, { limite: 500 });
    const vaga = abertas.find((v) => v.slug === corpo?.vagaSlug);
    if (!vaga) throw erroNaoEncontrado("vaga não encontrada ou não está mais aberta");

    const jaExiste = await repo.contar(tenant, "candidaturas", { candidatoId: candidato.id, vagaId: vaga.id });
    if (jaExiste > 0) throw erroConflito("você já se candidatou a esta vaga");

    let candidatura;
    try {
      candidatura = ats.criarCandidatura({
        vaga, candidato, respostas: corpo?.respostas ?? [], origem: { canal: "PORTAL_LABUTAR" }, agora: new Date().toISOString(),
      });
    } catch (erro) {
      throw erroValidacao(erro.message);
    }
    const gravada = await repo.inserir(tenant, "candidaturas", candidatura);
    sucesso(res, projetarCandidatura(gravada, vaga), 201);
  });

  r.post("/api/portal/candidato/candidaturas/:id/desistir", async (req, res, ctx, corpo) => {
    const { tenant, escopo } = exigirConta(ctx, TIPO_CONTA.CANDIDATO);
    const candidatura = await repo.obter(tenant, "candidaturas", ctx.params.id);
    if (!candidatura || candidatura.candidatoId !== escopo.candidatoId) throw erroNaoEncontrado("candidatura não encontrada");
    const vaga = await repo.obter(tenant, "vagas", candidatura.vagaId);
    const resultado = ats.desistir(candidatura, { vaga, motivo: corpo?.motivo ?? "desistência pelo portal do candidato" });
    if (!resultado.ok) throw erroValidacao(resultado.motivo);
    const gravada = await repo.atualizar(tenant, "candidaturas", candidatura.id, resultado.candidatura);
    sucesso(res, projetarCandidatura(gravada, vaga));
  });

  // ------------------------------------------------------------ colaborador

  r.get("/api/portal/colaborador/inicio", async (req, res, ctx) => {
    const { tenant, escopo, usuario } = exigirConta(ctx, TIPO_CONTA.COLABORADOR);
    const pessoa = await repo.obter(tenant, "candidatos", escopo.pessoaId);
    sucesso(res, {
      nome: usuario.nome,
      pessoa: pessoa ? { nome: pessoa.dados?.nome, cidade: pessoa.contato?.cidade, uf: pessoa.contato?.uf } : null,
      // Os serviços abaixo dependem dos módulos de ponto, folha e colaboradores.
      servicos: ["holerites", "ponto", "ferias", "documentos", "informe", "treinamentos"],
    });
  });

  // ------------------------------------------------------------ tomador

  r.get("/api/portal/tomador/inicio", async (req, res, ctx) => {
    const { escopo, usuario } = exigirConta(ctx, TIPO_CONTA.TOMADOR);
    const papel = PAPEIS_TOMADOR.find((p) => p.id === escopo.papel) ?? null;
    const acoes = ["verAlocados", "verPresenca", "verDocumentos", "aprovarPonto", "aprovarMedicao", "solicitarPosto", "verMedicao", "verFaturas"]
      .filter((a) => podeNoTomador(escopo.papel, a));
    sucesso(res, {
      nome: usuario.nome,
      tomador: { id: escopo.tomadorId, nome: escopo.tomadorNome ?? null },
      papel,
      acoes,
      contratos: escopo.contratoIds ?? null,
    });
  });

  // ------------------------------------------------------------ gestão das contas externas (equipe)

  function exigirInterno(ctx) {
    exigirUsuario(ctx);
    if (ctx.tipoConta !== TIPO_CONTA.INTERNO) throw erroSemPermissao("esta área é da equipe da empresa");
    return ctx.tenant;
  }
  const ator = (ctx) => ({ atorAcesso: ctx.acesso, atorId: ctx.usuario });

  r.get("/api/contas-externas", async (req, res, ctx) => {
    const tenant = exigirInterno(ctx);
    const tipo = String(ctx.query.tipo ?? "");
    sucesso(res, { itens: await acesso.listarContasExternas(tenant, { tipo, atorAcesso: ctx.acesso }) });
  });

  r.post("/api/contas-externas", async (req, res, ctx, corpo) => {
    const tenant = exigirInterno(ctx);
    if (corpo?.tipo === TIPO_CONTA.COLABORADOR && corpo?.escopo?.pessoaId) {
      const pessoa = await repo.obter(tenant, "candidatos", corpo.escopo.pessoaId);
      if (!pessoa) throw erroValidacao("pessoa não encontrada no cadastro", ["escopo.pessoaId"]);
    }
    if (corpo?.tipo === TIPO_CONTA.CANDIDATO && corpo?.escopo?.candidatoId) {
      const cand = await repo.obter(tenant, "candidatos", corpo.escopo.candidatoId);
      if (!cand) throw erroValidacao("candidato não encontrado", ["escopo.candidatoId"]);
    }
    sucesso(res, await acesso.criarContaExterna(tenant, corpo ?? {}, ator(ctx)), 201);
  });

  r.patch("/api/contas-externas/:id", async (req, res, ctx, corpo) => {
    const tenant = exigirInterno(ctx);
    sucesso(res, await acesso.atualizarContaExterna(tenant, ctx.params.id, corpo ?? {}, ator(ctx)));
  });

  return r;
}
