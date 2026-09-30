/**
 * Folha de demonstração: setembro/2026, empresa de mão de obra no Polo Industrial de Manaus
 * (docs/14-cenario-de-teste.md), em escala de vitrine. Pessoas e valores fictícios.
 */
import { TIPO_VINCULO, gerarMatricula } from "../../../packages/mao-de-obra/src/index.js";
import { somarDias } from "../../../packages/core/src/datas.js";
import * as ats from "../../../packages/ats/src/index.js";
import { INSTRUMENTOS } from "../../../packages/convencoes/src/index.js";

export const COMPETENCIA_DEMO = "2026-09";

/**
 * Empresa de teste: a CRQ faz, por enquanto, o papel da empresa de RH e o da clínica de SST
 * do grupo (decisão de 2026-09-30). Só dados públicos do CNPJ.
 */
export const EMPRESAS_DEMO = Object.freeze([
  Object.freeze({
    id: "42288454000150",
    cnpj: "42288454000150",
    razaoSocial: "C R Q Clínica Integrada de Serviços Médicos",
    nomeFantasia: "CRQ Serviços",
    municipio: "Manaus",
    uf: "AM",
    cnaePrincipal: "8630-5/99",
    regimeTributario: "LUCRO_REAL",
    papeis: ["EMPRESA_RH", "CLINICA_SST"],
  }),
]);

/** Tomadores fictícios do Polo Industrial de Manaus (CNPJs fictícios com dígito válido). */
export const TOMADORES_DEMO = Object.freeze({
  "TOM:T1": { id: "TOM_ELETRONICA_AMAZONIA", cnpj: "04567891000113", razaoSocial: "Eletrônica Amazônia S.A.", municipio: "Manaus", uf: "AM", refeitorio: true },
  "TOM:T2": { id: "TOM_MOTOS_NORTE", cnpj: "07891234000115", razaoSocial: "Motos do Norte Ltda", municipio: "Manaus", uf: "AM", refeitorio: true },
  "TOM:T3": { id: "TOM_AMAZON_INFORMATICA", cnpj: "09123456000113", razaoSocial: "Amazon Informática S.A.", municipio: "Manaus", uf: "AM", refeitorio: true },
  "TOM:T4": { id: "TOM_PLASTICOS_TARUMA", cnpj: "03456789000188", razaoSocial: "Plásticos Tarumã Ltda", municipio: "Manaus", uf: "AM", refeitorio: true },
});
export const SETORES_DEMO = Object.freeze([{ id: "ADM", nome: "Administrativo próprio" }]);

const SINDICATO_DEMO = Object.freeze({ cnpj: "23006562000148", sigla: "SEEACEAM", nome: "Sindicato dos Empregados em Empresas de Asseio e Conservação do Estado do Amazonas" });

export const EMPRESA_FOLHA_DEMO = Object.freeze({
  id: "empresa",
  cnpj: EMPRESAS_DEMO[0].cnpj,
  razaoSocial: EMPRESAS_DEMO[0].razaoSocial,
  regime: "NORMAL",
  ratPercentual: 3,
  fap: 1,
  terceirosPercentual: 5.8,
  fpas: "515 (conferir)",
  arredondamentoINSS: "POR_FAIXA",
  local: { uf: "AM", municipio: "Manaus" },
  setores: SETORES_DEMO,
  // Sindicato sugerido na admissão por tipo de vínculo (o DP confirma ou troca). A CCT AM000038/2026
  // abrange todos os empregados das empresas de asseio, conservação e serviços terceirizados.
  sindicatosPadrao: { TEMPORARIO: SINDICATO_DEMO.cnpj, TERCEIRIZADO: SINDICATO_DEMO.cnpj, PROPRIO: SINDICATO_DEMO.cnpj },
  // Desconto do vale-refeição pela empresa (a CCT permite até 10%).
  descontoVRPercentual: 0,
});

/** Função da tabela de pisos da CCT para os cargos do demo (os demais ficam para o DP enquadrar). */
const ENQUADRAMENTO_DEMO = Object.freeze({
  "Auxiliar de limpeza": "Agente de Limpeza",
  "Auxiliar de logística": "Auxiliar de Apoio Logístico",
  "Supervisora de operações": "Supervisor Operacional",
});

const T = TIPO_VINCULO.TEMPORARIO, S = TIPO_VINCULO.TERCEIRIZADO, P = TIPO_VINCULO.PROPRIO;
const seq = { [T]: 0, [S]: 0, [P]: 0 };
const pessoa = (vinculo, nome, cargo, lotacao, salario, admissao, extra = {}, lancamentos = {}) => ({
  // CPF em branco de propósito: é o código da pessoa e vem do cadastro real.
  colaborador: { cpf: null, matricula: gerarMatricula(vinculo, ++seq[vinculo] + 4800), nome, vinculo, cargo, lotacao, salario, admissao, ...extra },
  lancamentos,
});

export function folhaDemo() {
  for (const k of Object.keys(seq)) seq[k] = 0;
  return [
    pessoa(T, "Alessandra Moura Pinto", "Montadora de placas", "TOM:T1", 188_000, "2026-04-06", { dependentesIR: 1, filhosSalarioFamilia: 2 }, { horasExtras50: 12, horasNoturnas: 35, adiantamento: 75_200 }),
    pessoa(T, "Bruno Carvalho Lima", "Operador de SMT", "TOM:T1", 245_000, "2026-03-16", {}, { horasExtras50: 18, horasExtras100: 8, horasNoturnas: 70, adiantamento: 98_000, custoValeTransporte: 22_000 }),
    pessoa(T, "Cíntia Rocha Batista", "Inspetora de qualidade", "TOM:T1", 262_000, "2026-05-04", { dependentesIR: 2 }, { horasExtras50: 6, adiantamento: 104_800 }),
    pessoa(T, "Diego Souza Farias", "Montador", "TOM:T1", 188_000, "2026-06-01", {}, { faltasDias: 2, dsrPerdidos: 1, adiantamento: 75_200 }),
    pessoa(T, "Evelyn Castro Nunes", "Montadora de placas", "TOM:T1", 188_000, "2026-09-14", { filhosSalarioFamilia: 1 }, {}),
    pessoa(T, "Fábio Menezes Prado", "Técnico de retrabalho", "TOM:T1", 310_000, "2026-03-02", { dependentesIR: 1 }, { horasExtras50: 20, horasNoturnas: 60, adiantamento: 124_000 }),
    pessoa(T, "Gabriela Tavares Reis", "Operadora de linha", "TOM:T2", 205_000, "2026-04-13", {}, { horasExtras50: 10, adiantamento: 82_000, custoValeTransporte: 18_000 }),
    pessoa(T, "Henrique Alves Queiroz", "Montador de motocicletas", "TOM:T2", 228_000, "2026-03-09", { dependentesIR: 1 }, { horasExtras50: 14, horasExtras100: 4, adiantamento: 91_200 }),
    pessoa(T, "Isabela Freitas Cunha", "Pintora industrial", "TOM:T2", 240_000, "2026-05-18", { insalubridadeGrau: 20 }, { horasExtras50: 8, adiantamento: 96_000 }),
    pessoa(T, "João Pedro Nogueira", "Montador de motocicletas", "TOM:T2", 228_000, "2026-02-02", {}, { adiantamento: 91_200 }, ),
    pessoa(T, "Karina Lopes Andrade", "Operadora de testes", "TOM:T3", 215_000, "2026-07-06", { filhosSalarioFamilia: 1 }, { adiantamento: 86_000 }),
    pessoa(S, "Luciano Barros Teles", "Auxiliar de logística", "TOM:T3", 195_000, "2025-11-03", { dependentesIR: 1 }, { horasExtras50: 10, adiantamento: 78_000, custoValeTransporte: 20_000 }),
    pessoa(S, "Márcia Oliveira Santos", "Auxiliar de limpeza", "TOM:T3", 170_000, "2024-08-12", { insalubridadeGrau: 40, filhosSalarioFamilia: 2 }, { adiantamento: 68_000 }),
    pessoa(S, "Nelson Pereira Vidal", "Eletricista de manutenção", "TOM:T3", 420_000, "2023-03-20", { periculosidade: true, dependentesIR: 2 }, { horasExtras50: 16, horasExtras100: 6, adiantamento: 168_000 }),
    pessoa(S, "Otávio Ramos Leal", "Operador de empilhadeira", "TOM:T4", 260_000, "2025-01-13", { periculosidade: true }, { horasExtras50: 12, adiantamento: 104_000 }),
    pessoa(S, "Patrícia Gomes Sales", "Porteira", "TOM:T4", 185_000, "2025-06-02", {}, { horasNoturnas: 84, adiantamento: 74_000 }),
    pessoa(S, "Rafael Cardoso Maia", "Porteiro", "TOM:T4", 185_000, "2024-10-07", {}, { horasNoturnas: 84, faltasDias: 1, dsrPerdidos: 1, adiantamento: 74_000 }),
    pessoa(S, "Sabrina Duarte Melo", "Auxiliar de limpeza", "TOM:T4", 170_000, "2026-02-09", { insalubridadeGrau: 20 }, { adiantamento: 68_000 }),
    pessoa(P, "Tatiana Brito Coelho", "Analista de departamento pessoal", "SET:ADM", 480_000, "2022-02-01", { dependentesIR: 1 }, { adiantamento: 192_000 }),
    pessoa(P, "Ulisses Monteiro Paz", "Recrutador", "SET:ADM", 360_000, "2023-09-04", {}, { adiantamento: 144_000 }),
    pessoa(P, "Vanessa Arruda Fonseca", "Supervisora de operações", "SET:ADM", 650_000, "2021-05-10", { dependentesIR: 2 }, { horasExtras50: 10, adiantamento: 260_000 }),
    pessoa(P, "Wagner Siqueira Dantas", "Gerente comercial", "SET:ADM", 1_200_000, "2020-01-06", { dependentesIR: 1 }, { adiantamento: 480_000 }),
    pessoa(T, "Yara Pimentel Costa", "Montadora", "TOM:T2", 205_000, "2026-03-02", {}, {}, ),
  ].map((p, i) => (i === 22 ? { ...p, colaborador: { ...p.colaborador, desligamento: "2026-09-18" } } : p));
}

const CONTRATO_DEMO = {
  TEMPORARIO: { tipo: "TRABALHO_TEMPORARIO", inicio: "2026-01-01", fim: "2026-12-31", hipotese: "DEMANDA_COMPLEMENTAR", justificativa: "Acréscimo extraordinário de produção do segundo semestre" },
  TERCEIRIZADO: { tipo: "PRESTACAO_SERVICOS", inicio: "2023-01-02", fim: null },
};

/**
 * Semeia o cadastro (tomadores, contratos, postos, pessoas e vínculos) e os lançamentos de
 * setembro/2026 a partir da lista de demonstração. CPF em branco de propósito.
 */
/**
 * Prazo do temporário no demo: 180 dias (Lei 6.019/1974, art. 10, § 1º); quem já passou dos
 * 180 dias na competência de demonstração está na prorrogação de 90 (§ 2º).
 */
function prazoDoTemporario(admissao) {
  const fim180 = somarDias(admissao, 179);
  return fim180 >= `${COMPETENCIA_DEMO}-30`
    ? { fimPrevisto: fim180, prorrogado: false }
    : { fimPrevisto: somarDias(admissao, 269), prorrogado: true };
}

/** Candidatos do recrutamento demo prontos para admitir: a admissão puxa os dados deles. */
const PRONTOS_PARA_ADMITIR = { "João Batista Silva": "aprovado", "Carlos Eduardo Ramos": "proposta" };

async function adiantarProcessoSeletivo(repo, tenantId) {
  const [candidatos, candidaturas, vagas] = await Promise.all(
    ["candidatos", "candidaturas", "vagas"].map((c) => repo.listar(tenantId, c, {}, { limite: 1000 }).then((r) => r.itens))
  );
  for (const [nome, etapa] of Object.entries(PRONTOS_PARA_ADMITIR)) {
    const candidato = candidatos.find((c) => c.dados?.nome === nome);
    const candidatura = candidato && candidaturas.find((c) => c.candidatoId === candidato.id);
    const vaga = candidatura && vagas.find((v) => v.id === candidatura.vagaId);
    if (!vaga) continue;
    const r = ats.moverEtapa(candidatura, { vaga, paraEtapaId: etapa, observacao: "Demonstração" });
    if (r.ok) await repo.atualizar(tenantId, "candidaturas", candidatura.id, r.candidatura);
  }
}

export async function semearFolha(repo, tenantId) {
  if (await repo.contar(tenantId, "vinculos")) return { semeado: false };
  for (const e of EMPRESAS_DEMO) await repo.inserir(tenantId, "empresas", { ...e });
  await repo.inserir(tenantId, "folhaParametros", { ...EMPRESA_FOLHA_DEMO });
  for (const t of Object.values(TOMADORES_DEMO)) await repo.inserir(tenantId, "tomadores", { ...t });
  for (const i of INSTRUMENTOS) await repo.inserir(tenantId, "convencoes", structuredClone(i));

  const contratos = new Map();
  const postos = new Map();
  const dados = folhaDemo();
  let nPessoa = 0;
  for (const { colaborador: c, lancamentos } of dados) {
    const tomador = TOMADORES_DEMO[c.lotacao] ?? null;
    let contrato = null;
    let posto = null;
    if (tomador) {
      const chaveContrato = `${tomador.id}:${c.vinculo}`;
      if (!contratos.has(chaveContrato)) {
        contrato = { id: `CTR_${tomador.id.slice(4)}_${c.vinculo === "TEMPORARIO" ? "TEMP" : "SERV"}`, tomadorId: tomador.id, tomadorCnpj: tomador.cnpj, ...CONTRATO_DEMO[c.vinculo] };
        contratos.set(chaveContrato, contrato);
        await repo.inserir(tenantId, "contratosTomador", contrato);
      }
      contrato = contratos.get(chaveContrato);
      const chavePosto = `${contrato.id}:${c.cargo}`;
      if (!postos.has(chavePosto)) {
        posto = {
          id: `POS_${postos.size + 1}`, contratoId: contrato.id, tomadorId: tomador.id, funcao: c.cargo, vagas: 2, // o contrato pede mais do que já está ocupado: sobram vagas para admitir
          funcaoConvencao: ENQUADRAMENTO_DEMO[c.cargo] ?? null,
          jornadaMensal: 220, insalubridadeGrau: c.insalubridadeGrau ?? null, periculosidade: Boolean(c.periculosidade),
          salarioReferencia: c.vinculo === "TEMPORARIO" ? c.salario : null, local: { uf: tomador.uf, municipio: tomador.municipio },
        };
        postos.set(chavePosto, posto);
      }
      posto = postos.get(chavePosto);
      posto.vagas += 1;
    }

    const filhos = c.filhosSalarioFamilia ?? 0;
    const depIR = c.dependentesIR ?? 0;
    const dependentes = Array.from({ length: Math.max(filhos, depIR) }, (_, i) => ({
      nome: `Dependente ${i + 1} de ${c.nome.split(" ")[0]}`, parentesco: "FILHO", nascimento: "2018-05-10",
      cpf: null, deduzIR: i < depIR, salarioFamilia: i < filhos, invalido: false,
    }));
    const pessoaId = `PES_${String(++nPessoa).padStart(4, "0")}`;
    // Associados ao sindicato laboral no demo: um a cada três (cesta básica da CCT).
    await repo.inserir(tenantId, "pessoas", { id: pessoaId, cpf: null, nome: c.nome, dependentes, banco: null, associadoSindicato: nPessoa % 3 === 0 });
    await repo.inserir(tenantId, "vinculos", {
      id: c.matricula, matricula: c.matricula, pessoaId, tipo: c.vinculo, admissao: c.admissao, desligamento: c.desligamento ?? null,
      cargo: c.cargo, salario: c.salario, historicoSalarial: [{ desde: c.admissao, valor: c.salario, motivo: "Admissão" }],
      tomadorId: tomador?.id ?? null, tomadorCnpj: tomador?.cnpj ?? null, contratoId: contrato?.id ?? null, postoId: posto?.id ?? null,
      setor: tomador ? null : "ADM",
      funcaoConvencao: tomador ? null : ENQUADRAMENTO_DEMO[c.cargo] ?? null,
      sindicato: { ...SINDICATO_DEMO },
      temporario: c.vinculo === "TEMPORARIO" ? prazoDoTemporario(c.admissao) : null,
    });
    await repo.inserir(tenantId, "folhaLancamentos", { id: `${COMPETENCIA_DEMO}:${c.matricula}`, competencia: COMPETENCIA_DEMO, matricula: c.matricula, ...lancamentos });
  }
  for (const p of postos.values()) await repo.inserir(tenantId, "postos", p);
  await adiantarProcessoSeletivo(repo, tenantId);
  return { semeado: true, colaboradores: dados.length };
}
