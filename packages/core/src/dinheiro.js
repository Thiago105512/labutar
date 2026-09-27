/**
 * Dinheiro é representado em centavos (inteiro). Nunca em float:
 * arredondamento de INSS, IRRF e FGTS em centavos evita divergência
 * de R$ 0,01 que reprova a folha no fechamento contábil.
 */
export function paraCentavos(valor) {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.round(valor * 100);
  const texto = String(valor ?? "")
    .replace(/\s|R\$/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const numero = Number(texto);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

export function deCentavos(centavos) {
  return Math.trunc(centavos) / 100;
}

export function arredondar(valor, casas = 0) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

export function somarCentavos(...valores) {
  return valores.reduce((total, v) => total + Math.trunc(v), 0);
}

export function percentualDe(baseCentavos, percentual) {
  return Math.round((baseCentavos * percentual) / 100);
}

export function formatarBRL(centavos) {
  return deCentavos(centavos).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Cálculo por faixas progressivas (INSS, IRRF): cada faixa incide apenas
 * sobre a parcela da base que cabe nela. `faixas` deve vir ordenada por
 * `ate` crescente; a última pode omitir `ate` para significar sem teto.
 */
export function calcularPorFaixas(base, faixas) {
  let restante = base;
  let anterior = 0;
  let acumulado = 0;
  const detalhe = [];

  for (const faixa of faixas) {
    if (restante <= 0) break;
    const teto = faixa.ate ?? Infinity;
    const limite = teto === Infinity ? anterior + restante : Math.min(teto, base);
    const largura = Math.max(0, limite - anterior);
    if (largura === 0) {
      anterior = limite;
      continue;
    }
    const aliquota = faixa.aliquota ?? 0;
    const valor = Math.round((largura * aliquota) / 100);
    acumulado += valor;
    detalhe.push({
      de: anterior,
      ate: teto === Infinity ? null : teto,
      aliquota,
      baseIncidencia: largura,
      valor,
    });
    restante -= largura;
    anterior = limite;
  }

  return { total: acumulado, detalhe };
}

export function aliquotaEfetiva(base, total) {
  if (!base) return 0;
  return arredondar((total / base) * 100, 2);
}
