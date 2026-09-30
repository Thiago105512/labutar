/**
 * Convenções e acordos coletivos na folha: para cada colaborador, o instrumento que vale (pelo
 * sindicato do vínculo e pelos ACTs), o piso da função, os descontos e custos do mês.
 * O cálculo das regras é do pacote packages/convencoes; aqui só se junta com o cadastro.
 */
import {
  instrumentoAplicavel, conferirSalario, beneficiosDoMes, parametrosDaEscala, insalubridadeMinima, contribuicaoPatronal,
} from "../../packages/convencoes/src/index.js";
import { feriadosDoAno } from "../../packages/folha/src/index.js";

const TUDO = { limite: 10_000 };

export async function carregarConvencoes(repo, tenant) {
  return (await repo.listar(tenant, "convencoes", {}, TUDO)).itens;
}

/** Convenções e acordos do sindicato laboral do vínculo. */
export function instrumentosDoSindicato(instrumentos, cnpj) {
  return cnpj ? instrumentos.filter((i) => i.sindicatoLaboral?.cnpj === cnpj) : [];
}

/** Dias de trabalho no mês para o vale-refeição: segunda a sexta sem feriado (12x36: dia sim, dia não). */
function diasDeTrabalho(competencia, { admissao, local, escala }) {
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const feriados = new Set(feriadosDoAno(ano, local ?? {}).map((f) => f.data));
  let dias = 0;
  for (let d = 1; d <= ultimo; d++) {
    const iso = `${competencia}-${String(d).padStart(2, "0")}`;
    if (iso < admissao) continue;
    const semana = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
    if (escala === "12X36") dias += 0.5;
    else if (semana !== 0 && semana !== 6 && !feriados.has(iso)) dias += 1;
  }
  return Math.floor(dias);
}

/**
 * Aplica as convenções aos colaboradores da competência.
 * @returns { colaboradores (com divisor, % de VT e insalubridade mínima), lancamentos (com as verbas
 *   da convenção), custosExtras, conformidade, porColaborador }
 */
export function aplicarConvencoes({ colaboradores, lancamentos, cad, empresa, competencia, instrumentos }) {
  const fimDoMes = `${competencia}-${String(new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
  const vinculoPorMatricula = new Map(cad.vinculos.map((v) => [v.matricula, v]));
  const saida = { colaboradores: [], lancamentos: { ...lancamentos }, custosExtras: {}, conformidade: [], porColaborador: {} };

  for (const c of colaboradores) {
    const v = vinculoPorMatricula.get(c.matricula);
    const posto = v?.postoId ? cad.posto.get(v.postoId) : null;
    const tomador = v?.tomadorId ? cad.tomador.get(v.tomadorId) : null;
    const pessoa = v ? cad.pessoa.get(v.pessoaId) : null;
    // A convenção vem do sindicato do vínculo; o acordo coletivo (se houver) prevalece.
    const { principal } = instrumentoAplicavel(instrumentosDoSindicato(instrumentos, v?.sindicato?.cnpj), {
      data: fimDoMes, empresaCnpj: empresa.cnpj, tomadorCnpj: tomador?.cnpj, postoId: posto?.id, tipoVinculo: c.vinculo,
    });
    if (!principal) { saida.colaboradores.push(c); continue; }

    const funcao = posto?.funcaoConvencao ?? v?.funcaoConvencao ?? c.cargo;
    const escala = posto?.escala ?? v?.escala ?? null;
    const conf = conferirSalario(principal, { funcao, salario: c.salario, jornadaMensal: c.jornadaMensal });
    const esc = parametrosDaEscala(principal, escala);
    const grauMinimo = insalubridadeMinima(principal, { funcao, hospital: Boolean(posto?.hospitalar) });
    const L = lancamentos[c.matricula] ?? {};
    const mes = beneficiosDoMes(principal, {
      competencia, salarioBase: c.salario, admissao: c.admissao, desligamento: c.desligamento,
      diasTrabalhados: diasDeTrabalho(competencia, { admissao: c.admissao, local: c.local ?? empresa.local, escala }),
      faltasDias: L.faltasDias ?? 0, atestadoDias: L.atestadoDias ?? 0, atrasosHoras: L.atrasosHoras ?? 0,
      associado: Boolean(pessoa?.associadoSindicato), oposicaoContribuicao: Boolean(pessoa?.oposicaoContribuicao),
      refeitorio: Boolean(posto?.refeitorio ?? tomador?.refeitorio), emFeriasOuAfastado: Boolean(L.emFeriasOuAfastado),
      descontoVRPercentual: empresa.descontoVRPercentual ?? 0,
    });

    saida.colaboradores.push({
      ...c,
      divisorHora: esc.divisor ?? c.divisorHora,
      percentualVT: esc.descontoVT,
      insalubridadeGrau: Math.max(c.insalubridadeGrau ?? 0, grauMinimo) || null,
    });
    saida.lancamentos[c.matricula] = { ...L, verbasExtras: [...(L.verbasExtras ?? []), ...mes.descontos.map((d) => ({ chave: d.chave, valor: d.valor, referencia: principal.registroMTE }))] };
    saida.custosExtras[c.matricula] = mes.custos;
    const resumo = {
      matricula: c.matricula, nome: c.nome, vinculo: c.vinculo, cargo: c.cargo, lotacao: c.lotacao,
      instrumento: { id: principal.id, tipo: principal.tipo, registroMTE: principal.registroMTE },
      funcao: conf.piso.funcao, enquadrada: conf.piso.enquadrada, piso: conf.piso.minimo, salario: c.salario,
      erros: conf.erros, avisos: [...conf.avisos, ...mes.avisos], beneficios: mes.beneficios, custos: mes.custos, descontos: mes.descontos,
    };
    saida.porColaborador[c.matricula] = resumo;
    if (conf.erros.length || !conf.piso.enquadrada) saida.conformidade.push(resumo);
  }

  // Contribuição negocial patronal: uma por empresa e instrumento, pelo número de colaboradores.
  const porInstrumento = new Map();
  for (const r of Object.values(saida.porColaborador)) porInstrumento.set(r.instrumento.id, (porInstrumento.get(r.instrumento.id) ?? 0) + 1);
  saida.contribuicoesPatronais = [...porInstrumento].map(([id, n]) => {
    const i = instrumentos.find((x) => x.id === id);
    return { instrumento: i.registroMTE, colaboradores: n, valor: contribuicaoPatronal(i, n) };
  });
  return saida;
}
