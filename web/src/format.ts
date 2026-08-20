export function formatBRL(value: string | number, opts: { abbreviate?: boolean } = {}): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (opts.abbreviate) {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(2).replace(".", ",")} mi`;
    if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(0)} mil`;
  }
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}
