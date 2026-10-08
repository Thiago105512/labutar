/**
 * Arquivo Fonte de Dados (AFD) do relógio de ponto. Leiaute da Portaria MTP 671/2021 (registros
 * tipo 3 do REP-C e REP-A e tipo 7 do REP-P, com data e hora ISO e o CPF) e o leiaute anterior
 * (tipo 3 com data, hora e PIS), ainda gerado por relógios antigos. Só as marcações e o
 * cabeçalho são lidos aqui; ajustes de relógio e eventos sensíveis ficam no arquivo original.
 */

/** "2026-09-01T08:02:00-0400" → { data: "2026-09-01", hora: "08:02" } (hora local do relógio). */
function dataHora671(texto) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(texto);
  return m ? { data: m[1], hora: `${m[2]}:${m[3]}` } : null;
}

function dataHora1510(data, hora) {
  if (!/^\d{8}$/.test(data) || !/^\d{4}$/.test(hora)) return null;
  return { data: `${data.slice(4, 8)}-${data.slice(2, 4)}-${data.slice(0, 2)}`, hora: `${hora.slice(0, 2)}:${hora.slice(2, 4)}` };
}

/**
 * @returns { formato: "671" | "1510" | null, empregador: { documento, razaoSocial } | null,
 *   marcacoes: [{ nsr, data, hora, cpf?, pis?, registro }], erros: [{ linha, motivo }] }
 */
export function lerAFD(conteudo) {
  const marcacoes = [];
  const erros = [];
  let empregador = null;
  let formato = null;
  String(conteudo ?? "").split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.replace(/\s+$/, "");
    if (!linha) return;
    const tipo = linha[9];
    const nsr = linha.slice(0, 9);
    if (!/^\d{9}$/.test(nsr)) { erros.push({ linha: i + 1, motivo: "linha sem NSR (9 dígitos no início)" }); return; }
    if (tipo === "1") {
      empregador = { documento: linha.slice(11, 25).trim(), razaoSocial: linha.slice(39, 189).trim() || null };
      return;
    }
    if (tipo === "3" && linha.length >= 46 && linha[14] === "-") {
      // Portaria 671: NSR(9) tipo(1) data-hora(24) CPF(12) CRC(4).
      const dh = dataHora671(linha.slice(10, 34));
      const cpf = linha.slice(34, 46).replace(/^0/, "");
      if (!dh || !/^\d{11}$/.test(cpf)) { erros.push({ linha: i + 1, motivo: "marcação com data ou CPF inválido" }); return; }
      formato = "671";
      marcacoes.push({ nsr: Number(nsr), ...dh, cpf, registro: "3" });
      return;
    }
    if (tipo === "7") {
      // REP-P: NSR(9) tipo(1) data-hora(24) CPF(12) data-hora da gravação(24) coletor(2) on-line(1) hash(64).
      const dh = dataHora671(linha.slice(10, 34));
      const cpf = linha.slice(34, 46).replace(/^0/, "");
      if (!dh || !/^\d{11}$/.test(cpf)) { erros.push({ linha: i + 1, motivo: "marcação com data ou CPF inválido" }); return; }
      formato = "671";
      marcacoes.push({ nsr: Number(nsr), ...dh, cpf, registro: "7" });
      return;
    }
    if (tipo === "3") {
      // Leiaute anterior: NSR(9) tipo(1) data DDMMAAAA(8) hora HHMM(4) PIS(12).
      const dh = dataHora1510(linha.slice(10, 18), linha.slice(18, 22));
      const pis = linha.slice(22, 34).replace(/^0/, "");
      if (!dh || !/^\d{11}$/.test(pis)) { erros.push({ linha: i + 1, motivo: "marcação com data ou PIS inválido" }); return; }
      formato ??= "1510";
      marcacoes.push({ nsr: Number(nsr), ...dh, pis, registro: "3" });
    }
    // Tipos 2, 4, 5, 6 e 9 (empresa, ajuste de relógio, empregados, eventos, trailer): não são marcações.
  });
  return { formato, empregador, marcacoes, erros };
}

/** Linha tipo 3 da Portaria 671 (para gerar AFD de teste). `offset` no formato "-0400". */
export function linhaMarcacao671({ nsr, data, hora, cpf, offset = "-0400" }) {
  return `${String(nsr).padStart(9, "0")}3${data}T${hora}:00${offset}${String(cpf).padStart(12, "0")}0000`;
}
