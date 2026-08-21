import type { PontoFinanciamentoFluxo } from "../api/client.js";
import { formatBRL } from "../format.js";

/** Mostra a série de liberação/amortização/saldo devedor de um financiamento — não renderiza nada quando o cenário não tem financiamento cadastrado. */
export function FinanciamentoFluxoPanel({ financiamento }: { financiamento: PontoFinanciamentoFluxo[] }) {
  const relevante = financiamento.filter((f) => Number(f.liberacao) !== 0 || Number(f.amortizacao) !== 0 || Number(f.saldoDevedor) !== 0);
  if (relevante.length === 0) return null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 4 }}>Financiamento de produção</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 14 }}>
        Liberações seguem a curva do cronograma físico; a amortização segue a tabela configurada (pagamento único, SAC ou Price).
      </div>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
            <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em" }}>Mês</th>
            <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>Liberação</th>
            <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>Amortização</th>
            <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>Saldo devedor</th>
          </tr>
        </thead>
        <tbody style={{ font: "var(--text-mono-body)" }}>
          {relevante.map((f) => (
            <tr key={f.mes}>
              <td style={{ padding: "5px 6px", color: "var(--ink-primary)" }}>{f.mes}</td>
              <td style={{ padding: "5px 6px", textAlign: "right", color: "var(--status-good-text)" }}>
                {Number(f.liberacao) !== 0 ? formatBRL(f.liberacao) : "—"}
              </td>
              <td style={{ padding: "5px 6px", textAlign: "right", color: "var(--status-critical-text)" }}>
                {Number(f.amortizacao) !== 0 ? formatBRL(f.amortizacao) : "—"}
              </td>
              <td style={{ padding: "5px 6px", textAlign: "right", color: "var(--ink-primary)" }}>{formatBRL(f.saldoDevedor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
