import test from "node:test";
import assert from "node:assert/strict";

import {
  STATUS_MATRICULA,
  calcularProgresso,
  codigoVerificacaoDe,
  criarCurso,
  emitirCertificado,
  estaVencendoCertificado,
  formatarCargaHoraria,
  matricular,
  registrarProgresso,
  validarCertificado,
} from "../src/index.js";
import { concluirCurso, cursoExemplo } from "./auxiliares.js";

const QUANDO = "2026-01-05";

function curso() {
  return criarCurso(cursoExemplo());
}

function matricula(prazoDias = 30) {
  return matricular(curso(), { alunoId: "ALU_1", prazoDias, quando: QUANDO });
}

function certificadoConcluido(overrides = {}) {
  const cursoCriado = curso();
  const inscrita = matricular(cursoCriado, { alunoId: "ALU_1", prazoDias: 30, quando: QUANDO });
  const concluida = concluirCurso(cursoCriado, inscrita, { quando: QUANDO });
  return { curso: cursoCriado, certificado: emitirCertificado(cursoCriado, concluida, { quando: QUANDO, ...overrides }) };
}

test("criarCurso monta o índice de aulas e a carga horária", () => {
  const criado = curso();
  assert.equal(criado.totalAulas, 4);
  assert.equal(criado.totalModulos, 2);
  assert.equal(criado.cargaHorariaMinutos, 75);
  assert.equal(criado.cargaHorariaHoras, 1.3);
  assert.equal(criado.cargaHorariaExtenso, "1h15");
  assert.deepEqual(
    criado.indiceAulas.map((aula) => aula.id),
    ["a1", "a2", "a3", "a4"]
  );
  assert.equal(criado.indiceAulas[3].moduloId, "m2");
  assert.equal(criado.indiceAulas[3].notaMinima, 7);
  assert.ok(criado.id.startsWith("CUR_"));
});

test("criarCurso rejeita entrada inválida", () => {
  assert.throws(() => criarCurso({ modulos: [] }), /exige 'titulo'/);
  assert.throws(() => criarCurso({ titulo: "X" }), /ao menos um módulo/);
  assert.throws(() => criarCurso({ titulo: "X", modulos: [{ id: "m1", titulo: "M" }] }), /ao menos uma aula/);
  assert.throws(
    () => criarCurso({ titulo: "X", modulos: [{ titulo: "M", aulas: [{ id: "a1", titulo: "A", duracaoMinutos: 5, tipo: "TEXTO" }] }] }),
    /'id' obrigatório/
  );
});

test("criarCurso rejeita tipo de aula inválido e duração negativa", () => {
  assert.throws(
    () =>
      criarCurso({
        titulo: "X",
        modulos: [{ id: "m1", titulo: "M", aulas: [{ id: "a1", titulo: "A", duracaoMinutos: 5, tipo: "PODCAST" }] }],
      }),
    /tipo inválido "PODCAST"/
  );
  assert.throws(
    () =>
      criarCurso({
        titulo: "X",
        modulos: [{ id: "m1", titulo: "M", aulas: [{ id: "a1", titulo: "A", duracaoMinutos: -5, tipo: "VIDEO" }] }],
      }),
    /maior ou igual a zero/
  );
  assert.throws(
    () =>
      criarCurso({
        titulo: "X",
        modulos: [{ id: "m1", titulo: "M", aulas: [{ id: "a1", titulo: "A", tipo: "VIDEO" }] }],
      }),
    /'duracaoMinutos' deve ser um número/
  );
});

test("criarCurso rejeita aula duplicada entre módulos e nota mínima inválida", () => {
  assert.throws(
    () =>
      criarCurso({
        titulo: "X",
        modulos: [
          { id: "m1", titulo: "M1", aulas: [{ id: "a1", titulo: "A", duracaoMinutos: 5, tipo: "VIDEO" }] },
          { id: "m2", titulo: "M2", aulas: [{ id: "a1", titulo: "B", duracaoMinutos: 5, tipo: "TEXTO" }] },
        ],
      }),
    /id de aula duplicado "a1"/
  );
  assert.throws(
    () =>
      criarCurso({
        titulo: "X",
        modulos: [
          { id: "m1", titulo: "M1", aulas: [{ id: "a1", titulo: "A", duracaoMinutos: 5, tipo: "QUIZ", notaMinima: 12 }] },
        ],
      }),
    /'notaMinima' deve ser um número entre 0 e 10/
  );
});

test("matricular cria matrícula em andamento com prazo calculado", () => {
  const inscrita = matricula(30);
  assert.equal(inscrita.status, STATUS_MATRICULA.EM_ANDAMENTO);
  assert.equal(inscrita.alunoId, "ALU_1");
  assert.equal(inscrita.matriculadoEm, QUANDO);
  assert.equal(inscrita.prazoLimite, "2026-02-04");
  assert.deepEqual(inscrita.progresso, {});
  assert.equal(inscrita.indiceAulas.length, 4);
  assert.ok(inscrita.id.startsWith("MAT_"));
});

test("matricular dispensa prazo e rejeita aluno ausente", () => {
  const semPrazo = matricular(curso(), { alunoId: "ALU_2", quando: QUANDO });
  assert.equal(semPrazo.prazoLimite, null);
  assert.throws(() => matricular(curso(), { quando: QUANDO }), /exige 'alunoId'/);
  assert.throws(() => matricular(curso(), { alunoId: "A", prazoDias: 0 }), /maior que zero/);
  assert.throws(() => matricular(null, { alunoId: "A" }), /curso inválido/);
});

test("registrarProgresso rejeita aula que não pertence ao curso", () => {
  assert.throws(
    () => registrarProgresso(matricula(), { aulaId: "a99" }),
    /aula "a99" não pertence ao curso/
  );
  assert.throws(() => registrarProgresso(matricula(), { aulaId: "" }), /não pertence ao curso/);
  assert.throws(() => registrarProgresso({ progresso: {} }, { aulaId: "a1" }), /sem índice de aulas/);
});

test("registrarProgresso é idempotente: repetir aula não conta duas vezes", () => {
  const inscrita = matricula();
  const umaVez = registrarProgresso(inscrita, { aulaId: "a1", concluida: true, quando: QUANDO });
  const duasVezes = registrarProgresso(umaVez, { aulaId: "a1", concluida: true, quando: "2026-01-09" });
  const tresVezes = registrarProgresso(duasVezes, { aulaId: "a1", concluida: true, quando: "2026-01-10" });

  assert.equal(calcularProgresso(curso(), umaVez).aulasConcluidas, 1);
  assert.equal(calcularProgresso(curso(), duasVezes).aulasConcluidas, 1);
  assert.equal(calcularProgresso(curso(), tresVezes).aulasConcluidas, 1);
  assert.equal(Object.keys(tresVezes.progresso).length, 1);
  assert.equal(tresVezes.progresso.a1.tentativas, 3);
  // A data da primeira conclusão não se move com a repetição.
  assert.equal(tresVezes.progresso.a1.concluidaEm, QUANDO);
  assert.equal(tresVezes.progresso.a1.ultimoRegistroEm, "2026-01-10");
});

test("registrarProgresso não altera a matrícula recebida", () => {
  const inscrita = matricula();
  const antes = JSON.stringify(inscrita.progresso);
  registrarProgresso(inscrita, { aulaId: "a1", concluida: true, quando: QUANDO });
  assert.equal(JSON.stringify(inscrita.progresso), antes);
  assert.equal(inscrita.status, STATUS_MATRICULA.EM_ANDAMENTO);
});

test("quiz só conclui a aula com nota mínima", () => {
  const cursoCriado = curso();
  let inscrita = matricular(cursoCriado, { alunoId: "ALU_1", quando: QUANDO });

  inscrita = registrarProgresso(inscrita, { aulaId: "a4", concluida: true, nota: 5, quando: QUANDO });
  assert.equal(inscrita.progresso.a4.concluida, false);
  assert.match(inscrita.progresso.a4.motivo, /abaixo da mínima 7/);
  assert.equal(calcularProgresso(cursoCriado, inscrita).aulasConcluidas, 0);

  inscrita = registrarProgresso(inscrita, { aulaId: "a4", concluida: true, nota: 7, quando: QUANDO });
  assert.equal(inscrita.progresso.a4.concluida, true);
  assert.equal(inscrita.progresso.a4.motivo, null);
  assert.equal(calcularProgresso(cursoCriado, inscrita).aulasConcluidas, 1);

  const semNota = registrarProgresso(inscrita, { aulaId: "a4", concluida: true, nota: null, quando: QUANDO });
  // Sem nota nova, mantém a anterior (7) e não desfaz a conclusão.
  assert.equal(semNota.progresso.a4.concluida, true);
});

test("quiz sem nota informada não conclui a aula", () => {
  const cursoCriado = curso();
  const inscrita = registrarProgresso(matricular(cursoCriado, { alunoId: "A", quando: QUANDO }), {
    aulaId: "a4",
    concluida: true,
    quando: QUANDO,
  });
  assert.equal(inscrita.progresso.a4.concluida, false);
  assert.match(inscrita.progresso.a4.motivo, /exige nota mínima 7/);
});

test("registrarProgresso aceita desfazer conclusão e valida a nota", () => {
  const cursoCriado = curso();
  let inscrita = registrarProgresso(matricular(cursoCriado, { alunoId: "A", quando: QUANDO }), {
    aulaId: "a1",
    concluida: true,
    quando: QUANDO,
  });
  assert.equal(calcularProgresso(cursoCriado, inscrita).aulasConcluidas, 1);

  inscrita = registrarProgresso(inscrita, { aulaId: "a1", concluida: false, quando: "2026-01-06" });
  assert.equal(calcularProgresso(cursoCriado, inscrita).aulasConcluidas, 0);
  assert.equal(inscrita.progresso.a1.concluidaEm, null);

  assert.throws(
    () => registrarProgresso(inscrita, { aulaId: "a1", concluida: true, nota: 11 }),
    /deve estar entre 0 e 10/
  );
  assert.throws(
    () => registrarProgresso(inscrita, { aulaId: "a1", concluida: true, nota: "ótima" }),
    /nota inválida/
  );
});

test("calcularProgresso só considera módulo concluído com todas as aulas", () => {
  const cursoCriado = curso();
  let inscrita = matricular(cursoCriado, { alunoId: "A", quando: QUANDO });

  inscrita = registrarProgresso(inscrita, { aulaId: "a1", concluida: true, quando: QUANDO });
  let progresso = calcularProgresso(cursoCriado, inscrita);
  assert.deepEqual(progresso.modulosConcluidos, []);
  assert.deepEqual(progresso.modulosPendentes, ["m1", "m2"]);
  assert.equal(progresso.percentual, 25);
  assert.equal(progresso.minutosConcluidos, 10);
  assert.equal(progresso.minutosRestantes, 65);
  assert.equal(progresso.concluido, false);
  assert.equal(inscrita.status, STATUS_MATRICULA.EM_ANDAMENTO);

  inscrita = registrarProgresso(inscrita, { aulaId: "a2", concluida: true, quando: QUANDO });
  progresso = calcularProgresso(cursoCriado, inscrita);
  assert.deepEqual(progresso.modulosConcluidos, ["m1"]);
  assert.deepEqual(progresso.modulosPendentes, ["m2"]);
  assert.equal(progresso.percentual, 50);
  assert.equal(progresso.minutosRestantes, 45);
  assert.equal(progresso.concluido, false);
});

test("calcularProgresso fecha o curso, o status e a nota média", () => {
  const cursoCriado = curso();
  const inscrita = concluirCurso(cursoCriado, matricular(cursoCriado, { alunoId: "A", quando: QUANDO }), {
    quando: QUANDO,
    notas: { a4: 8 },
  });
  const progresso = calcularProgresso(cursoCriado, inscrita, QUANDO);
  assert.equal(progresso.concluido, true);
  assert.equal(progresso.percentual, 100);
  assert.equal(progresso.aulasConcluidas, 4);
  assert.equal(progresso.minutosRestantes, 0);
  assert.deepEqual(progresso.modulosConcluidos, ["m1", "m2"]);
  assert.equal(progresso.notaMedia, 8);
  assert.equal(progresso.status, STATUS_MATRICULA.CONCLUIDA);
  assert.equal(progresso.atrasada, false);
});

test("calcularProgresso sinaliza matrícula atrasada", () => {
  const cursoCriado = curso();
  const inscrita = matricular(cursoCriado, { alunoId: "A", prazoDias: 10, quando: QUANDO });
  const atrasada = calcularProgresso(cursoCriado, inscrita, "2026-02-01");
  assert.equal(atrasada.prazoLimite, "2026-01-15");
  assert.equal(atrasada.diasRestantes, -17);
  assert.equal(atrasada.atrasada, true);
  assert.equal(atrasada.status, STATUS_MATRICULA.ATRASADA);
});

test("emitirCertificado bloqueia enquanto o curso não estiver concluído", () => {
  const cursoCriado = curso();
  const inscrita = matricular(cursoCriado, { alunoId: "A", quando: QUANDO });
  assert.throws(
    () => emitirCertificado(cursoCriado, inscrita, { quando: QUANDO }),
    /certificado exige curso concluído: 0 de 4 aulas \(0%\)/
  );

  const parcial = registrarProgresso(inscrita, { aulaId: "a1", concluida: true, quando: QUANDO });
  assert.throws(
    () => emitirCertificado(cursoCriado, parcial, { quando: QUANDO }),
    /1 de 4 aulas \(25%\)/
  );
  assert.throws(
    () => emitirCertificado(cursoCriado, { progresso: {} }, { quando: QUANDO }),
    /sem 'alunoId'/
  );
});

test("emitirCertificado carrega token, código derivado e carga horária do curso", () => {
  const { certificado } = certificadoConcluido({ alunoNome: "Maria da Silva", emissor: "Labutar Cursos" });
  assert.equal(certificado.token.length, 24);
  assert.equal(certificado.codigoVerificacao, codigoVerificacaoDe(certificado.token));
  assert.match(certificado.codigoVerificacao, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(certificado.emitidoEm, QUANDO);
  assert.equal(certificado.cargaHorariaMinutos, 75);
  assert.equal(certificado.cargaHorariaHoras, 1.3);
  assert.equal(certificado.cargaHorariaExtenso, "1h15");
  assert.equal(certificado.alunoNome, "Maria da Silva");
  assert.equal(certificado.emissor, "Labutar Cursos");
  assert.equal(certificado.notaMedia, 9);
  assert.deepEqual(certificado.modulosConcluidos, ["m1", "m2"]);
  assert.equal(certificado.validoAte, null);
  assert.ok(certificado.id.startsWith("CERT_"));
});

test("dois certificados do mesmo curso têm tokens diferentes", () => {
  const primeiro = certificadoConcluido().certificado;
  const segundo = certificadoConcluido().certificado;
  assert.notEqual(primeiro.token, segundo.token);
  assert.notEqual(primeiro.codigoVerificacao, segundo.codigoVerificacao);
});

test("emitirCertificado aplica prazo de validade quando informado", () => {
  const { certificado } = certificadoConcluido({ validadeDias: 365 });
  assert.equal(certificado.validadeDias, 365);
  assert.equal(certificado.validoAte, "2027-01-05");
});

test("validarCertificado aceita certificado íntegro", () => {
  const { curso: cursoCriado, certificado } = certificadoConcluido();
  const resultado = validarCertificado(certificado, cursoCriado);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.motivo, null);
  assert.deepEqual(resultado.problemas, []);
  assert.equal(validarCertificado(certificado).valido, true);
});

test("validarCertificado detecta carga horária adulterada", () => {
  const { curso: cursoCriado, certificado } = certificadoConcluido();
  const adulterado = { ...certificado, cargaHorariaMinutos: 300, cargaHorariaHoras: 5 };
  const resultado = validarCertificado(adulterado, cursoCriado);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo, /carga horária adulterada/);
  assert.match(resultado.motivo, /o curso tem 75 minutos, o certificado declara 300/);
});

test("validarCertificado detecta incoerência interna mesmo sem o curso", () => {
  const { certificado } = certificadoConcluido();
  const resultado = validarCertificado({ ...certificado, cargaHorariaHoras: 99 });
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo, /carga horária incoerente/);
});

test("validarCertificado detecta código de verificação trocado", () => {
  const { certificado } = certificadoConcluido();
  const resultado = validarCertificado({ ...certificado, codigoVerificacao: "AAAA-BBBB-CCCC" });
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo, /não confere com o token/);
});

test("validarCertificado rejeita token curto, data inválida e curso trocado", () => {
  const { curso: cursoCriado, certificado } = certificadoConcluido();

  const tokenCurto = validarCertificado({ ...certificado, token: "ABC123" });
  assert.equal(tokenCurto.valido, false);
  assert.match(tokenCurto.motivo, /token deve ter 24 caracteres/);

  const dataRuim = validarCertificado({ ...certificado, emitidoEm: "05/01/2026" });
  assert.equal(dataRuim.valido, false);
  assert.match(dataRuim.motivo, /data de emissão inválida/);

  const semAluno = validarCertificado({ ...certificado, alunoId: "" });
  assert.equal(semAluno.valido, false);
  assert.match(semAluno.motivo, /alunoId ausente/);

  const cursoErrado = validarCertificado(certificado, criarCurso(cursoExemplo()));
  assert.equal(cursoErrado.valido, false);
  assert.match(cursoErrado.motivo, /não é o curso do certificado/);

  assert.equal(validarCertificado(null).valido, false);
  assert.match(validarCertificado(undefined, cursoCriado).motivo, /certificado ausente/);
});

test("formatarCargaHoraria escreve horas e minutos", () => {
  assert.equal(formatarCargaHoraria(75), "1h15");
  assert.equal(formatarCargaHoraria(120), "2h");
  assert.equal(formatarCargaHoraria(45), "45min");
  assert.equal(formatarCargaHoraria(0), "0min");
});

test("estaVencendoCertificado reaproveita a regra de vencimento do núcleo", () => {
  const { certificado } = certificadoConcluido({ validadeDias: 365 });

  const longe = estaVencendoCertificado(certificado, 30, "2026-06-01");
  assert.equal(longe.vencendo, false);
  assert.equal(longe.vencido, false);
  assert.equal(longe.diasRestantes, 218);
  assert.equal(longe.urgencia, "BAIXA");

  const perto = estaVencendoCertificado(certificado, 30, "2026-12-25");
  assert.equal(perto.vencendo, true);
  assert.equal(perto.diasRestantes, 11);
  assert.equal(perto.urgencia, "MEDIA");

  const vencido = estaVencendoCertificado(certificado, 30, "2027-02-01");
  assert.equal(vencido.vencido, true);
  assert.equal(vencido.urgencia, "VENCIDO");
});

test("estaVencendoCertificado trata certificado sem validade", () => {
  const { certificado } = certificadoConcluido();
  const resultado = estaVencendoCertificado(certificado, 30, QUANDO);
  assert.equal(resultado.vencendo, false);
  assert.equal(resultado.vencido, false);
  assert.equal(resultado.diasRestantes, null);
  assert.match(resultado.motivo, /sem prazo de validade/);
});
