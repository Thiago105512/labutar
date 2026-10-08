/**
 * Ponto do demo: um AFD fictício (Portaria MTP 671/2021) de setembro/2026 com as marcações de
 * quem tem CPF, com casos para tratar: horas extras (e banco de horas para quem aderiu), falta,
 * atraso, intervalo curto e uma marcação ímpar. Tudo é importado pelo mesmo caminho da tela.
 */
import { linhaMarcacao671, previstoNoDia } from "../../../packages/ponto/src/index.js";
import { feriadosDoAno } from "../../../packages/folha/src/index.js";
import { importarAFD } from "../rotas-ponto.js";

const COMPETENCIA = "2026-09";
const pad = (n) => String(n).padStart(2, "0");
const hora = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Marcações de uma pessoa no mês (índice `i` decide os casos, sem aleatoriedade). */
function marcacoesDemo(i, { admissao, desligamento }) {
  const feriados = new Set(feriadosDoAno(2026, { uf: "AM", municipio: "Manaus" }).map((f) => f.data));
  const saida = [];
  for (let d = 1; d <= 30; d++) {
    const data = `${COMPETENCIA}-${pad(d)}`;
    if (data < admissao || (desligamento && data > desligamento)) continue;
    const semana = new Date(`${data}T12:00:00Z`).getUTCDay();
    if (previstoNoDia("44H_SEG_SEX", data, { feriados }) === 0) {
      // Sábado de trabalho para alguns: extra.
      if (semana === 6 && i % 6 === 0 && d < 20) saida.push([data, ["08:00", "12:00"]]);
      continue;
    }
    if (i % 4 === 1 && d === 15) continue; // falta
    let entrada = 7 * 60 + 55 + ((i + d) % 5);
    let volta = 13 * 60;
    let fim = 17 * 60 + 48 + ((i * d) % 4);
    if (i % 5 === 2 && d === 10) entrada = 8 * 60 + 40; // atraso
    if (i % 7 === 3 && d === 8) volta = 12 * 60 + 30; // intervalo curto
    if (i % 3 === 0 && (semana === 2 || semana === 4)) fim += 120; // extras
    if (i % 6 === 0 && (semana === 1 || semana === 3 || semana === 5)) fim += 180;
    const horas = [hora(entrada), "12:00", hora(volta), hora(fim)];
    if (i === 0 && d === 22) horas.pop(); // marcação ímpar: esqueceu a saída
    saida.push([data, horas]);
  }
  return saida;
}

export async function semearPonto(repo, tenantId) {
  const { itens: vinculos } = await repo.listar(tenantId, "vinculos", {}, { limite: 10_000 });
  const linhas = [];
  let nsr = 1;
  let i = 0;
  for (const v of vinculos.sort((a, b) => a.matricula.localeCompare(b.matricula))) {
    const pessoa = await repo.obter(tenantId, "pessoas", v.pessoaId);
    if (!pessoa?.cpf || !v.tomadorId) continue;
    // Banco de horas da CCT só com adesão escrita: metade dos alocados aderiu no demo.
    if (i % 2 === 0) await repo.atualizar(tenantId, "vinculos", v.id, { bancoHorasAdesao: true });
    for (const [data, horas] of marcacoesDemo(i, v)) {
      for (const h of horas) linhas.push(linhaMarcacao671({ nsr: nsr++, data, hora: h, cpf: pessoa.cpf }));
    }
    i += 1;
  }
  if (!linhas.length) return null;
  return importarAFD(repo, tenantId, linhas.join("\r\n"), { nome: "AFD de demonstração — setembro/2026" });
}
