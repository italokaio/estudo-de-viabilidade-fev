import { useMemo, useRef, useState } from "react";
import type { PontoCurvaCronograma } from "../api/client.js";
import { formatBRL } from "../format.js";

function formatAxisMoeda(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} mi`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} mil`;
  return `${sign}${abs.toFixed(0)}`;
}

function formatAxisPercentual(v: number): string {
  return `${v.toFixed(0)}%`;
}

/**
 * Um mini-gráfico de barra (série mensal) + linha (série acumulada) sobre o
 * mesmo eixo de meses -- mesma convenção manual de SVG de FluxoChart.tsx
 * (não existe biblioteca de gráficos no projeto). Reaproveitado duas vezes
 * por CronogramaChart: uma vez para a curva física (%), uma vez para a
 * curva financeira (R$) -- eixos e formatos diferentes, mesmo mecanismo.
 */
function MiniCurvaChart({
  pontos,
  valores,
  acumulados,
  formatAxis,
  formatTooltipMensal,
  formatTooltipAcumulado,
  labelMensal,
  labelAcumulado,
}: {
  pontos: PontoCurvaCronograma[];
  valores: number[];
  acumulados: number[];
  formatAxis: (v: number) => string;
  formatTooltipMensal: (v: number) => string;
  formatTooltipAcumulado: (v: number) => string;
  labelMensal: string;
  labelAcumulado: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const W = 480;
  const H = 260;
  const padL = 52;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const n = pontos.length;
  const vMax = Math.max(...valores, ...acumulados, 0.0001);
  const vMin = Math.min(0, ...valores);
  const pad = (vMax - vMin) * 0.1 || 1;
  const yMax = vMax + pad;
  const yMin = vMin - (vMin < 0 ? pad : 0);

  const xStep = n > 0 ? plotW / n : plotW;
  const yScale = (v: number) => padT + plotH * (1 - (v - yMin) / (yMax - yMin));
  const zeroY = yScale(0);
  const xCenter = (i: number) => padL + xStep * (i + 0.5);
  const barW = Math.max(2, xStep * 0.55);

  const steps = 4;
  const gridValues = Array.from({ length: steps + 1 }, (_, s) => yMin + ((yMax - yMin) * s) / steps);
  const xEvery = n > 24 ? 4 : n > 12 ? 2 : 1;

  const linePoints = useMemo(() => acumulados.map((v, i) => `${xCenter(i)},${yScale(v)}`).join(" "), [acumulados, xStep, yMin, yMax]);

  function onMouseMove(ev: React.MouseEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (ev.clientX - rect.left) * scaleX;
    let i = Math.floor((mouseX - padL) / xStep);
    i = Math.max(0, Math.min(n - 1, i));
    setHoverIndex(i);
  }

  if (n === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--ink-muted)", padding: "40px 0", textAlign: "center" }}>Sem cronograma cadastrado.</div>;
  }

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yScale(v)} y2={yScale(v)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={padL - 8} y={yScale(v) + 3} textAnchor="end" fontSize={9.5} fontFamily="JetBrains Mono" fill="var(--ink-muted)">
              {formatAxis(v)}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeWidth={1} />

        {pontos.map((p, i) => {
          if (p.mes % xEvery !== 0 && p.mes !== pontos[0]!.mes && p.mes !== pontos[n - 1]!.mes) return null;
          return (
            <text key={i} x={xCenter(i)} y={H - padB + 15} textAnchor="middle" fontSize={9.5} fontFamily="JetBrains Mono" fill="var(--ink-muted)">
              {p.mes}
            </text>
          );
        })}

        {valores.map((v, i) => {
          const cx = xCenter(i);
          const y = yScale(v);
          return (
            <rect
              key={i}
              x={cx - barW / 2}
              y={Math.min(y, zeroY)}
              width={barW}
              height={Math.max(0, Math.abs(zeroY - y))}
              rx={1}
              fill="var(--accent)"
              opacity={hoverIndex === i ? 1 : 0.75}
            />
          );
        })}

        <polyline points={linePoints} fill="none" stroke="var(--accent-2)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {hoverIndex !== null && (
          <line x1={xCenter(hoverIndex)} x2={xCenter(hoverIndex)} y1={padT} y2={H - padB} stroke="var(--ink-muted)" strokeWidth={1} strokeDasharray="2 3" />
        )}

        <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" style={{ cursor: "crosshair" }} onMouseMove={onMouseMove} onMouseLeave={() => setHoverIndex(null)} />
      </svg>

      {hoverIndex !== null && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: Math.min(Math.max((xCenter(hoverIndex) / W) * 100, 16), 76) + "%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            padding: "8px 11px",
            fontSize: 11.5,
            color: "var(--ink-secondary)",
            boxShadow: "var(--shadow-md)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <strong style={{ display: "block", color: "var(--ink-primary)", fontSize: 12.5, marginBottom: 3 }}>Mês {pontos[hoverIndex]!.mes}</strong>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{labelMensal}</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{formatTooltipMensal(valores[hoverIndex]!)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{labelAcumulado}</span>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{formatTooltipAcumulado(acumulados[hoverIndex]!)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Fase 2.3 — dois gráficos lado a lado, física (%) e financeira (R$), em
 * vez de um único gráfico com dois eixos: as escalas são muito diferentes
 * (0–100% x valores em milhões) para conviver de forma legível no mesmo
 * plot. Nenhuma conta acontece aqui -- só leitura de PontoCurvaCronograma,
 * já pronto do backend (montarCurvaCronogramaDoCenario).
 */
export function CronogramaChart({ pontos }: { pontos: PontoCurvaCronograma[] }) {
  const percentuaisMensais = pontos.map((p) => parseFloat(p.percentualExecucaoMensal) * 100);
  const percentuaisAcumulados = pontos.map((p) => parseFloat(p.percentualAcumulado) * 100);
  const desembolsosMensais = pontos.map((p) => parseFloat(p.desembolsoMensal));
  const desembolsosAcumulados = pontos.map((p) => parseFloat(p.desembolsoAcumulado));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 8 }}>Curva física — % de execução</div>
        <MiniCurvaChart
          pontos={pontos}
          valores={percentuaisMensais}
          acumulados={percentuaisAcumulados}
          formatAxis={formatAxisPercentual}
          formatTooltipMensal={(v) => `${v.toFixed(1)}%`}
          formatTooltipAcumulado={(v) => `${v.toFixed(1)}%`}
          labelMensal="% mensal"
          labelAcumulado="% acumulado"
        />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 8 }}>Curva financeira — desembolso de obra</div>
        <MiniCurvaChart
          pontos={pontos}
          valores={desembolsosMensais}
          acumulados={desembolsosAcumulados}
          formatAxis={formatAxisMoeda}
          formatTooltipMensal={(v) => formatBRL(v)}
          formatTooltipAcumulado={(v) => formatBRL(v)}
          labelMensal="Desembolso mensal"
          labelAcumulado="Desembolso acumulado"
        />
      </div>
    </div>
  );
}
