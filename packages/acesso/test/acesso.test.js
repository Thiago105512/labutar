import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACOES,
  ID_ADMINISTRADOR_GERAL,
  IDS_MODULOS,
  NIVEL,
  PERFIS_PADRAO,
  acessoEfetivo,
  modulosDoUsuario,
  perfilPadrao,
  pode,
  podeConcederAcesso,
  validarPerfilPersonalizado,
  validarSenha,
  verificarAdministradorRestante,
} from "../src/index.js";

const ativo = (extra = {}) => ({ ativo: true, ...extra });
const acessoDe = (perfilId, usuario = {}) => acessoEfetivo(ativo({ perfilId, ...usuario }), perfilPadrao(perfilId));

test("Administrador geral pode tudo, em todos os módulos", () => {
  const acesso = acessoDe(ID_ADMINISTRADOR_GERAL);
  assert.equal(acesso.acessoTotal, true);
  for (const modulo of IDS_MODULOS) {
    for (const acao of Object.keys(ACOES)) assert.equal(pode(acesso, modulo, acao), true, `${modulo}.${acao}`);
  }
  assert.equal(modulosDoUsuario(acesso).every((m) => m.liberado), true);
});

test("ajuste individual não reduz o acesso total", () => {
  const acesso = acessoDe(ID_ADMINISTRADOR_GERAL, { ajustes: { folha: NIVEL.SEM_ACESSO } });
  assert.equal(pode(acesso, "folha", "configurar"), true);
});

test("níveis são cumulativos: consulta vê, operador altera, gestor aprova, administrador configura", () => {
  const casos = [
    [NIVEL.CONSULTA, { ver: true, criar: false, aprovar: false, configurar: false }],
    [NIVEL.OPERADOR, { ver: true, criar: true, editar: true, excluir: false, aprovar: false }],
    [NIVEL.GESTOR, { aprovar: true, excluir: true, exportar: true, dadosSensiveis: true, configurar: false }],
    [NIVEL.ADMINISTRADOR, { configurar: true }],
  ];
  for (const [nivel, esperado] of casos) {
    const acesso = acessoEfetivo(ativo({ perfilId: "X" }), { id: "X", niveis: { folha: nivel } });
    for (const [acao, resultado] of Object.entries(esperado)) {
      assert.equal(pode(acesso, "folha", acao), resultado, `nível ${nivel}, ação ${acao}`);
    }
  }
});

test("recrutador opera o recrutamento, consulta colaboradores e não vê a folha", () => {
  const acesso = acessoDe("RECRUTADOR");
  assert.equal(pode(acesso, "recrutamento", "criar"), true);
  assert.equal(pode(acesso, "recrutamento", "excluir"), false);
  assert.equal(pode(acesso, "colaboradores", "ver"), true);
  assert.equal(pode(acesso, "colaboradores", "editar"), false);
  assert.equal(pode(acesso, "folha", "ver"), false);
  assert.equal(pode(acesso, "administracao", "ver"), false);
  const liberados = modulosDoUsuario(acesso).filter((m) => m.liberado).map((m) => m.id);
  assert.deepEqual(liberados.sort(), ["admissao", "colaboradores", "recrutamento", "tomadores"]);
});

test("ajuste individual sobrepõe o perfil no módulo indicado", () => {
  const acesso = acessoDe("RECRUTADOR", { ajustes: { folha: NIVEL.CONSULTA, recrutamento: NIVEL.GESTOR } });
  assert.equal(pode(acesso, "folha", "ver"), true);
  assert.equal(pode(acesso, "recrutamento", "excluir"), true);
});

test("usuário inativo ou sem perfil não acessa nada", () => {
  const inativo = acessoEfetivo({ ativo: false, perfilId: ID_ADMINISTRADOR_GERAL }, perfilPadrao(ID_ADMINISTRADOR_GERAL));
  assert.equal(inativo.acessoTotal, false);
  assert.equal(pode(inativo, "recrutamento", "ver"), false);
  assert.equal(pode(acessoEfetivo(ativo(), null), "recrutamento", "ver"), false);
});

test("ação ou módulo desconhecido é negado", () => {
  const acesso = acessoDe(ID_ADMINISTRADOR_GERAL);
  assert.equal(pode(acesso, "recrutamento", "apagarTudo"), false);
  assert.equal(pode(acesso, "modulo-inexistente", "ver"), false);
  assert.equal(pode(null, "recrutamento", "ver"), false);
});

test("todo perfil padrão cobre todos os módulos com nível válido", () => {
  for (const perfil of PERFIS_PADRAO) {
    assert.deepEqual(Object.keys(perfil.niveis).sort(), [...IDS_MODULOS].sort(), perfil.id);
    for (const n of Object.values(perfil.niveis)) assert.ok(n >= 0 && n <= 4, perfil.id);
  }
  assert.equal(PERFIS_PADRAO.filter((p) => p.acessoTotal).length, 1, "só um perfil tem acesso total");
});

test("perfil personalizado é validado e nunca tem acesso total", () => {
  assert.equal(validarPerfilPersonalizado({ nome: "Líder de loja", niveis: { ponto: 3 } }).ok, true);
  const invalido = validarPerfilPersonalizado({ nome: "X", acessoTotal: true, niveis: { folha: 9, voo: 1 } });
  assert.equal(invalido.ok, false);
  assert.match(invalido.erros.join(" "), /3 a 60/);
  assert.match(invalido.erros.join(" "), /exclusivo do perfil Administrador geral/);
  assert.match(invalido.erros.join(" "), /nível inválido em folha/);
  assert.match(invalido.erros.join(" "), /módulo desconhecido: voo/);
  assert.match(validarPerfilPersonalizado({ nome: "Vazio", niveis: {} }).erros[0], /ao menos um módulo/);
});

test("ninguém concede acesso acima do próprio", () => {
  const gerente = acessoEfetivo(ativo({ perfilId: "G" }), { id: "G", niveis: { administracao: NIVEL.GESTOR, recrutamento: NIVEL.GESTOR } });
  const dentro = acessoEfetivo(ativo({ perfilId: "A" }), { id: "A", niveis: { recrutamento: NIVEL.OPERADOR } });
  assert.equal(podeConcederAcesso(gerente, dentro).ok, true);

  const acima = acessoEfetivo(ativo({ perfilId: "B" }), { id: "B", niveis: { recrutamento: NIVEL.ADMINISTRADOR, folha: NIVEL.CONSULTA } });
  const r = podeConcederAcesso(gerente, acima);
  assert.equal(r.ok, false);
  assert.match(r.erros.join(" "), /Recrutamento e seleção/);
  assert.match(r.erros.join(" "), /Folha de pagamento/);

  const admin = acessoDe(ID_ADMINISTRADOR_GERAL);
  assert.match(podeConcederAcesso(gerente, admin).erros.join(" "), /acesso total/);
  assert.equal(podeConcederAcesso(admin, admin).ok, true);
});

test("quem não administra o sistema não gerencia usuários", () => {
  const r = podeConcederAcesso(acessoDe("RECRUTADOR"), acessoDe("CONSULTA"));
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /gerenciar usuários/);
});

test("a empresa nunca fica sem Administrador geral ativo", () => {
  assert.equal(verificarAdministradorRestante([{ ativo: true, perfilId: ID_ADMINISTRADOR_GERAL }]).ok, true);
  assert.equal(verificarAdministradorRestante([{ ativo: false, perfilId: ID_ADMINISTRADOR_GERAL }, { ativo: true, perfilId: "RECRUTADOR" }]).ok, false);
});

test("política de senha: comprimento, óbvias e dados pessoais", () => {
  assert.equal(validarSenha("Montanha azul de 2026!").ok, true);
  assert.match(validarSenha("curta").erros[0], /10 caracteres/);
  assert.match(validarSenha("1234567890").erros.join(" "), /comum|só números/);
  assert.match(validarSenha("aaaaaaaaaaaa").erros.join(" "), /único caractere/);
  assert.match(validarSenha("mariafernanda2026", { email: "maria.fernanda@x.com", nome: "Maria Fernanda" }).erros.join(" "), /nome, e-mail/);
  assert.match(validarSenha("x".repeat(129)).erros[0], /no máximo/);
});
