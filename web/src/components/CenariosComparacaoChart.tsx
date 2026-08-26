import { useMemo, useRef, useState } from "react";

/** Paleta fixa por índice de cenário -- não depende de tema (funciona em claro/escuro), só precisa ser distinguível entre até ~6 séries simultâneas. */
const PALETA = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

export interface SerieComparacao {
  nome: string;
  cor: string;
  pontos: { mes: number; valor: number }[];
}

export function corDoIndice(i: number): string {
  return PALETA[i % PALETA.length]!;
}

/**
 * Gráfico de linha multi-série (Fase 2.4): uma linha por cenário, mesmo mês
 * no eixo X, para comparar recebimentos/desembolsos/fluxo líquido/saldo
 * acumulado lado a lado (seção 8 do briefing — "onde os cenários se
 * separam"). Mesma convenção manual de SVG já usada em `FluxoChart.tsx`/
 * `CronogramaChart.tsx`; nenhuma biblioteca de gráficos no projeto.
 * Cenários com horizontes diferentes simplesmente têm linhas de
 * comprimentos diferentes -- nenhum valor é inventado além do horizonte de
 * cada um.
 */
export function CenariosComparacaoChart({ titulo, series, formatAxis, formatTooltip }: { titulo: string; series: SerieComparacao[]; formatAxis: (v: number) => string; formatTooltip: (v: number) => string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverMes, setHoverMes] = useState<number | null>(null);

  const W = 640;
  const H = 260;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const mesesTodos = useMemo(() => [...new Set(series.flatMap((s) => s.pontos.map((p) => p.mes)))].sort((a, b) => a - b), [series]);
  const n = mesesTodos.length;

  const { vMin, vMax } = useMemo(() => {
    const valores = series.flatMap((s) => s.pontos.map((p) => p.valor));
    let max = Math.max(...valores, 0);
    let min = Math.min(...valores, 0);
    const pad = (max - min) * 0.1 || 1;
    return { vMax: max + pad, vMin: min - pad };
  }, [series]);

  const xStep = n > 1 ? plotW / (n - 1) : plotW;
  const yScale = (v: number) => padT + plotH * (1 - (v - vMin) / (vMax - vMin));
  const zeroY = yScale(0);
  const xScale = (mes: number) => {
    const i = mesesTodos.indexOf(mes);
    return n > 1 ? padL + xStep * i : padL + plotW / 2;
  };

  const steps = 4;
  const gridValues = Array.from({ length: steps + 1 }, (_, s) => vMin + ((vMax - vMin) * s) / steps);
  const xEvery = n > 24 ? 4 : n > 12 ? 2 : 1;

  function onMouseMove(ev: React.MouseEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (ev.clientX - rect.left) * scaleX;
    let i = Math.round((mouseX - padL) / xStep);
    i = Math.max(0, Math.min(n - 1, i));
    setHoverMes(mesesTodos[i] ?? null);
  }

  if (n === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--ink-muted)", padding: "20px 0", textAlign: "center" }}>Sem dados para exibir.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 6 }}>{titulo}</div>
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

          {mesesTodos.map((mes, i) => {
            if (mes % xEvery !== 0 && i !== 0 && i !== n - 1) return null;
            return (
              <text key={mes} x={xScale(mes)} y={H - padB + 15} textAnchor="middle" fontSize={9.5} fontFamily="JetBrains Mono" fill="var(--ink-muted)">
                {mes}
              </text>
            );
          })}

          {series.map((s) => {
            const pontosOrdenados = [...s.pontos].sort((a, b) => a.mes - b.mes);
            const linePoints = pontosOrdenados.map((p) => `${xScale(p.mes)},${yScale(p.valor)}`).join(" ");
            return <polyline key={s.nome} points={linePoints} fill="none" stroke={s.cor} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />;
          })}

          {hoverMes !== null && <line x1={xScale(hoverMes)} x2={xScale(hoverMes)} y1={padT} y2={H - padB} stroke="var(--ink-muted)" strokeWidth={1} strokeDasharray="2 3" />}

          <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" style={{ cursor: "crosshair" }} onMouseMove={onMouseMove} onMouseLeave={() => setHoverMes(null)} />
        </svg>

        {hoverMes !== null && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: Math.min(Math.max((xScale(hoverMes) / W) * 100, 16), 74) + "%",
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
            <strong style={{ display: "block", color: "var(--ink-primary)", fontSize: 12.5, marginBottom: 3 }}>Mês {hoverMes}</strong>
            {series.map((s) => {
              const ponto = s.pontos.find((p) => p.mes === hoverMes);
              if (!ponto) return null;
              return (
                <div key={s.nome} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.cor, display: "inline-block" }} />
                    {s.nome}
                  </span>
                  <span style={{ fontFamily: "JetBrains Mono", color: "var(--ink-primary)" }}>{formatTooltip(ponto.valor)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
        {series.map((s) => (
          <div key={s.nome} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--ink-secondary)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.cor, display: "inline-block" }} />
            {s.nome}
          </div>
        ))}
      </div>
    </div>
  );
}
