/**
 * Admissão digital: o colaborador completa os dados no portal (endereço, documentos, conta para
 * receber), faz o exame admissional na clínica e aceita o contrato eletronicamente. O DP só
 * conclui a admissão com tudo em ordem — e nunca sem ASO apto (NR-7).
 *
 * Sem dado de saúde aqui: do exame, a admissão só conhece a conclusão do ASO (apto ou inapto).
 */
import { validarCPF } from "../../core/src/validacao.js";
import { formatarDataBR } from "../../core/src/datas.js";

export const STATUS_ADMISSAO = Object.freeze({
  PENDENTE: "PENDENTE",
  DOCUMENTOS_OK: "DOCUMENTOS_OK",
  ASO_OK: "ASO_OK",
  ENVIADA: "ENVIADA",
  CONCLUIDA: "CONCLUIDA",
  BLOQUEADA: "BLOQUEADA",
});

export const TIPO_REGIME = Object.freeze({
  CLT: "CLT",
  TEMPORARIO: "TEMPORARIO", // Lei 6.019/1974
  APRENDIZ: "APRENDIZ",
  ESTAGIO: "ESTAGIO",
});

/** Etapas na ordem em que aparecem para o colaborador e para o DP. */
export const ETAPAS_ADMISSAO = Object.freeze([
  Object.freeze({ id: "DADOS_PESSOAIS", nome: "Dados pessoais", quem: "COLABORADOR" }),
  Object.freeze({ id: "ENDERECO", nome: "Endereço", quem: "COLABORADOR" }),
  Object.freeze({ id: "DOCUMENTOS", nome: "Documentos", quem: "COLABORADOR" }),
  Object.freeze({ id: "PAGAMENTO", nome: "Conta para receber", quem: "COLABORADOR" }),
  Object.freeze({ id: "ASO", nome: "Exame admissional (ASO)", quem: "CLINICA" }),
  Object.freeze({ id: "CONTRATO", nome: "Contrato aceito", quem: "COLABORADOR" }),
]);

const preenchido = (v) => v != null && String(v).trim() !== "";

/** PIS/PASEP/NIT: 11 dígitos com dígito verificador (pesos 3,2,9,8,7,6,5,4,3,2). */
export function validarPIS(valor) {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const soma = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2].reduce((s, p, i) => s + p * Number(d[i]), 0);
  const resto = 11 - (soma % 11);
  return (resto >= 10 ? 0 : resto) === Number(d[10]);
}

/**
 * Situação de cada etapa e da admissão.
 * @param dados { pessoa, vinculo, admissao: { contrato?, status }, exame: { status, resultado, agendadoPara } | null }
 * @returns { etapas: [{ id, nome, quem, ok, pendencia }], status, podeConcluir, bloqueios }
 */
export function situacaoDaAdmissao({ pessoa = {}, admissao = {}, exame = null }) {
  const p = pessoa ?? {};
  const e = p.endereco ?? {};
  const pend = {
    DADOS_PESSOAIS: [
      !preenchido(p.nome) && "nome", !(p.cpf && validarCPF(p.cpf).valido) && "CPF", !preenchido(p.nascimento) && "data de nascimento", !preenchido(p.nomeMae) && "nome da mãe",
    ],
    ENDERECO: [!preenchido(e.cep) && "CEP", !preenchido(e.logradouro) && "logradouro", !preenchido(e.numero) && "número", !preenchido(e.municipio) && "município", !preenchido(e.uf) && "UF"],
    DOCUMENTOS: [!preenchido(p.rg) && "RG ou CNH", !(p.pis && validarPIS(p.pis)) && "PIS/NIS válido"],
    PAGAMENTO: [!(p.banco?.pix || (p.banco?.banco && p.banco?.agencia && p.banco?.conta)) && "conta bancária ou chave PIX"],
    ASO: [
      !exame && "exame não agendado",
      exame && exame.status !== "REALIZADO" && (exame.agendadoPara ? `exame agendado para ${formatarDataBR(exame.agendadoPara)}` : "exame a agendar"),
      exame?.status === "REALIZADO" && exame.resultado !== "APTO" && "ASO inapto: não pode começar",
    ],
    CONTRATO: [!admissao?.contrato?.aceitoEm && "contrato ainda não aceito"],
  };
  const etapas = ETAPAS_ADMISSAO.map((x) => {
    const faltas = pend[x.id].filter(Boolean);
    const unica = x.id === "ASO" || x.id === "CONTRATO";
    return { ...x, ok: faltas.length === 0, pendencia: faltas.length ? (unica ? faltas[0] : `falta ${faltas.join(", ")}`) : null };
  });
  const ok = (id) => etapas.find((x) => x.id === id).ok;
  const documentos = ["DADOS_PESSOAIS", "ENDERECO", "DOCUMENTOS", "PAGAMENTO"].every(ok);
  const inapto = exame?.status === "REALIZADO" && exame.resultado === "INAPTO";
  let status = STATUS_ADMISSAO.PENDENTE;
  if (admissao?.status === STATUS_ADMISSAO.CONCLUIDA) status = STATUS_ADMISSAO.CONCLUIDA;
  else if (inapto) status = STATUS_ADMISSAO.BLOQUEADA;
  else if (documentos && ok("ASO")) status = STATUS_ADMISSAO.ASO_OK;
  else if (documentos) status = STATUS_ADMISSAO.DOCUMENTOS_OK;
  const bloqueios = etapas.filter((x) => !x.ok).map((x) => ({ campo: x.id, motivo: `${x.nome}: ${x.pendencia}` }));
  return { etapas, status, podeConcluir: status === STATUS_ADMISSAO.ASO_OK && bloqueios.length === 0, bloqueios };
}

const reais = (c) => `R$ ${(c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/**
 * Texto do contrato que o colaborador aceita no portal. Temporário: Lei 6.019/1974 (até 180 dias,
 * prorrogável por até 90); demais: prazo indeterminado, pela CLT.
 */
export function textoDoContrato({ empresa = {}, pessoa = {}, vinculo = {}, tomador = null }) {
  const temporario = vinculo.tipo === "TEMPORARIO";
  return [
    temporario ? "CONTRATO DE TRABALHO TEMPORÁRIO" : "CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO",
    "",
    `EMPREGADORA: ${empresa.razaoSocial ?? ""}, CNPJ ${empresa.cnpj ?? ""}.`,
    `CONTRATADO(A): ${pessoa.nome ?? ""}, CPF ${pessoa.cpf ?? "a informar"}.`,
    "",
    `1. Função: ${vinculo.cargo ?? ""}${vinculo.cbo ? ` (CBO ${vinculo.cbo})` : ""}. Salário mensal: ${reais(vinculo.salario ?? 0)}. Jornada: ${vinculo.jornadaMensal ?? 220} horas mensais, conforme a escala do posto.`,
    `2. Início em ${vinculo.admissao ? formatarDataBR(vinculo.admissao) : ""}.${temporario ? ` Contrato temporário nos termos da Lei 6.019/1974, para atender necessidade transitória do tomador, com término previsto em ${vinculo.temporario?.fimPrevisto ? formatarDataBR(vinculo.temporario.fimPrevisto) : "data a definir"}, limitado a 180 dias, prorrogável por até 90 dias.` : ""}`,
    tomador ? `3. Local de trabalho: estabelecimento do tomador ${tomador.razaoSocial ?? ""}, CNPJ ${tomador.cnpj ?? ""}, ${tomador.municipio ?? ""}/${tomador.uf ?? ""}.` : "3. Local de trabalho: estabelecimento da empregadora.",
    `4. Aplica-se a convenção coletiva do sindicato ${vinculo.sindicato?.nome ?? "da categoria"}${vinculo.sindicato?.cnpj ? ` (CNPJ ${vinculo.sindicato.cnpj})` : ""}.`,
    "5. O(A) contratado(a) declara que as informações prestadas são verdadeiras e que recebeu as normas internas e de segurança do trabalho.",
    "6. Este contrato é aceito eletronicamente no portal do colaborador; o aceite registra a data, a hora e o código do texto aceito.",
  ].join("\n");
}
