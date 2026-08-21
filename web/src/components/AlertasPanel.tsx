import type { Alerta } from "../api/client.js";

/** Mostra os alertas de risco do cenário — não renderiza nada quando não há nenhum. */
export function AlertasPanel({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {alertas.map((a, i) => {
        const critico = a.severidade === "critico";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: critico ? "var(--status-critical-soft-bg)" : "var(--status-warning-soft-bg)",
              border: `1px solid ${critico ? "var(--status-critical)" : "var(--status-warning)"}`,
            }}
          >
            <span style={{ fontSize: 15, lineHeight: "18px" }}>{critico ? "⛔" : "⚠️"}</span>
            <span style={{ fontSize: 13, color: critico ? "var(--status-critical-text)" : "var(--status-warning-text)", lineHeight: 1.4 }}>{a.mensagem}</span>
          </div>
        );
      })}
    </div>
  );
}
