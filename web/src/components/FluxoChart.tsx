import { useMemo, useRef, useState } from "react";
import type { PontoFluxo } from "../api/client.js";
import { formatBRL } from "../format.js";

function formatAxis(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} mi`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} mil`;
  return `${sign}${abs.toFixed(0)}`;
}

export function FluxoChart({
  dados,
  mesPico,
  mesRecuperacao,
}: {
  dados: PontoFluxo[];
  mesPico: number | null;
  mesRecuperacao: number | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 980;
  const H = 300;
  const padL = 60;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const pontos = useMemo(
    () =>
      dados.map((d) => ({
        mes: d.mes,
        entradas: parseFloat(d.entradas),
        saidas: parseFloat(d.saidas),
        fluxoAcumulado: parseFloat(d.fluxoAcumulado),
      })),
    [dados],
  );

  const { vMin, vMax } = useMemo(() => {
    const valores = pontos.flatMap((p) => [p.entradas, -p.saidas, p.fluxoAcumulado]);
    let max = Math.max(...valores, 0);
    let min = Math.min(...valores, 0);
    const pad = (max - min) * 0.08 || 1;
    return { vMax: max + pad, vMin: min - pad };
  }, [pontos]);

  const n = pontos.length;
  const xStep = plotW / n;
  const yScale = (v: number) => padT + plotH * (1 - (v - vMin) / (vMax - vMin));
  const zeroY = yScale(0);
  const xCenter = (i: number) => padL + xStep * (i + 0.5);
  const barW = Math.max(2, xStep * 0.34);

  const steps = 4;
  const gridValues = Array.from({ length: steps + 1 }, (_, s) => vMin + ((vMax - vMin) * s) / steps);
  const xEvery = n > 24 ? 4 : n > 12 ? 2 : 1;

  const linePoints = pontos.map((p, i) => `${xCenter(i)},${yScale(p.fluxoAcumulado)}`).join(" ");

  function onMouseMove(ev: React.MouseEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (ev.clientX - rect.left) * scaleX;
    let i = Math.floor((mouseX - padL) / xStep);
    i = Math.max(0, Math.min(n - 1, i));
    setHoverIndex(i);
  }

  const hovered = hoverIndex !== null ? pontos[hoverIndex] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yScale(v)} y2={yScale(v)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={padL - 8} y={yScale(v) + 3} textAnchor="end" fontSize={10} fontFamily="JetBrains Mono" fill="var(--ink-muted)">
              {formatAxis(v)}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeWidth={1} />

        {pontos.map((p, i) => {
          if (p.mes % xEvery !== 0 && p.mes !== 1 && p.mes !== n) return null;
          return (
            <text key={i} x={xCenter(i)} y={H - padB + 16} textAnchor="middle" fontSize={10} fontFamily="JetBrains Mono" fill="var(--ink-muted)">
              {p.mes}
            </text>
          );
        })}

        {pontos.map((p, i) => {
          const cx = xCenter(i);
          const yE = yScale(p.entradas);
          const yS = yScale(-p.saidas);
          return (
            <g key={i}>
              <rect x={cx - barW - 1} y={yE} width={barW} height={Math.max(0, zeroY - yE)} rx={1} fill="var(--accent)" opacity={hoverIndex === i ? 1 : 0.85} />
              <rect x={cx + 1} y={zeroY} width={barW} height={Math.max(0, yS - zeroY)} rx={1} fill="var(--ink-muted)" opacity={hoverIndex === i ? 0.9 : 0.55} />
            </g>
          );
        })}

        <polyline points={linePoints} fill="none" stroke="var(--accent-2)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {mesPico !== null &&
          (() => {
            const i = pontos.findIndex((p) => p.mes === mesPico);
            if (i < 0) return null;
            return (
              <g>
                <circle cx={xCenter(i)} cy={yScale(pontos[i]!.fluxoAcumulado)} r={4} fill="var(--status-critical)" stroke="var(--surface)" strokeWidth={2} />
                <text x={xCenter(i)} y={yScale(pontos[i]!.fluxoAcumulado) + 18} textAnchor="middle" fontSize={10} fontFamily="JetBrains Mono" fill="var(--ink-secondary)">
                  pico · mês {mesPico}
                </text>
              </g>
            );
          })()}
        {mesRecuperacao !== null &&
          (() => {
            const i = pontos.findIndex((p) => p.mes === mesRecuperacao);
            if (i < 0) return null;
            return (
              <g>
                <circle cx={xCenter(i)} cy={yScale(pontos[i]!.fluxoAcumulado)} r={4} fill="var(--status-good)" stroke="var(--surface)" strokeWidth={2} />
                <text x={xCenter(i)} y={yScale(pontos[i]!.fluxoAcumulado) - 10} textAnchor="middle" fontSize={10} fontFamily="JetBrains Mono" fill="var(--ink-secondary)">
                  recuperação · mês {mesRecuperacao}
                </text>
              </g>
            );
          })()}

        {hoverIndex !== null && <line x1={xCenter(hoverIndex)} x2={xCenter(hoverIndex)} y1={padT} y2={H - padB} stroke="var(--ink-muted)" strokeWidth={1} strokeDasharray="2 3" />}

        <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" style={{ cursor: "crosshair" }} onMouseMove={onMouseMove} onMouseLeave={() => setHoverIndex(null)} />
      </svg>

      {hovered && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: Math.min(Math.max((xCenter(hoverIndex!) / W) * 100, 14), 78) + "%",
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
          <strong style={{ display: "block", color: "var(--ink-primary)", fontSize: 13, marginBottom: 4 }}>Mês {hovered.mes}</strong>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span>Entradas</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{formatBRL(hovered.entradas)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span>Saídas</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{formatBRL(hovered.saidas)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span>Acumulado</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{formatBRL(hovered.fluxoAcumulado)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
