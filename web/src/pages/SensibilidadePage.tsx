import { useEffect, useState } from "react";
import { fetchEmpreendimentos, fetchSensibilidade, type EixoSensibilidade, type EmpreendimentoResumo, type PontoSensibilidade } from "../api/client.js";
import { CenarioSwitcher } from "../components/CenarioSwitcher.js";
import { SensibilidadeChart } from "../components/SensibilidadeChart.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { formatBRL } from "../format.js";

const EIXOS: { valor: EixoSensibilidade; rotulo: string; unidade: "percentual" | "meses"; padrao: string }[] = [
  { valor: "custo", rotulo: "Custo total", unidade: "percentual", padrao: "-10, -5, 0, 5, 10" },
  { valor: "vgv", rotulo: "Preço de venda (VGV)", unidade: "percentual", padrao: "-10, -5, 0, 5, 10" },
  { valor: "velocidadeVendas", rotulo: "Velocidade de vendas (atraso)", unidade: "meses", padrao: "0, 1, 2, 3, 6" },
];

function interpretarVariacoes(texto: string, unidade: "percentual" | "meses"): { valores?: string[]; erro?: string } {
  const partes = texto.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (partes.length === 0) return { erro: "Informe ao menos uma variação." };
  const valores: string[] = [];
  for (const p of partes) {
    const n = Number(p.replace("%", "").replace(",", "."));
    if (!Number.isFinite(n)) return { erro: `"${p}" não é um número.` };
    if (unidade === "meses") {
      if (!Number.isInteger(n) || n < 0) return { erro: `"${p}": o atraso deve ser um número inteiro de meses, zero ou mais.` };
      valores.push(String(n));
    } else {
      if (n <= -100) return { erro: `"${p}": a variação não pode ser -100% ou menos.` };
      valores.push(String(n / 100));
    }
  }
  return { valores };
}

function rotuloVariacao(eixo: EixoSensibilidade, variacao: string): string {
  if (eixo === "velocidadeVendas") {
    const meses = Number(variacao);
    return meses === 0 ? "sem atraso" : `+${meses} ${meses === 1 ? "mês" : "meses"}`;
  }
  const pct = Number(variacao) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

export function SensibilidadePage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [cenarioId, setCenarioId] = useState<string | null>(null);
  const [eixo, setEixo] = useState<EixoSensibilidade>("custo");
  const [textoVariacoes, setTextoVariacoes] = useState(EIXOS[0].padrao);
  const [pontos, setPontos] = useState<PontoSensibilidade[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rodada, setRodada] = useState(0);

  const configEixo = EIXOS.find((e) => e.valor === eixo)!;

  useEffect(() => {
    fetchEmpreendimentos()
      .then((emps) => {
        setEmpreendimentos(emps);
        setCenarioId((atual) => atual ?? emps[0]?.cenarios[0]?.id ?? null);
      })
      .catch((e) => setErro(String(e.message ?? e)));
  }, []);

  function trocarEixo(novo: EixoSensibilidade) {
    setEixo(novo);
    setTextoVariacoes(EIXOS.find((e) => e.valor === novo)!.padrao);
    setRodada((r) => r + 1);
  }

  useEffect(() => {
    if (!cenarioId) return;
    const interpretado = interpretarVariacoes(textoVariacoes, configEixo.unidade);
    if (interpretado.erro) {
      setErro(interpretado.erro);
      return;
    }
    setCalculando(true);
    setErro(null);
    fetchSensibilidade(cenarioId, eixo, interpretado.valores)
      .then((p) => setPontos(p))
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCalculando(false));
    // rodada muda quando o usuario pede um novo calculo ou troca de eixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenarioId, rodada]);

  const selecionado = empreendimentos.flatMap((e) => e.cenarios.map((c) => ({ emp: e.nome, cen: c }))).find((x) => x.cen.id === cenarioId);

  return (
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>
            {selecionado ? `${selecionado.emp} · ${selecionado.cen.nome}` : "Carregando…"}
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Sensibilidade</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {empreendimentos.length > 0 && <CenarioSwitcher empreendimentos={empreendimentos} cenarioId={cenarioId} onChange={setCenarioId} />}
          <ThemeToggle />
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
          Reexecuta o motor financeiro variando uma premissa por vez. Nada é salvo: é apenas uma simulação do cenário atual.
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 240 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Premissa</span>
            <select
              value={eixo}
              onChange={(e) => trocarEixo(e.target.value as EixoSensibilidade)}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
            >
              {EIXOS.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
              Variações ({configEixo.unidade === "percentual" ? "em % separadas por vírgula" : "em meses de atraso, separados por vírgula"})
            </span>
            <input
              value={textoVariacoes}
              onChange={(e) => setTextoVariacoes(e.target.value)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
            />
          </label>

          <button
            type="button"
            onClick={() => setRodada((r) => r + 1)}
            disabled={!cenarioId || calculando}
            style={{ fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 700, padding: "9px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer" }}
          >
            {calculando ? "Calculando…" : "Calcular"}
          </button>
        </div>

        {erro && <div style={{ fontSize: 12.5, color: "var(--status-critical-text)" }}>{erro}</div>}
      </div>

      {!erro && pontos.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
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
                const base = Number(p.variacao) === 0;
                return (
                  <tr key={p.variacao} style={{ background: base ? "var(--accent-soft-bg)" : "transparent" }}>
                    <td style={{ padding: "5px 6px", fontWeight: base ? 700 : 400, color: base ? "var(--accent-text)" : "var(--ink-primary)" }}>
                      {rotuloVariacao(eixo, p.variacao)}
                      {base ? " (atual)" : ""}
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
