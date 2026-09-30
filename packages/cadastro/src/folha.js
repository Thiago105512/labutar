/**
 * Do cadastro para a folha: monta o colaborador que o motor (packages/folha) calcula, na
 * competência — salário vigente, dependentes que contam no mês, adicionais e local do posto.
 */
import { contagemDeDependentes } from "./pessoas.js";
import { salarioNaData } from "./vinculos.js";
import { paraISO } from "../../core/src/datas.js";

export function lotacaoDoVinculo(vinculo) {
  return vinculo.tomadorId ? `TOM:${vinculo.tomadorId}` : `SET:${vinculo.setor ?? "ADM"}`;
}

export function colaboradorDaFolha({ vinculo, pessoa, posto = null, tomador = null, empresa = {} }, competencia) {
  const [ano, mes] = competencia.split("-").map(Number);
  const fimDoMes = paraISO(new Date(Date.UTC(ano, mes, 0)));
  const deps = contagemDeDependentes(pessoa, competencia);
  return {
    cpf: pessoa?.cpf ?? null,
    matricula: vinculo.matricula,
    matriculaAnterior: vinculo.matriculaAnterior ?? null,
    nome: pessoa?.nome ?? vinculo.matricula,
    vinculo: vinculo.tipo,
    cargo: vinculo.cargo ?? posto?.funcao ?? null,
    lotacao: lotacaoDoVinculo(vinculo),
    salario: salarioNaData(vinculo, fimDoMes),
    jornadaMensal: vinculo.jornadaMensal ?? posto?.jornadaMensal ?? 220,
    admissao: vinculo.admissao,
    desligamento: vinculo.desligamento ?? null,
    fimPrevisto: vinculo.temporario?.fimPrevisto ?? vinculo.fimPrevisto ?? null,
    sindicato: vinculo.sindicato ?? null,
    // Importado do sistema anterior só com a quantidade: vale até os dependentes serem cadastrados.
    dependentesIR: pessoa?.dependentes?.length ? deps.dependentesIR : vinculo.dependentesIRImportados ?? 0,
    filhosSalarioFamilia: deps.filhosSalarioFamilia,
    insalubridadeGrau: posto?.insalubridadeGrau ?? vinculo.insalubridadeGrau ?? null,
    periculosidade: posto?.periculosidade ?? vinculo.periculosidade ?? false,
    local: posto?.local ?? (tomador ? { uf: tomador.uf, municipio: tomador.municipio } : empresa.local ?? null),
  };
}
