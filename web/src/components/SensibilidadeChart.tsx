import { useMemo, useState } from "react";
import type { EixoSensibilidade, PontoSensibilidade } from "../api/client.js";
import { formatBRL } from "../format.js";

function formatAxis(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} mi`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} mil`;
  return `${sign}${abs.toFixed(0)}`;
}

function formatarVariacao(eixo: EixoSensibilidade, variacao: string): string {
  if (eixo === "velocidadeVendas") {
    const meses = Number(variacao);
    return meses === 0 ? "sem atraso" : `+${meses}m`;
  }
  const pct = Number(variacao) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

/**
 * Gráfico de sensibilidade: uma linha do VPL em função da variação do eixo
 * escolhido — mesmo padrão visual de FluxoChart (SVG puro, sem biblioteca
 * de gráficos), mas com eixo X categórico (poucos pontos discretos, não
 * meses contínuos). Só o VPL é plotado — necessidade máxima e mês do pico
 * têm escalas e sinais muito diferentes do VPL para compartilhar o mesmo
 * eixo sem distorcer a leitura (nunca dois eixos Y, ver a tabela ao lado
 * para os outros indicadores).
 */
export function SensibilidadeChart({ pontos, eixo }: { pontos: PontoSensibilidade[]; eixo: EixoSensibilidade }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 480;
  const H = 220;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const valores = useMemo(() => pontos.map((p) => Number(p.vpl)), [pontos]);
  const { vMin, vMax } = useMemo(() => {
    let max = Math.max(...valores, 0);
    let min = Math.min(...valores, 0);
    const pad = (max - min) * 0.12 || 1;
    return { vMax: max + pad, vMin: min - pad };
  }, [valores]);

  const n = pontos.length;
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const yScale = (v: number) => padT + plotH * (1 - (v - vMin) / (vMax - vMin));
  const zeroY = yScale(0);
  const xAt = (i: number) => padL + xStep * i;

  const steps = 3;
  const gridValues = Array.from({ length: steps + 1 }, (_, s) => vMin + ((vMax - vMin) * s) / steps);

  const linePoints = pontos.map((p, i) => `${xAt(i)},${yScale(Number(p.vpl))}`).join(" ");
  const hovered = hoverIndex !== null ? pontos[hoverIndex] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yScale(v)} y2={yScale(v)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={padL - 8} y={yScale(v) + 3} textAnchor="end" fontSize={10} fontFamily="JetBrains Mono" fill="var(--ink-muted)">
              {formatAxis(v)}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeWidth={1} />

        {pontos.map((p, i) => (
          <text key={i} x={xAt(i)} y={H - padB + 16} textAnchor="middle" fontSize={10} fontFamily="JetBrains Mono" fill="var(--ink-muted)">
            {formatarVariacao(eixo, p.variacao)}
          </text>
        ))}

        <polyline points={linePoints} fill="none" stroke="var(--accent-2)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {pontos.map((p, i) => {
          const baseline = Number(p.variacao) === 0;
          return (
            <circle
              key={i}
              cx={xAt(i)}
              cy={yScale(Number(p.vpl))}
              r={hoverIndex === i ? 6 : baseline ? 5 : 4}
              fill={baseline ? "var(--accent)" : "var(--accent-2)"}
              stroke="var(--surface)"
              strokeWidth={2}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>

      {hovered && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: Math.min(Math.max((xAt(hoverIndex!) / W) * 100, 16), 76) + "%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            padding: "10px 13px",
            fontSize: 12,
            color: "var(--ink-secondary)",
            boxShadow: "var(--shadow-md)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <strong style={{ display: "block", color: "var(--ink-primary)", fontSize: 13, marginBottom: 4 }}>
            {formatarVariacao(eixo, hovered.variacao)}
            {Number(hovered.variacao) === 0 ? " (atual)" : ""}
          </strong>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span>VPL</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{formatBRL(hovered.vpl)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span>Necessidade máxima</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{formatBRL(hovered.necessidadeMaximaCapital)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span>Mês do pico</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{hovered.mesPico ?? "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
