import { useEffect, useState } from "react";
import { fetchSensibilidade, type EixoSensibilidade, type PontoSensibilidade } from "../api/client.js";
import { formatBRL } from "../format.js";
import { SensibilidadeChart } from "./SensibilidadeChart.js";

const EIXOS: { valor: EixoSensibilidade; rotulo: string }[] = [
  { valor: "custo", rotulo: "Custo total" },
  { valor: "vgv", rotulo: "Preço de venda (VGV)" },
  { valor: "velocidadeVendas", rotulo: "Velocidade de vendas (atraso)" },
];

function formatarVariacao(eixo: EixoSensibilidade, variacao: string): string {
  if (eixo === "velocidadeVendas") {
    const meses = Number(variacao);
    return meses === 0 ? "sem atraso" : `+${meses} ${meses === 1 ? "mês" : "meses"}`;
  }
  const pct = Number(variacao) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

export function SensibilidadePanel({ cenarioId }: { cenarioId: string }) {
  const [eixo, setEixo] = useState<EixoSensibilidade>("custo");
  const [pontos, setPontos] = useState<PontoSensibilidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    fetchSensibilidade(cenarioId, eixo)
      .then((p) => {
        setPontos(p);
        setErro(null);
      })
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCarregando(false));
  }, [cenarioId, eixo]);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)" }}>Sensibilidade</div>
        <select
          value={eixo}
          onChange={(e) => setEixo(e.target.value as EixoSensibilidade)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 12.5, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px" }}
        >
          {EIXOS.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 14 }}>
        Reexecuta o motor com a premissa escolhida variando na faixa abaixo — nada é salvo, é só uma análise.
      </div>

      {erro && <div style={{ fontSize: 12, color: "var(--status-critical-text)", marginBottom: 10 }}>{erro}</div>}

      {carregando ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Calculando…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
          <SensibilidadeChart pontos={pontos} eixo={eixo} />

          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em" }}>Variação</th>
                <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>VPL</th>
                <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>Necessidade máxima</th>
                <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>Mês do pico</th>
              </tr>
            </thead>
            <tbody style={{ font: "var(--text-mono-body)" }}>
              {pontos.map((p) => {
                const baseline = Number(p.variacao) === 0;
                return (
                  <tr key={p.variacao} style={{ background: baseline ? "var(--accent-soft-bg)" : "transparent" }}>
                    <td style={{ padding: "5px 6px", fontWeight: baseline ? 700 : 400, color: baseline ? "var(--accent-text)" : "var(--ink-primary)" }}>
                      {formatarVariacao(eixo, p.variacao)}
                      {baseline ? " (atual)" : ""}
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "right", color: Number(p.vpl) < 0 ? "var(--status-critical-text)" : "var(--ink-primary)" }}>{formatBRL(p.vpl)}</td>
                    <td style={{ padding: "5px 6px", textAlign: "right", color: "var(--ink-primary)" }}>{formatBRL(p.necessidadeMaximaCapital)}</td>
                    <td style={{ padding: "5px 6px", textAlign: "right", color: "var(--ink-primary)" }}>{p.mesPico ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
