import type { EmpreendimentoResumo } from "../api/client.js";

export function CenarioSwitcher({
  empreendimentos,
  cenarioId,
  onChange,
}: {
  empreendimentos: EmpreendimentoResumo[];
  cenarioId: string | null;
  onChange: (cenarioId: string) => void;
}) {
  return (
    <select
      value={cenarioId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: "Manrope",
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--ink-primary)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "7px 10px",
      }}
    >
      {empreendimentos.map((emp) =>
        emp.cenarios.map((c) => (
          <option key={c.id} value={c.id}>
            {emp.nome} · {c.nome}
          </option>
        )),
      )}
    </select>
  );
}
