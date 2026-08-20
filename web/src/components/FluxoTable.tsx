import type { PontoFluxo } from "../api/client.js";
import { formatBRL } from "../format.js";

export function FluxoTable({ dados }: { dados: PontoFluxo[] }) {
  return (
    <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Mês", "Entradas", "Recebido", "Saídas", "Pago", "Acumulado"].map((h, i) => (
              <th
                key={h}
                style={{
                  position: "sticky",
                  top: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: "var(--ink-muted)",
                  background: "var(--surface-2)",
                  padding: "8px 12px",
                  textAlign: i === 0 ? "left" : "right",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.map((d) => {
            const acumulado = parseFloat(d.fluxoAcumulado);
            return (
              <tr key={d.mes} className="fluxo-row">
                <td style={cellStyle("left")}>{d.mes}</td>
                <td style={cellStyle("right")}>{formatBRL(d.entradas)}</td>
                <td style={{ ...cellStyle("right"), color: "var(--status-good-text)" }}>
                  {d.entradasRealizadas !== null ? formatBRL(d.entradasRealizadas) : <span style={{ color: "var(--ink-muted)" }}>—</span>}
                </td>
                <td style={cellStyle("right")}>{formatBRL(d.saidas)}</td>
                <td style={{ ...cellStyle("right"), color: "var(--status-critical-text)" }}>
                  {d.saidasRealizadas !== null ? formatBRL(d.saidasRealizadas) : <span style={{ color: "var(--ink-muted)" }}>—</span>}
                </td>
                <td style={{ ...cellStyle("right"), color: acumulado < 0 ? "var(--status-critical-text)" : "var(--status-good-text)", fontWeight: 600 }}>
                  {formatBRL(d.fluxoAcumulado)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function cellStyle(align: "left" | "right"): React.CSSProperties {
  return {
    fontFamily: "JetBrains Mono",
    fontSize: 12,
    color: "var(--ink-primary)",
    padding: "8px 12px",
    textAlign: align,
    borderTop: "1px solid var(--border-subtle)",
  };
}
