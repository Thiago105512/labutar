import test from "node:test";
import assert from "node:assert/strict";

import {
  criarCandidato,
  chavesDeDeduplicacao,
  encontrarDuplicado,
  validarConsentimento,
  mesclarCandidatos,
  anonimizarCandidato,
  buscarCandidatos,
} from "../src/candidatos.js";

const AGORA = "2026-09-27T10:00:00.000Z";

function base(sobrescrever = {}) {
  return {
    dados: { nome: "Ana Souza", cpf: "11144477735" },
    contato: { email: "Ana@Exemplo.COM", telefone: "(11) 98765-4321", cidade: "São Paulo", uf: "sp" },
    competencias: [{ nome: "Node.js", nivel: 4 }],
    ...sobrescrever,
  };
}

test("criarCandidato exige nome e normaliza contato", () => {
  assert.throws(() => criarCandidato({}), /exige dados\.nome/);
  assert.throws(() => criarCandidato({ dados: { nome: "  " } }), /exige dados\.nome/);

  const c = criarCandidato(base(), { agora: AGORA });
  assert.match(c.id, /^CAND_/);
  assert.equal(c.contato.email, "ana@exemplo.com");
  assert.equal(c.contato.uf, "SP");
  assert.equal(c.criadoEm, AGORA);
  assert.equal(c.dados.pcd, false);
});

test("criarCandidato rejeita CPF e e-mail inválidos", () => {
  assert.throws(() => criarCandidato(base({ dados: { nome: "X", cpf: "11111111111" } })), /CPF inválido/);
  assert.throws(() => criarCandidato(base({ contato: { email: "sem-arroba" } })), /e-mail inválido/);
});

test("criarCandidato aceita CPF com máscara e sem CPF", () => {
  assert.equal(criarCandidato(base({ dados: { nome: "X", cpf: "111.444.777-35" } })).dados.cpf, "11144477735");
  assert.equal(criarCandidato({ dados: { nome: "Sem CPF" } }).dados.cpf, null);
});

test("chaves de deduplicação seguem a ordem CPF → e-mail → telefone", () => {
  assert.deepEqual(chavesDeDeduplicacao(criarCandidato(base())), [
    "cpf:11144477735",
    "email:ana@exemplo.com",
    "tel:11987654321",
  ]);
});

test("chave inválida é descartada em vez de gerar falso positivo", () => {
  assert.deepEqual(
    chavesDeDeduplicacao({ dados: { cpf: "11111111111" }, contato: { telefone: "123", email: "sem-arroba" } }),
    []
  );
  assert.deepEqual(chavesDeDeduplicacao({}), []);
  assert.deepEqual(chavesDeDeduplicacao(null), []);
});

test("telefone com DDI 55 é normalizado antes de virar chave", () => {
  const c = criarCandidato({ dados: { nome: "X" }, contato: { telefone: "+55 11 98765-4321" } });
  assert.deepEqual(chavesDeDeduplicacao(c), ["tel:11987654321"]);
});

test("encontrarDuplicado casa por qualquer uma das três chaves", () => {
  const existente = criarCandidato(base());

  const porCpf = criarCandidato({ dados: { nome: "Outra Grafia", cpf: "11144477735" } });
  assert.equal(encontrarDuplicado(porCpf, [existente]).chave, "cpf:11144477735");

  const porEmail = criarCandidato({ dados: { nome: "Sem CPF" }, contato: { email: "ANA@exemplo.com" } });
  assert.equal(encontrarDuplicado(porEmail, [existente]).chave, "email:ana@exemplo.com");

  const porTelefone = criarCandidato({ dados: { nome: "Sem CPF" }, contato: { telefone: "11987654321" } });
  assert.equal(encontrarDuplicado(porTelefone, [existente]).chave, "tel:11987654321");
});

test("encontrarDuplicado ignora o próprio registro e devolve null sem chaves", () => {
  const existente = criarCandidato(base());
  assert.equal(encontrarDuplicado(existente, [existente]), null);
  assert.equal(encontrarDuplicado({ dados: { nome: "Sem nada" } }, [existente]), null);
});

test("validarConsentimento cobre ausência, vencimento e validade", () => {
  const semConsentimento = criarCandidato(base());
  assert.equal(validarConsentimento(semConsentimento).situacao, "AUSENTE");

  const semData = criarCandidato(base({ consentimento: { aceito: true } }));
  assert.equal(validarConsentimento(semData).situacao, "SEM_DATA");

  const valido = criarCandidato(base({ consentimento: { aceito: true, em: "2026-01-01" } }));
  const r = validarConsentimento(valido, { referencia: "2026-09-27" });
  assert.equal(r.valido, true);
  assert.equal(r.situacao, "VALIDO");
  assert.equal(r.dias, 269);

  const vencido = criarCandidato(base({ consentimento: { aceito: true, em: "2024-01-01" } }));
  const v = validarConsentimento(vencido, { referencia: "2026-09-27" });
  assert.equal(v.valido, false);
  assert.equal(v.situacao, "VENCIDO");
  assert.equal(v.dias, 1000);
  assert.match(v.motivo, /24 meses/);

  assert.equal(
    validarConsentimento(vencido, { referencia: "2026-09-27", retencaoMeses: 60 }).valido,
    true
  );
});

test("mesclarCandidatos preserva o id do base e absorve o outro", () => {
  const antigo = criarCandidato(
    base({
      competencias: [{ nome: "Node.js" }],
      experiencias: [{ cargo: "Analista", empresa: "ACME", inicio: "2020-01-01" }],
    }),
    { agora: "2026-01-01T00:00:00.000Z" }
  );
  const recente = criarCandidato(
    {
      dados: { nome: "Ana Souza Lima" },
      contato: { email: "ana@novo.com", cidade: "Campinas" },
      competencias: [{ nome: "node.js", nivel: 5 }, { nome: "SQL" }],
      experiencias: [{ cargo: "Analista", empresa: "Outra", inicio: "2023-01-01" }],
      consentimento: { aceito: true, em: "2026-09-01" },
    },
    { agora: "2026-09-01T00:00:00.000Z" }
  );

  const fundido = mesclarCandidatos(antigo, recente);
  assert.equal(fundido.id, antigo.id);
  assert.deepEqual(fundido.fundidoDe, [recente.id]);
  assert.equal(fundido.dados.nome, "Ana Souza Lima");
  assert.equal(fundido.dados.cpf, "11144477735");
  assert.equal(fundido.contato.email, "ana@novo.com");
  assert.equal(fundido.contato.uf, "SP");
  assert.equal(fundido.consentimento.em, "2026-09-01");
  assert.equal(fundido.competencias.length, 2);
  assert.equal(fundido.competencias.find((c) => c.nome === "node.js").nivel, 5);
});

test("mesclar não colapsa experiências distintas com o mesmo cargo", () => {
  const antigo = criarCandidato(
    base({ experiencias: [{ cargo: "Analista", empresa: "ACME", inicio: "2020-01-01" }] }),
    { agora: "2026-01-01T00:00:00.000Z" }
  );
  const recente = criarCandidato(
    base({ experiencias: [{ cargo: "Analista", empresa: "Outra", inicio: "2023-01-01" }] }),
    { agora: "2026-09-01T00:00:00.000Z" }
  );
  assert.equal(mesclarCandidatos(antigo, recente).experiencias.length, 2);
});

test("revogação de consentimento nunca é ressuscitada pela fusão", () => {
  const revogado = criarCandidato(
    base({ consentimento: { aceito: false, revogadoEm: "2026-05-01", em: "2026-01-01" } }),
    { agora: "2026-05-01T00:00:00.000Z" }
  );
  const novo = criarCandidato(
    base({ consentimento: { aceito: true, em: "2026-09-01" } }),
    { agora: "2026-09-01T00:00:00.000Z" }
  );

  const fundido = mesclarCandidatos(revogado, novo);
  assert.equal(fundido.consentimento.aceito, false);
  assert.equal(fundido.consentimento.revogadoEm, "2026-05-01");

  // mesma garantia com os argumentos invertidos
  assert.equal(mesclarCandidatos(novo, revogado).consentimento.aceito, false);
});

test("entre duas concessões vale a mais recente", () => {
  const velho = criarCandidato(base({ consentimento: { aceito: true, em: "2025-01-01" } }), { agora: "2025-01-01T00:00:00.000Z" });
  const novo = criarCandidato(base({ consentimento: { aceito: true, em: "2026-06-01" } }), { agora: "2026-06-01T00:00:00.000Z" });
  assert.equal(mesclarCandidatos(velho, novo).consentimento.em, "2026-06-01");
});

test("mesclarCandidatos valida as entradas", () => {
  assert.throws(() => mesclarCandidatos(null, { id: "X" }), /candidato base/);
  assert.throws(() => mesclarCandidatos({ id: "X" }, null), /para fundir/);
});

test("anonimizarCandidato remove identificadores e revoga o consentimento", () => {
  const c = criarCandidato(base({ consentimento: { aceito: true, em: "2026-01-01" } }), { agora: AGORA });
  const anon = anonimizarCandidato(c, { agora: AGORA, motivo: "art. 18, VI, LGPD" });

  assert.equal(anon.id, c.id);
  assert.equal(anon.dados.nome, "TITULAR_REMOVIDO");
  assert.equal(anon.dados.cpf, null);
  assert.equal(anon.contato.email, null);
  assert.equal(anon.contato.telefone, null);
  assert.equal(anon.curriculoTexto, "");
  assert.equal(anon.consentimento.aceito, false);
  assert.equal(anon.consentimento.motivoRevogacao, "art. 18, VI, LGPD");
  assert.equal(anon.anonimizadoEm, AGORA);
});

test("buscarCandidatos filtra por texto, competência, cidade e UF", () => {
  const ana = criarCandidato(base({ curriculoTexto: "Atuei com Node.js e PostgreSQL" }));
  const bruno = criarCandidato({
    dados: { nome: "Bruno Lima" },
    contato: { email: "bruno@exemplo.com", cidade: "Curitiba", uf: "PR" },
    competencias: [{ nome: "Java" }],
  });

  assert.deepEqual(buscarCandidatos([ana, bruno], { texto: "postgresql" }).map((c) => c.id), [ana.id]);
  assert.deepEqual(buscarCandidatos([ana, bruno], { competencias: ["java"] }).map((c) => c.id), [bruno.id]);
  assert.deepEqual(buscarCandidatos([ana, bruno], { cidade: "São Paulo" }).map((c) => c.id), [ana.id]);
  assert.deepEqual(buscarCandidatos([ana, bruno], { uf: "PR" }).map((c) => c.id), [bruno.id]);
  assert.equal(buscarCandidatos([ana, bruno], {}).length, 2);
  assert.equal(buscarCandidatos([ana, bruno], { texto: "ruby" }).length, 0);
});

test("buscarCandidatos nunca retorna registro anonimizado", () => {
  const c = criarCandidato(base({ curriculoTexto: "Node.js" }));
  const anon = anonimizarCandidato(c);
  assert.equal(buscarCandidatos([anon], { texto: "node" }).length, 0);
  assert.equal(buscarCandidatos([anon], {}).length, 0);
});
