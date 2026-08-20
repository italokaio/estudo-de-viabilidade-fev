export function KpiCard({ label, value, tone }: { label: string; value: string; tone?: "accent" | "good" }) {
  const color = tone === "accent" ? "var(--accent-text)" : tone === "good" ? "var(--status-good-text)" : "var(--ink-primary)";
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 18px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </div>
      <div style={{ font: "var(--text-mono-lg)", fontSize: 19, color, marginTop: 5 }}>{value}</div>
    </div>
  );
}
