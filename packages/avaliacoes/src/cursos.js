import { gerarToken, novoId } from "../../core/src/ids.js";
import { diferencaDias, estaVencendo, hoje, somarDias } from "../../core/src/datas.js";
import { validarDataISO } from "../../core/src/validacao.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { STATUS_MATRICULA, TIPO_AULA } from "./constantes.js";

const TIPOS_AULA_VALIDOS = Object.values(TIPO_AULA);
const TAMANHO_TOKEN_CERTIFICADO = 24;

function texto(valor) {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

function parsearNota(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;
  const bruto = texto(valor);
  if (!bruto) return null;
  let ajustado = bruto;
  if (ajustado.includes(",") && ajustado.includes(".")) ajustado = ajustado.replace(/\./g, "").replace(",", ".");
  else if (ajustado.includes(",")) ajustado = ajustado.replace(",", ".");
  const numero = Number(ajustado);
  return Number.isFinite(numero) ? numero : NaN;
}

export function formatarCargaHoraria(minutos) {
  const total = Math.max(0, Math.round(Number(minutos) || 0));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) return `${resto}min`;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/** Derivado do token: se alguém editar o código sem editar o token, a validação pega. */
export function codigoVerificacaoDe(token) {
  const bruto = texto(token).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return bruto.match(/.{1,4}/g)?.join("-") ?? "";
}

function normalizarAula(aula, contexto, idsVistos) {
  if (!aula || typeof aula !== "object" || Array.isArray(aula)) {
    throw new Error(`${contexto}: deve ser um objeto com id, titulo, duracaoMinutos e tipo`);
  }
  const id = texto(aula.id);
  if (!id) throw new Error(`${contexto}: 'id' obrigatório`);
  if (idsVistos.has(id)) {
    throw new Error(`${contexto}: id de aula duplicado "${id}". Ids de aula devem ser únicos no curso`);
  }
  idsVistos.add(id);

  const titulo = texto(aula.titulo);
  if (!titulo) throw new Error(`Aula "${id}": 'titulo' obrigatório`);

  const duracaoMinutos = Number(aula.duracaoMinutos);
  if (!Number.isFinite(duracaoMinutos) || duracaoMinutos < 0) {
    throw new Error(`Aula "${id}": 'duracaoMinutos' deve ser um número maior ou igual a zero`);
  }

  const tipo = texto(aula.tipo).toUpperCase();
  if (!TIPOS_AULA_VALIDOS.includes(tipo)) {
    throw new Error(`Aula "${id}": tipo inválido "${aula.tipo ?? ""}". Use ${TIPOS_AULA_VALIDOS.join(" | ")}`);
  }

  let notaMinima = null;
  if (aula.notaMinima !== undefined && aula.notaMinima !== null) {
    notaMinima = parsearNota(aula.notaMinima);
    if (notaMinima === null || !Number.isFinite(notaMinima) || notaMinima < 0 || notaMinima > 10) {
      throw new Error(`Aula "${id}": 'notaMinima' deve ser um número entre 0 e 10`);
    }
  }

  return { id, titulo, duracaoMinutos, tipo, notaMinima };
}

/**
 * Trilha de aprendizagem: módulos agrupam aulas de vídeo, texto ou quiz.
 * O curso carrega um índice achatado de aulas para que a matrícula seja
 * autocontida e o progresso possa ser conferido no navegador.
 */
export function criarCurso({ titulo, descricao = null, modulos } = {}) {
  if (!texto(titulo)) throw new Error("criarCurso exige 'titulo'");
  if (!Array.isArray(modulos) || modulos.length === 0) {
    throw new Error("criarCurso exige 'modulos' como lista com ao menos um módulo");
  }

  const idsModulos = new Set();
  const idsAulas = new Set();
  const indiceAulas = [];

  const normalizados = modulos.map((modulo, indice) => {
    const contexto = `Módulo ${indice + 1}`;
    if (!modulo || typeof modulo !== "object" || Array.isArray(modulo)) {
      throw new Error(`${contexto}: deve ser um objeto com id, titulo e aulas`);
    }
    const id = texto(modulo.id);
    if (!id) throw new Error(`${contexto}: 'id' obrigatório`);
    if (idsModulos.has(id)) throw new Error(`Id de módulo duplicado: "${id}"`);
    idsModulos.add(id);

    const tituloModulo = texto(modulo.titulo);
    if (!tituloModulo) throw new Error(`Módulo "${id}": 'titulo' obrigatório`);

    if (!Array.isArray(modulo.aulas) || modulo.aulas.length === 0) {
      throw new Error(`Módulo "${id}": informe ao menos uma aula`);
    }

    const aulas = modulo.aulas.map((aula, i) =>
      normalizarAula(aula, `Módulo "${id}", aula ${i + 1}`, idsAulas)
    );
    for (const aula of aulas) indiceAulas.push({ ...aula, moduloId: id, tituloModulo });

    return {
      id,
      titulo: tituloModulo,
      descricao: texto(modulo.descricao) || null,
      aulas,
      totalAulas: aulas.length,
      duracaoMinutos: aulas.reduce((soma, aula) => soma + aula.duracaoMinutos, 0),
    };
  });

  const cargaHorariaMinutos = normalizados.reduce((soma, modulo) => soma + modulo.duracaoMinutos, 0);

  return {
    id: novoId("CUR"),
    titulo: texto(titulo),
    descricao: texto(descricao) || null,
    modulos: normalizados,
    indiceAulas,
    totalAulas: indiceAulas.length,
    totalModulos: normalizados.length,
    cargaHorariaMinutos,
    cargaHorariaHoras: arredondar(cargaHorariaMinutos / 60, 1),
    cargaHorariaExtenso: formatarCargaHoraria(cargaHorariaMinutos),
    criadoEm: hoje(),
  };
}

function exigirCurso(curso) {
  if (!curso || !Array.isArray(curso.modulos) || !Array.isArray(curso.indiceAulas)) {
    throw new Error("curso inválido: use criarCurso() para montar a trilha");
  }
}

function exigirMatricula(matricula) {
  if (!matricula || typeof matricula !== "object") {
    throw new Error("matrícula inválida: use matricular() para criar");
  }
}

export function matricular(curso, { alunoId, prazoDias = null, turma = null, quando = hoje() } = {}) {
  exigirCurso(curso);
  const aluno = texto(alunoId);
  if (!aluno) throw new Error("matricular exige 'alunoId'");

  let prazoLimite = null;
  if (prazoDias !== null && prazoDias !== undefined) {
    const dias = Number(prazoDias);
    if (!Number.isFinite(dias) || dias <= 0) {
      throw new Error(`prazoDias deve ser um número maior que zero (recebido: ${prazoDias})`);
    }
    prazoLimite = somarDias(quando, dias);
  }

  return {
    id: novoId("MAT"),
    cursoId: curso.id,
    cursoTitulo: curso.titulo,
    alunoId: aluno,
    turma: texto(turma) || null,
    matriculadoEm: quando,
    prazoLimite,
    status: STATUS_MATRICULA.EM_ANDAMENTO,
    progresso: {},
    indiceAulas: curso.indiceAulas.map((aula) => ({ ...aula })),
  };
}

function aulasConcluidasDe(matricula) {
  return Object.values(matricula.progresso ?? {}).filter((registro) => registro.concluida === true);
}

function statusDe(totalAulas, matricula) {
  const concluidas = aulasConcluidasDe(matricula).length;
  return totalAulas > 0 && concluidas >= totalAulas
    ? STATUS_MATRICULA.CONCLUIDA
    : STATUS_MATRICULA.EM_ANDAMENTO;
}

/**
 * Pura: devolve uma matrícula nova, sem alterar a recebida.
 * Idempotente por construção — o progresso é indexado por aulaId, então concluir
 * duas vezes a mesma aula não conta duas vezes; só `tentativas` aumenta.
 */
export function registrarProgresso(
  matricula,
  { aulaId, concluida = true, nota = null, quando = hoje(), motivo = null } = {},
  curso = null
) {
  exigirMatricula(matricula);
  const indice = Array.isArray(curso?.indiceAulas) ? curso.indiceAulas : matricula.indiceAulas;
  if (!Array.isArray(indice) || indice.length === 0) {
    throw new Error("matrícula sem índice de aulas: crie a matrícula com matricular()");
  }

  const alvo = texto(aulaId);
  const aula = indice.find((item) => texto(item.id) === alvo);
  if (!aula) {
    throw new Error(`aula "${aulaId ?? ""}" não pertence ao curso "${matricula.cursoTitulo ?? matricula.cursoId}"`);
  }

  const notaAtual = nota === null || nota === undefined ? null : parsearNota(nota);
  if (notaAtual !== null && Number.isNaN(notaAtual)) {
    throw new Error(`nota inválida para a aula "${aula.id}": ${nota}`);
  }
  if (notaAtual !== null && (notaAtual < 0 || notaAtual > 10)) {
    throw new Error(`nota da aula "${aula.id}" deve estar entre 0 e 10 (recebido: ${notaAtual})`);
  }

  const anterior = matricula.progresso?.[aula.id] ?? null;
  const notaFinal = notaAtual ?? anterior?.nota ?? null;

  let efetivamenteConcluida = concluida === true;
  let motivoRegistro = texto(motivo) || null;

  // Quiz com nota mínima: reprovar no quiz não conclui a aula, mas o registro
  // fica guardado com a nota para o aluno poder tentar de novo.
  if (efetivamenteConcluida && aula.tipo === TIPO_AULA.QUIZ && aula.notaMinima !== null) {
    if (notaFinal === null) {
      efetivamenteConcluida = false;
      motivoRegistro = `quiz exige nota mínima ${aula.notaMinima}`;
    } else if (notaFinal < aula.notaMinima) {
      efetivamenteConcluida = false;
      motivoRegistro = `nota ${notaFinal} abaixo da mínima ${aula.notaMinima}`;
    }
  }

  const registro = {
    aulaId: aula.id,
    moduloId: aula.moduloId ?? null,
    tipo: aula.tipo,
    duracaoMinutos: aula.duracaoMinutos ?? 0,
    concluida: efetivamenteConcluida,
    nota: notaFinal,
    // Mantém a data da primeira conclusão: repetir a aula não muda o histórico.
    concluidaEm: efetivamenteConcluida ? anterior?.concluidaEm ?? quando : null,
    tentativas: (anterior?.tentativas ?? 0) + 1,
    ultimoRegistroEm: quando,
    motivo: motivoRegistro,
  };

  const atualizada = {
    ...matricula,
    progresso: { ...(matricula.progresso ?? {}), [aula.id]: registro },
    atualizadoEm: quando,
  };
  atualizada.status = statusDe(indice.length, atualizada);

  return atualizada;
}

/**
 * Módulo só conta como concluído quando todas as suas aulas estão concluídas.
 * Percentual é por aula, não por minuto: aula de 5 minutos vale o mesmo que a de
 * 60, porque o que a trilha mede é conteúdo visto.
 */
export function calcularProgresso(curso, matricula, referencia = hoje()) {
  exigirCurso(curso);
  exigirMatricula(matricula);

  const progresso = matricula.progresso ?? {};
  let aulasConcluidas = 0;
  let minutosConcluidos = 0;
  let minutosRestantes = 0;
  const notas = [];
  const modulosConcluidos = [];
  const modulosPendentes = [];

  for (const modulo of curso.modulos) {
    let moduloCompleto = modulo.aulas.length > 0;
    for (const aula of modulo.aulas) {
      const registro = progresso[aula.id];
      const concluida = registro?.concluida === true;
      if (concluida) {
        aulasConcluidas += 1;
        minutosConcluidos += aula.duracaoMinutos;
        if (registro.nota !== null && registro.nota !== undefined) notas.push(registro.nota);
      } else {
        moduloCompleto = false;
        minutosRestantes += aula.duracaoMinutos;
      }
    }
    if (moduloCompleto) modulosConcluidos.push(modulo.id);
    else modulosPendentes.push(modulo.id);
  }

  const aulasTotais = curso.totalAulas;
  const concluido = aulasTotais > 0 && aulasConcluidas === aulasTotais;
  const percentual = aulasTotais > 0 ? arredondar((aulasConcluidas / aulasTotais) * 100, 2) : 0;
  const diasRestantes = matricula.prazoLimite ? diferencaDias(referencia, matricula.prazoLimite) : null;
  const atrasada = !concluido && diasRestantes !== null && diasRestantes < 0;

  return {
    aulasConcluidas,
    aulasTotais,
    percentual,
    minutosConcluidos,
    minutosRestantes,
    cargaHorariaMinutos: curso.cargaHorariaMinutos,
    modulosConcluidos,
    modulosPendentes,
    concluido,
    notaMedia: notas.length > 0 ? arredondar(notas.reduce((soma, n) => soma + n, 0) / notas.length, 2) : null,
    prazoLimite: matricula.prazoLimite ?? null,
    diasRestantes,
    atrasada,
    status: atrasada ? STATUS_MATRICULA.ATRASADA : statusDe(curso.totalAulas, matricula),
  };
}

/**
 * Só emite com a trilha 100% concluída. A carga horária sai da definição do
 * curso, nunca de campo informado por fora — é o que permite detectar
 * certificado adulterado depois.
 */
export function emitirCertificado(
  curso,
  matricula,
  { emissor = "Labutar", alunoNome = null, validadeDias = null, quando = hoje() } = {}
) {
  exigirCurso(curso);
  exigirMatricula(matricula);
  if (!texto(matricula.alunoId)) throw new Error("matrícula sem 'alunoId': impossível identificar o titular");

  const progresso = calcularProgresso(curso, matricula, quando);
  if (!progresso.concluido) {
    throw new Error(
      `certificado exige curso concluído: ${progresso.aulasConcluidas} de ${progresso.aulasTotais} aulas (${progresso.percentual}%). Módulos pendentes: ${progresso.modulosPendentes.join(", ") || "nenhum"}`
    );
  }

  const token = gerarToken(TAMANHO_TOKEN_CERTIFICADO);
  const cargaHorariaMinutos = curso.cargaHorariaMinutos;

  return {
    id: novoId("CERT"),
    codigoVerificacao: codigoVerificacaoDe(token),
    token,
    cursoId: curso.id,
    cursoTitulo: curso.titulo,
    matriculaId: matricula.id ?? null,
    alunoId: matricula.alunoId,
    alunoNome: texto(alunoNome) || null,
    emissor: texto(emissor) || "Labutar",
    emitidoEm: quando,
    cargaHorariaMinutos,
    cargaHorariaHoras: arredondar(cargaHorariaMinutos / 60, 1),
    cargaHorariaExtenso: formatarCargaHoraria(cargaHorariaMinutos),
    modulosConcluidos: progresso.modulosConcluidos,
    notaMedia: progresso.notaMedia,
    validadeDias: validadeDias === null || validadeDias === undefined ? null : Number(validadeDias),
    validoAte:
      validadeDias === null || validadeDias === undefined ? null : somarDias(quando, Number(validadeDias)),
  };
}

/**
 * Sem o curso, confere a estrutura e a coerência interna (código x token, horas x
 * minutos). Com o curso, recalcula a carga horária da definição e pega qualquer
 * número inventado no certificado.
 */
export function validarCertificado(certificado, curso = null) {
  const problemas = [];

  if (!certificado || typeof certificado !== "object") {
    return { valido: false, motivo: "certificado ausente ou malformado", problemas };
  }

  const token = texto(certificado.token);
  if (token.length !== TAMANHO_TOKEN_CERTIFICADO) {
    problemas.push(`token deve ter ${TAMANHO_TOKEN_CERTIFICADO} caracteres (recebido: ${token.length})`);
  }
  const codigo = texto(certificado.codigoVerificacao).toUpperCase();
  if (!codigo) {
    problemas.push("código de verificação ausente");
  } else if (token.length === TAMANHO_TOKEN_CERTIFICADO && codigo !== codigoVerificacaoDe(token)) {
    problemas.push("código de verificação não confere com o token");
  }
  if (!texto(certificado.cursoId)) problemas.push("cursoId ausente");
  if (!texto(certificado.alunoId)) problemas.push("alunoId ausente");

  const data = validarDataISO(certificado.emitidoEm);
  if (!data.valido) problemas.push(`data de emissão inválida (${data.motivo})`);

  const minutos = Number(certificado.cargaHorariaMinutos);
  if (!Number.isFinite(minutos) || minutos <= 0) {
    problemas.push("carga horária ausente ou inválida");
  } else if (
    certificado.cargaHorariaHoras !== undefined &&
    certificado.cargaHorariaHoras !== null &&
    Number(certificado.cargaHorariaHoras) !== arredondar(minutos / 60, 1)
  ) {
    problemas.push(
      `carga horária incoerente: ${certificado.cargaHorariaHoras}h não corresponde a ${minutos} minutos`
    );
  }

  if (curso) {
    if (texto(curso.id) !== texto(certificado.cursoId)) {
      problemas.push(`curso informado (${curso.id}) não é o curso do certificado (${certificado.cursoId})`);
    } else {
      const esperado = curso.cargaHorariaMinutos;
      if (Number.isFinite(minutos) && minutos !== esperado) {
        problemas.push(`carga horária adulterada: o curso tem ${esperado} minutos, o certificado declara ${minutos}`);
      }
    }
  }

  return { valido: problemas.length === 0, motivo: problemas[0] ?? null, problemas };
}

/** Certificado sem validade definida nunca "vence": devolve os campos zerados. */
export function estaVencendoCertificado(certificado, diasAntes = 30, referencia = hoje()) {
  if (!certificado?.validoAte) {
    return {
      vencendo: false,
      vencido: false,
      diasRestantes: null,
      urgencia: null,
      motivo: "certificado sem prazo de validade definido",
    };
  }
  return { ...estaVencendo(certificado.validoAte, diasAntes, referencia), motivo: null };
}
