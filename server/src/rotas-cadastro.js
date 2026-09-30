import {
  validarPessoa, validarTomador, validarContratoTomador, validarPosto, validarVinculo,
  alterarSalario, lerPlanilhaColaboradores, lotacaoDoVinculo,
  buscarOrigens, pessoaDoCandidato, completarPessoa,
} from "../../packages/cadastro/src/index.js";
import * as ats from "../../packages/ats/src/index.js";
import { proximaMatricula, TIPO_VINCULO, VINCULO_ACEITO_POR_CONTRATO } from "../../packages/mao-de-obra/src/index.js";
import { tabelaDaCompetencia } from "../../packages/folha/src/index.js";
import { novoId } from "../../packages/core/src/ids.js";
import { dataNoFuso } from "../../packages/core/src/datas.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito } from "./http/resposta.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { carregarCadastro } from "./cadastro.js";
import { gravarCPF } from "./rotas-folha.js";

const invalido = (r) => { if (!r.ok) throw erroValidacao(r.erros.join("; "), r.erros); };

function salarioMinimoEm(data) {
  try { return tabelaDaCompetencia(data.slice(0, 7)).salarioMinimo; } catch { return 0; }
}

/**
 * O processo seletivo fica sabendo da admissão: a candidatura vai para a etapa "Admissão" (se a
 * vaga tiver) e guarda a matrícula aberta.
 */
async function registrarAdmissaoNaCandidatura(repo, tenant, candidatura, matricula, usuario) {
  const vaga = await repo.obter(tenant, "vagas", candidatura.vagaId);
  let atualizada = candidatura;
  const avisos = [];
  if (vaga && candidatura.etapaAtualId !== "admissao" && (vaga.etapas ?? []).some((e) => e.id === "admissao")) {
    const r = ats.moverEtapa(candidatura, { vaga, paraEtapaId: "admissao", usuarioId: usuario, observacao: `Admitido com a matrícula ${matricula}` });
    if (r.ok) {
      atualizada = r.candidatura;
      avisos.push(`Candidatura na vaga "${vaga.titulo}" movida para a etapa Admissão.`);
    }
  }
  await repo.atualizar(tenant, "candidaturas", candidatura.id, { ...atualizada, admissao: { matricula, em: new Date().toISOString() } });
  return avisos;
}

/** Vínculo com a pessoa, o tomador e o posto, como a tela mostra. */
function resumoDoVinculo(v, cad) {
  const pessoa = cad.pessoa.get(v.pessoaId);
  const tomador = cad.tomador.get(v.tomadorId);
  const posto = cad.posto.get(v.postoId);
  return {
    ...v,
    lotacao: lotacaoDoVinculo(v),
    pessoa: pessoa ? { id: pessoa.id, nome: pessoa.nome, cpf: pessoa.cpf ?? null, dependentes: pessoa.dependentes?.length ?? 0 } : null,
    tomador: tomador ? { id: tomador.id, nome: tomador.nomeFantasia || tomador.razaoSocial, cnpj: tomador.cnpj } : null,
    posto: posto ? { id: posto.id, funcao: posto.funcao, insalubridadeGrau: posto.insalubridadeGrau, periculosidade: posto.periculosidade } : null,
  };
}

async function proximaMatriculaDoTenant(repo, tenant, tipo) {
  const { itens } = await repo.listar(tenant, "vinculos", {}, { limite: 100_000 });
  return proximaMatricula(tipo, itens.map((v) => v.matricula));
}

export function registrarRotasCadastro(r, { repo }) {
  // ------------------------------------------------------------ colaboradores

  r.get("/api/colaboradores", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "colaboradores", "ver");
    const cad = await carregarCadastro(repo, tenant);
    const hoje = dataNoFuso(new Date());
    const itens = cad.vinculos.map((v) => resumoDoVinculo(v, cad)).sort((a, b) => (a.pessoa?.nome ?? "").localeCompare(b.pessoa?.nome ?? "", "pt-BR"));
    sucesso(res, {
      itens,
      totais: {
        ativos: itens.filter((v) => !v.desligamento || v.desligamento >= hoje).length,
        semCPF: itens.filter((v) => !v.pessoa?.cpf).length,
        porTipo: Object.fromEntries(Object.values(TIPO_VINCULO).map((t) => [t, itens.filter((v) => v.tipo === t).length])),
      },
    });
  });

  /**
   * De onde puxar os dados de quem vai ser admitido: candidatos prontos para admitir (sem busca)
   * ou, com `?busca=` (nome ou CPF), pessoas do cadastro e candidatos do recrutamento.
   */
  r.get("/api/colaboradores/origens", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "colaboradores", "criar");
    const [cad, candidatos, candidaturas, vagas] = await Promise.all([
      carregarCadastro(repo, tenant),
      ...["candidatos", "candidaturas", "vagas"].map((c) => repo.listar(tenant, c, {}, { limite: 100_000 }).then((r) => r.itens)),
    ]);
    sucesso(res, buscarOrigens({ pessoas: cad.pessoas, vinculos: cad.vinculos, candidatos, candidaturas, vagas }, String(ctx.query.busca ?? "")));
  });

  r.get("/api/colaboradores/:matricula", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "colaboradores", "ver");
    const cad = await carregarCadastro(repo, tenant);
    const v = cad.vinculos.find((x) => x.matricula === ctx.params.matricula);
    if (!v) throw erroNaoEncontrado("colaborador não encontrado");
    sucesso(res, { ...resumoDoVinculo(v, cad), pessoaCompleta: cad.pessoa.get(v.pessoaId) ?? null });
  });

  /**
   * Admite: abre um vínculo novo com matrícula nova. A pessoa pode vir do zero, do cadastro
   * (`pessoaId`, readmissão) ou do recrutamento (`origem.candidatoId`, com a candidatura). O que
   * veio no formulário prevalece; o que ficou em branco é completado pela origem. Mesmo CPF =
   * mesma pessoa.
   */
  r.post("/api/colaboradores", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "colaboradores", "criar");
    const cad = await carregarCadastro(repo, tenant);
    const d = corpo?.vinculo ?? {};
    const origem = corpo?.origem ?? {};

    const candidato = origem.candidatoId ? await repo.obter(tenant, "candidatos", origem.candidatoId) : null;
    if (origem.candidatoId && !candidato) throw erroNaoEncontrado("candidato não encontrado no recrutamento");
    const candidatura = origem.candidaturaId ? await repo.obter(tenant, "candidaturas", origem.candidaturaId) : null;
    if (origem.candidaturaId && (!candidatura || candidatura.candidatoId !== candidato?.id)) {
      throw erroValidacao("candidatura não pertence a este candidato", ["origem.candidaturaId"]);
    }

    const informada = Object.fromEntries(Object.entries(corpo?.pessoa ?? {}).filter(([, v]) => v !== "" && v !== null && v !== undefined));
    const doRecrutamento = candidato ? pessoaDoCandidato(candidato) : {};
    const pessoaId = corpo?.pessoaId ?? origem.pessoaId;
    let pessoa;
    let existente = false;
    let preenchidos = [];
    if (pessoaId) {
      const atual = cad.pessoa.get(pessoaId);
      if (!atual) throw erroNaoEncontrado("pessoa não encontrada no cadastro");
      const comForm = completarPessoa(atual, informada);
      const comRecrutamento = completarPessoa(comForm.pessoa, doRecrutamento);
      pessoa = comRecrutamento.pessoa;
      preenchidos = [...comForm.preenchidos, ...comRecrutamento.preenchidos];
      existente = true;
    } else {
      const juntos = completarPessoa(informada, doRecrutamento);
      const p = validarPessoa(juntos.pessoa);
      invalido(p);
      preenchidos = juntos.preenchidos;
      const mesmoCPF = p.pessoa.cpf ? cad.pessoas.find((x) => x.cpf === p.pessoa.cpf) : null;
      if (mesmoCPF && mesmoCPF.nome.toLowerCase() !== p.pessoa.nome.toLowerCase()) {
        throw erroConflito(`este CPF já está no cadastro de ${mesmoCPF.nome}`);
      }
      if (mesmoCPF) {
        pessoa = completarPessoa(mesmoCPF, p.pessoa).pessoa;
        existente = true;
      } else pessoa = { ...p.pessoa, id: novoId("PES") };
    }
    const conferida = validarPessoa(pessoa);
    invalido(conferida);
    // Formatos do cadastro (CPF e telefone só com dígitos), preservando dependentes e banco da pessoa.
    pessoa = { ...pessoa, nome: conferida.pessoa.nome, cpf: conferida.pessoa.cpf, telefone: conferida.pessoa.telefone };
    if (pessoa.cpf && cad.pessoas.some((x) => x.cpf === pessoa.cpf && x.id !== pessoa.id)) {
      throw erroConflito("este CPF já está no cadastro de outra pessoa");
    }
    if (candidato) pessoa.candidatoId ??= candidato.id;

    const posto = d.postoId ? cad.posto.get(d.postoId) : null;
    const contrato = posto ? cad.contrato.get(posto.contratoId) : null;
    const tomador = contrato ? cad.tomador.get(contrato.tomadorId) : null;
    const vinculosDaPessoa = cad.vinculos.filter((v) => v.pessoaId === pessoa.id);
    const dados = { ...d, cargo: d.cargo || posto?.funcao, salario: Number(d.salario) };
    const r2 = validarVinculo(dados, {
      pessoa, posto, contrato, tomador, vinculosDaPessoa, salarioMinimo: salarioMinimoEm(d.admissao ?? ""),
      ocupados: posto ? cad.vinculos.filter((v) => v.postoId === posto.id && !v.desligamento).length : undefined,
    });
    invalido(r2);

    if (existente) await repo.atualizar(tenant, "pessoas", pessoa.id, pessoa);
    else await repo.inserir(tenant, "pessoas", pessoa);
    const matricula = await proximaMatriculaDoTenant(repo, tenant, dados.tipo);
    const vinculo = {
      id: matricula, matricula, pessoaId: pessoa.id, tipo: dados.tipo, admissao: dados.admissao, desligamento: null,
      cargo: dados.cargo, cbo: d.cbo ?? posto?.cbo ?? null, salario: dados.salario, jornadaMensal: d.jornadaMensal ?? posto?.jornadaMensal ?? 220,
      historicoSalarial: [{ desde: dados.admissao, valor: dados.salario, motivo: "Admissão" }],
      tomadorId: tomador?.id ?? null, tomadorCnpj: tomador?.cnpj ?? null, contratoId: contrato?.id ?? null, postoId: posto?.id ?? null,
      setor: dados.tipo === TIPO_VINCULO.PROPRIO ? d.setor : null,
      temporario: dados.tipo === TIPO_VINCULO.TEMPORARIO ? { fimPrevisto: d.temporario?.fimPrevisto ?? null, hipotese: contrato?.hipotese ?? null } : null,
      origem: candidato ? { candidatoId: candidato.id, candidaturaId: candidatura?.id ?? null, vagaId: candidatura?.vagaId ?? null } : null,
      criadoPor: ctx.usuario ?? null,
    };
    await repo.inserir(tenant, "vinculos", vinculo);
    const avisos = [...r2.avisos];
    if (candidatura) avisos.push(...await registrarAdmissaoNaCandidatura(repo, tenant, candidatura, matricula, ctx.usuario));
    sucesso(res, { vinculo, pessoa, preenchidos, avisos }, 201);
  });

  r.patch("/api/pessoas/:id", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "colaboradores", "editar");
    const atual = await repo.obter(tenant, "pessoas", ctx.params.id);
    if (!atual) throw erroNaoEncontrado("pessoa não encontrada");
    const { cpf, ...resto } = corpo ?? {};
    const p = validarPessoa({ ...atual, ...resto, cpf: atual.cpf });
    invalido(p);
    await repo.atualizar(tenant, "pessoas", atual.id, { ...p.pessoa, id: atual.id });
    const final = cpf && cpf !== atual.cpf ? await gravarCPF(repo, tenant, atual.id, cpf) : await repo.obter(tenant, "pessoas", atual.id);
    sucesso(res, { pessoa: final, avisos: p.avisos });
  });

  r.post("/api/colaboradores/:matricula/salario", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "colaboradores", "editar");
    const v = await repo.obter(tenant, "vinculos", ctx.params.matricula);
    if (!v) throw erroNaoEncontrado("colaborador não encontrado");
    let novo;
    try { novo = alterarSalario(v, { desde: corpo?.desde, valor: Number(corpo?.valor), motivo: corpo?.motivo }); }
    catch (e) { throw erroValidacao(e.message, ["salario"]); }
    const minimo = salarioMinimoEm(corpo.desde);
    if (minimo && novo.salario < minimo && (v.jornadaMensal ?? 220) >= 220) throw erroValidacao("salário abaixo do salário mínimo", ["valor"]);
    sucesso(res, await repo.atualizar(tenant, "vinculos", v.id, { historicoSalarial: novo.historicoSalarial, salario: novo.salario }));
  });

  /**
   * Importação da planilha do sistema anterior. Sem `confirmar`, só valida e mostra o que
   * entraria; com `confirmar: true`, grava as linhas corretas. Posto: o do tomador cuja função
   * é o cargo informado, em contrato do tipo do vínculo.
   */
  r.post("/api/colaboradores/importar", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "colaboradores", "criar");
    const cad = await carregarCadastro(repo, tenant);
    const lidas = lerPlanilhaColaboradores(corpo?.planilha ?? "");
    const erros = [...lidas.erros];
    const prontas = [];
    // Vínculos já existentes somados aos desta planilha, posto a posto: acima das vagas vira aviso
    // (o histórico importado é o que é), mas fica visível para ajustar o contrato.
    const ocupacao = new Map();
    for (const v of cad.vinculos) if (v.postoId && !v.desligamento) ocupacao.set(v.postoId, (ocupacao.get(v.postoId) ?? 0) + 1);
    const norm = (s) => String(s ?? "").trim().toLowerCase();
    for (const l of lidas.linhas) {
      const v = l.vinculo;
      let tomador = null, contrato = null, posto = null;
      if (v.tipo !== TIPO_VINCULO.PROPRIO) {
        tomador = cad.tomadores.find((t) => t.cnpj === v.tomadorCnpj);
        if (!tomador) { erros.push({ linha: l.linha, nome: l.pessoa.nome, erros: ["tomador não cadastrado: cadastre o tomador e o posto antes"] }); continue; }
        posto = cad.postos.find((p) => {
          const c = cad.contrato.get(p.contratoId);
          return c?.tomadorId === tomador.id && VINCULO_ACEITO_POR_CONTRATO[c.tipo] === v.tipo && norm(p.funcao) === norm(v.cargo);
        });
        if (!posto) { erros.push({ linha: l.linha, nome: l.pessoa.nome, erros: [`sem posto "${v.cargo}" em contrato ${v.tipo === TIPO_VINCULO.TEMPORARIO ? "temporário" : "de prestação de serviços"} com ${tomador.razaoSocial}`] }); continue; }
        contrato = cad.contrato.get(posto.contratoId);
        const ocupados = (ocupacao.get(posto.id) ?? 0) + 1;
        ocupacao.set(posto.id, ocupados);
        if (posto.vagas && ocupados > posto.vagas) {
          l.avisos = [...(l.avisos ?? []), `posto "${posto.funcao}" ficará com ${ocupados} de ${posto.vagas} vagas: aumente as vagas no contrato`];
        }
      }
      const existente = l.pessoa.cpf ? cad.pessoas.find((p) => p.cpf === l.pessoa.cpf) : null;
      prontas.push({ ...l, tomador, contrato, posto, pessoaExistente: existente?.id ?? null });
    }

    if (!corpo?.confirmar) {
      return sucesso(res, {
        confirmado: false,
        prontas: prontas.map((p) => ({ linha: p.linha, nome: p.pessoa.nome, cpf: p.pessoa.cpf, tipo: p.vinculo.tipo, cargo: p.vinculo.cargo, admissao: p.vinculo.admissao, salario: p.vinculo.salario, lotacao: p.tomador?.razaoSocial ?? p.vinculo.setor, avisos: p.avisos })),
        erros,
      });
    }

    const matriculas = cad.vinculos.map((v) => v.matricula);
    let gravados = 0;
    for (const p of prontas) {
      const pessoaId = p.pessoaExistente ?? novoId("PES");
      if (!p.pessoaExistente) await repo.inserir(tenant, "pessoas", { ...p.pessoa, id: pessoaId, dependentes: [] });
      const matricula = proximaMatricula(p.vinculo.tipo, matriculas);
      matriculas.push(matricula);
      await repo.inserir(tenant, "vinculos", {
        id: matricula, matricula, pessoaId, tipo: p.vinculo.tipo, admissao: p.vinculo.admissao, desligamento: null,
        cargo: p.vinculo.cargo, cbo: p.vinculo.cbo, salario: p.vinculo.salario, jornadaMensal: p.posto?.jornadaMensal ?? 220,
        historicoSalarial: [{ desde: p.vinculo.admissao, valor: p.vinculo.salario, motivo: "Importado do sistema anterior" }],
        matriculaAnterior: p.vinculo.matriculaAnterior, dependentesIRImportados: p.vinculo.dependentesIRImportados,
        tomadorId: p.tomador?.id ?? null, tomadorCnpj: p.tomador?.cnpj ?? null, contratoId: p.contrato?.id ?? null, postoId: p.posto?.id ?? null,
        setor: p.vinculo.tipo === TIPO_VINCULO.PROPRIO ? p.vinculo.setor : null,
        temporario: p.vinculo.tipo === TIPO_VINCULO.TEMPORARIO ? { fimPrevisto: null, hipotese: p.contrato?.hipotese ?? null } : null,
        importadoPor: ctx.usuario ?? null,
      });
      gravados += 1;
    }
    sucesso(res, { confirmado: true, gravados, erros });
  });

  // ------------------------------------------------------------ tomadores, contratos e postos

  r.get("/api/tomadores", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "tomadores", "ver");
    const cad = await carregarCadastro(repo, tenant);
    const hoje = dataNoFuso(new Date());
    sucesso(res, cad.tomadores.map((t) => {
      const contratos = cad.contratos.filter((c) => c.tomadorId === t.id);
      const ids = new Set(contratos.map((c) => c.id));
      return {
        ...t,
        contratos: contratos.length,
        postos: cad.postos.filter((p) => ids.has(p.contratoId)).length,
        alocados: cad.vinculos.filter((v) => v.tomadorId === t.id && (!v.desligamento || v.desligamento >= hoje)).length,
      };
    }).sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR")));
  });

  r.get("/api/tomadores/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "tomadores", "ver");
    const cad = await carregarCadastro(repo, tenant);
    const t = cad.tomador.get(ctx.params.id);
    if (!t) throw erroNaoEncontrado("tomador não encontrado");
    const contratos = cad.contratos.filter((c) => c.tomadorId === t.id).map((c) => ({
      ...c,
      postos: cad.postos.filter((p) => p.contratoId === c.id).map((p) => ({ ...p, ocupados: cad.vinculos.filter((v) => v.postoId === p.id && !v.desligamento).length })),
    }));
    sucesso(res, { ...t, contratos });
  });

  r.post("/api/tomadores", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "tomadores", "criar");
    const v = validarTomador(corpo ?? {});
    invalido(v);
    const { itens } = await repo.listar(tenant, "tomadores", { cnpj: v.tomador.cnpj }, { limite: 1 });
    if (itens.length) throw erroConflito(`este CNPJ já está cadastrado (${itens[0].razaoSocial})`);
    const tomador = { ...v.tomador, id: novoId("TOM") };
    await repo.inserir(tenant, "tomadores", tomador);
    sucesso(res, tomador, 201);
  });

  r.post("/api/tomadores/:id/contratos", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "tomadores", "criar");
    const t = await repo.obter(tenant, "tomadores", ctx.params.id);
    if (!t) throw erroNaoEncontrado("tomador não encontrado");
    const v = validarContratoTomador(corpo ?? {});
    invalido(v);
    const contrato = { ...v.contrato, id: novoId("CTR"), tomadorId: t.id, tomadorCnpj: t.cnpj };
    await repo.inserir(tenant, "contratosTomador", contrato);
    sucesso(res, contrato, 201);
  });

  r.post("/api/contratos/:id/postos", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "tomadores", "criar");
    const c = await repo.obter(tenant, "contratosTomador", ctx.params.id);
    if (!c) throw erroNaoEncontrado("contrato não encontrado");
    const t = await repo.obter(tenant, "tomadores", c.tomadorId);
    const v = validarPosto({ ...corpo, vagas: Number(corpo?.vagas) });
    invalido(v);
    const posto = { ...v.posto, id: novoId("POS"), contratoId: c.id, tomadorId: c.tomadorId, local: v.posto.local ?? { uf: t.uf, municipio: t.municipio } };
    await repo.inserir(tenant, "postos", posto);
    sucesso(res, posto, 201);
  });
}
