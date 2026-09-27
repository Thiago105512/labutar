import { normalizar } from "../../core/src/texto.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { hoje, mesesEntre } from "../../core/src/datas.js";
import {
  DECISAO_TRIAGEM,
  MODELO_TRABALHO,
  NIVEL_FORMACAO,
  NIVEL_IDIOMA,
  REGRAS_TRIAGEM_PADRAO,
  TIPO_KNOCKOUT,
} from "./constantes.js";

export function chaveCompetencia(nome) {
  return normalizar(nome).toLowerCase().trim().replace(/\s+/g, " ");
}

function nivelDe(valor, tabela) {
  if (typeof valor === "number") return valor;
  return tabela[chaveCompetencia(valor).replace(/\s+/g, "_")] ?? tabela[String(valor ?? "").toUpperCase()] ?? 0;
}

export function avaliarCompetencias(requisitos = [], doCandidato = []) {
  const mapa = new Map(doCandidato.map((c) => [chaveCompetencia(c.nome), c]));

  let pontos = 0;
  let maximo = 0;
  const detalhe = [];
  const faltantesObrigatorias = [];

  for (const requisito of requisitos) {
    const peso = requisito.peso ?? 1;
    const nivelExigido = requisito.nivelMinimo ?? 1;
    maximo += peso;

    const encontrado = mapa.get(chaveCompetencia(requisito.nome));
    if (!encontrado) {
      if (requisito.obrigatoria) faltantesObrigatorias.push(requisito.nome);
      detalhe.push({
        competencia: requisito.nome,
        peso,
        nivelExigido,
        nivelCandidato: 0,
        pontos: 0,
        atende: false,
        obrigatoria: !!requisito.obrigatoria,
      });
      continue;
    }

    // Currículo sem nível declarado: presume que atende o mínimo exigido.
    // Presumir zero reprovaria em massa candidatos que não preencheram o campo.
    const nivelCandidato = encontrado.nivel ?? nivelExigido;
    const razao = Math.min(1, nivelCandidato / nivelExigido);
    pontos += peso * razao;

    if (requisito.obrigatoria && razao < 1) faltantesObrigatorias.push(requisito.nome);
    detalhe.push({
      competencia: requisito.nome,
      peso,
      nivelExigido,
      nivelCandidato,
      pontos: arredondar(peso * razao, 4),
      atende: razao >= 1,
      obrigatoria: !!requisito.obrigatoria,
    });
  }

  return {
    score: maximo === 0 ? 100 : arredondar((pontos / maximo) * 100, 2),
    pontos: arredondar(pontos, 4),
    maximo,
    detalhe,
    faltantesObrigatorias,
  };
}

export function avaliarExperiencia(
  { anosMinimos = 0, regra = "todas", competenciasRequeridas = [] } = {},
  experiencias = [],
  referencia = hoje()
) {
  if (anosMinimos <= 0) {
    return { score: 100, anos: null, anosMinimos: 0, detalhe: [] };
  }

  const requeridas = new Set(competenciasRequeridas.map(chaveCompetencia));
  let meses = 0;
  const detalhe = [];

  for (const exp of experiencias) {
    if (!exp.inicio) continue;
    const fim = exp.fim ?? (exp.atual ? referencia : exp.inicio);
    const contabilizados = mesesEntre(exp.inicio, fim);
    const relacionada =
      regra !== "relacionadas" ||
      (exp.competencias ?? []).some((c) => requeridas.has(chaveCompetencia(c)));

    if (relacionada && contabilizados > 0) meses += contabilizados;
    detalhe.push({
      empresa: exp.empresa ?? null,
      cargo: exp.cargo ?? null,
      meses: contabilizados > 0 ? contabilizados : 0,
      contabilizada: relacionada && contabilizados > 0,
    });
  }

  const anos = meses / 12;
  return {
    score: arredondar(Math.min(1, anos / anosMinimos) * 100, 2),
    anos: arredondar(anos, 1),
    anosMinimos,
    detalhe,
  };
}

export function avaliarFormacao(nivelRequerido = 0, formacoes = []) {
  if (!nivelRequerido) return { score: 100, nivelRequerido: 0, nivelCandidato: null };

  let melhor = 0;
  for (const f of formacoes) {
    const nivel = nivelDe(f.nivel, NIVEL_FORMACAO);
    // Curso em andamento vale um degrau abaixo: superior incompleto não é superior.
    const efetivo = f.concluido === false ? Math.max(0, nivel - 1) : nivel;
    melhor = Math.max(melhor, efetivo);
  }

  return {
    score: arredondar(Math.min(1, melhor / nivelRequerido) * 100, 2),
    nivelRequerido,
    nivelCandidato: melhor,
  };
}

export function avaliarIdiomas(requisitos = [], doCandidato = []) {
  if (requisitos.length === 0) return { score: 100, detalhe: [], faltantes: [] };

  const mapa = new Map(doCandidato.map((i) => [chaveCompetencia(i.codigo ?? i.idioma), i]));
  let pontos = 0;
  let maximo = 0;
  const detalhe = [];
  const faltantes = [];

  for (const req of requisitos) {
    const chave = chaveCompetencia(req.codigo ?? req.idioma);
    const peso = req.peso ?? 1;
    const nivelExigido = nivelDe(req.nivel, NIVEL_IDIOMA) || 1;
    maximo += peso;

    const encontrado = mapa.get(chave);
    const nivelCandidato = encontrado ? nivelDe(encontrado.nivel, NIVEL_IDIOMA) || 1 : 0;
    const razao = Math.min(1, nivelCandidato / nivelExigido);
    pontos += peso * razao;

    if ((req.obrigatoria ?? true) && razao < 1) faltantes.push(req.codigo ?? req.idioma);
    detalhe.push({ idioma: req.codigo ?? req.idioma, peso, nivelExigido, nivelCandidato, atende: razao >= 1 });
  }

  return { score: arredondar((pontos / maximo) * 100, 2), detalhe, faltantes };
}

export function avaliarLocalizacao(vaga, candidato) {
  const local = vaga?.local;
  if (!local?.modelo) return { score: 100, motivo: "vaga sem local definido" };
  if (local.modelo === MODELO_TRABALHO.REMOTO) return { score: 100, motivo: "vaga remota" };

  const cidadeVaga = chaveCompetencia(local.cidade ?? "");
  const ufVaga = normalizar(local.uf ?? "").toUpperCase();
  const cidadeCandidato = chaveCompetencia(candidato?.contato?.cidade ?? "");
  const ufCandidato = normalizar(candidato?.contato?.uf ?? "").toUpperCase();

  if (!cidadeCandidato && !ufCandidato) {
    return { score: 50, motivo: "candidato sem localização informada" };
  }
  if (cidadeVaga && cidadeVaga === cidadeCandidato) return { score: 100, motivo: "mesma cidade" };
  if (ufVaga && ufVaga === ufCandidato) {
    return {
      score: local.modelo === MODELO_TRABALHO.HIBRIDO ? 85 : 80,
      motivo: "mesma UF",
    };
  }
  if (local.modelo === MODELO_TRABALHO.HIBRIDO) {
    return { score: 30, motivo: "híbrido com candidato em outra UF" };
  }
  return { score: 10, motivo: "presencial com candidato em outra UF" };
}

export function verificarPretensaoSalarial(vaga, candidato) {
  const teto = vaga?.salario?.max ?? null;
  const pretensao = candidato?.pretensaoSalarial ?? null;

  if (!teto || !pretensao) {
    return { compativel: true, motivo: null, excedente: 0, teto, pretensao };
  }
  if (pretensao <= teto) {
    return { compativel: true, motivo: null, excedente: 0, teto, pretensao };
  }
  return {
    compativel: false,
    motivo: "pretensão salarial acima do teto da vaga",
    excedente: pretensao - teto,
    teto,
    pretensao,
  };
}

function verificarResposta(pergunta, valor) {
  switch (pergunta.tipo) {
    case TIPO_KNOCKOUT.SIM_NAO: {
      const respondeu = valor === true || String(valor).toUpperCase() === "SIM";
      const esperado = pergunta.esperado ?? true;
      return { atende: respondeu === esperado, motivo: null };
    }
    case TIPO_KNOCKOUT.MULTIPLA: {
      const aceitas = pergunta.opcoesAceitas ?? [];
      return {
        atende: aceitas.some((opcao) => String(opcao).toLowerCase() === String(valor).toLowerCase()),
        motivo: null,
      };
    }
    case TIPO_KNOCKOUT.NUMERICA: {
      const numero = Number(valor);
      if (!Number.isFinite(numero)) return { atende: false, motivo: "resposta não numérica" };
      const minimo = pergunta.min ?? -Infinity;
      const maximo = pergunta.max ?? Infinity;
      return { atende: numero >= minimo && numero <= maximo, motivo: null };
    }
    case TIPO_KNOCKOUT.TEXTO: {
      const texto = String(valor ?? "").trim();
      const minChars = pergunta.minChars ?? 1;
      return { atende: texto.length >= minChars, motivo: null };
    }
    case TIPO_KNOCKOUT.DATA: {
      const texto = String(valor ?? "").slice(0, 10);
      return { atende: texto >= (pergunta.de ?? "0000-01-01") && texto <= (pergunta.ate ?? "9999-12-31"), motivo: null };
    }
    default:
      return { atende: false, motivo: `tipo de pergunta desconhecido: ${pergunta.tipo}` };
  }
}

export function avaliarKnockout(perguntas = [], respostas = []) {
  const mapa = new Map(respostas.map((r) => [String(r.perguntaId), r.valor]));
  const resultado = [];
  const pendentes = [];
  let reprovado = false;

  for (const pergunta of perguntas) {
    const valor = mapa.get(String(pergunta.id));
    const semResposta = valor === undefined || valor === null || valor === "";

    if (semResposta) {
      // Sem resposta não é resposta negativa: vai para análise manual em vez
      // de reprovar automaticamente um candidato por campo não preenchido.
      if (pergunta.obrigatoria !== false) pendentes.push(pergunta.id);
      resultado.push({
        perguntaId: pergunta.id,
        pergunta: pergunta.pergunta,
        valor: null,
        atende: null,
        pendente: true,
        eliminatoriaFalhou: false,
      });
      continue;
    }

    const { atende, motivo } = verificarResposta(pergunta, valor);
    const eliminatoriaFalhou = !!pergunta.eliminatoria && !atende;
    if (eliminatoriaFalhou) reprovado = true;

    resultado.push({
      perguntaId: pergunta.id,
      pergunta: pergunta.pergunta,
      valor,
      atende,
      motivo,
      pendente: false,
      eliminatoriaFalhou,
    });
  }

  return { respostas: resultado, reprovado, pendentes };
}

/**
 * Triagem automatizada: combina knockout eliminatório com score de aderência
 * ponderado. Nunca reprova por conta própria quando falta informação.
 */
export function triagemAutomatica({ vaga, candidato, respostas = [], agora = hoje() } = {}) {
  if (!vaga) throw new Error("triagemAutomatica exige a vaga");

  const regras = { ...REGRAS_TRIAGEM_PADRAO, ...(vaga.regrasTriagem ?? {}) };
  const pesos = { ...REGRAS_TRIAGEM_PADRAO.pesos, ...(regras.pesos ?? {}) };

  const competencias = avaliarCompetencias(vaga.competencias ?? [], candidato?.competencias ?? []);
  const experiencia = avaliarExperiencia(
    {
      anosMinimos: regras.experienciaAnosMinimos ?? 0,
      regra: regras.experienciaRegra ?? "todas",
      competenciasRequeridas: (vaga.competencias ?? []).map((c) => c.nome),
    },
    candidato?.experiencias ?? [],
    agora
  );
  const formacao = avaliarFormacao(vaga.formacaoMinima ?? 0, candidato?.formacao ?? []);
  const idiomas = avaliarIdiomas(vaga.idiomas ?? [], candidato?.idiomas ?? []);
  const localizacao = avaliarLocalizacao(vaga, candidato);
  const salario = verificarPretensaoSalarial(vaga, candidato);
  const knockout = avaliarKnockout(vaga.knockout ?? [], respostas);

  const somaPesos =
    pesos.competencias + pesos.experiencia + pesos.formacao + pesos.idiomas + pesos.localizacao;

  const total =
    somaPesos > 0
      ? arredondar(
          (competencias.score * pesos.competencias +
            experiencia.score * pesos.experiencia +
            formacao.score * pesos.formacao +
            idiomas.score * pesos.idiomas +
            localizacao.score * pesos.localizacao) /
            somaPesos,
          2
        )
      : 0;

  const bloqueios = [];
  if (competencias.faltantesObrigatorias.length > 0) {
    bloqueios.push(`competências obrigatórias não atendidas: ${competencias.faltantesObrigatorias.join(", ")}`);
  }
  if (!salario.compativel && regras.salarioEliminatorio) {
    bloqueios.push(salario.motivo);
  }
  if (total < regras.corteMinimo) {
    bloqueios.push(`score ${total} abaixo do corte mínimo ${regras.corteMinimo}`);
  }

  let decisao;
  let motivo = null;

  if (knockout.reprovado) {
    decisao = DECISAO_TRIAGEM.REPROVADO_KNOCKOUT;
    motivo = "reprovado em pergunta eliminatória";
  } else if (knockout.pendentes.length > 0) {
    decisao = DECISAO_TRIAGEM.ANALISE_MANUAL;
    motivo = `perguntas obrigatórias sem resposta: ${knockout.pendentes.join(", ")}`;
  } else if (bloqueios.length > 0 && regras.reprovacaoAutomatica) {
    decisao = DECISAO_TRIAGEM.REPROVADO_AUTOMATICO;
    motivo = bloqueios.join("; ");
  } else if (bloqueios.length > 0) {
    decisao = DECISAO_TRIAGEM.ANALISE_MANUAL;
    motivo = bloqueios.join("; ");
  } else {
    decisao = DECISAO_TRIAGEM.APROVADO_AUTOMATICO;
  }

  return {
    score: {
      total,
      corteMinimo: regras.corteMinimo,
      corteDestaque: regras.corteDestaque,
      // Destaque exige aprovação: candidato eliminado no knockout não pode
      // aparecer como destaque só porque o score de aderência foi alto.
      destaque:
        decisao === DECISAO_TRIAGEM.APROVADO_AUTOMATICO && total >= regras.corteDestaque,
      componentes: { competencias, experiencia, formacao, idiomas, localizacao },
      pesos,
    },
    salario,
    knockout,
    bloqueios,
    decisao,
    motivo,
    aprovado: decisao === DECISAO_TRIAGEM.APROVADO_AUTOMATICO,
    avaliadoEm: agora,
  };
}
