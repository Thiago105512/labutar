import { registrarProgresso } from "../src/cursos.js";

/** Questionário DISC de exemplo: cada questão cobre os quatro fatores. */
export function avaliacaoDISCExemplo(quantidade = 3) {
  return {
    titulo: "Perfil comportamental",
    questoes: Array.from({ length: quantidade }, (_, i) => {
      const n = i + 1;
      return {
        id: `q${n}`,
        enunciado: `Situação ${n}: marque o que mais e o que menos descreve você no trabalho`,
        alternativas: [
          { id: `q${n}d`, texto: "Tomo a frente e resolvo logo", fator: "D" },
          { id: `q${n}i`, texto: "Converso, animo o grupo e convenço", fator: "I" },
          { id: `q${n}s`, texto: "Escuto todo mundo e mantenho a calma", fator: "S" },
          { id: `q${n}c`, texto: "Checo os dados e sigo o padrão", fator: "C" },
        ],
      };
    }),
  };
}

/** Todas as respostas marcando o mesmo fator como "mais" e como "menos". */
export function respostasDISCExemplo(quantidade = 3, { mais = "d", menos = "s" } = {}) {
  return Array.from({ length: quantidade }, (_, i) => {
    const n = i + 1;
    return { questaoId: `q${n}`, mais: `q${n}${mais}`, menos: `q${n}${menos}` };
  });
}

export function cursoExemplo() {
  return {
    titulo: "Integração, conduta e LGPD",
    modulos: [
      {
        id: "m1",
        titulo: "Cultura e conduta",
        aulas: [
          { id: "a1", titulo: "Boas-vindas à empresa", duracaoMinutos: 10, tipo: "VIDEO" },
          { id: "a2", titulo: "Código de conduta", duracaoMinutos: 20, tipo: "TEXTO" },
        ],
      },
      {
        id: "m2",
        titulo: "Proteção de dados",
        aulas: [
          { id: "a3", titulo: "Fundamentos da LGPD", duracaoMinutos: 30, tipo: "VIDEO" },
          { id: "a4", titulo: "Verificação de aprendizagem", duracaoMinutos: 15, tipo: "QUIZ", notaMinima: 7 },
        ],
      },
    ],
  };
}

/** Conclui todas as aulas do curso, respeitando a nota mínima do quiz. */
export function concluirCurso(curso, matricula, { quando = "2026-01-05", notas = { a4: 9 } } = {}) {
  let atual = matricula;
  for (const aula of curso.indiceAulas) {
    atual = registrarProgresso(atual, {
      aulaId: aula.id,
      concluida: true,
      nota: notas[aula.id] ?? null,
      quando,
    });
  }
  return atual;
}
