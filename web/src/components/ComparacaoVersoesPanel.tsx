import { useEffect, useState } from "react";
import { fetchComparacaoCenarios, type VersaoComparada } from "../api/client.js";
import { formatBRL } from "../format.js";

const ROTULO_RELACAO: Record<VersaoComparada["relacao"], string> = {
  atual: "Atual",
  original: "Original",
  derivado: "Derivado",
};

/**
 * Comparação de cenários derivados (achado F18, docs/DECISOES.md — "versão
 * de cenário" ganha comparação real): mostra os indicadores do cenário
 * atual lado a lado com o cenário do qual ele deriva (se houver) e seus
 * derivados diretos. Não renderiza nada quando o cenário não tem nenhuma
 * relação de derivação — mesmo padrão de FinanciamentoFluxoPanel.
 */
export function ComparacaoVersoesPanel({ cenarioId }: { cenarioId: string }) {
  const [versoes, setVersoes] = useState<VersaoComparada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    fetchComparacaoCenarios(cenarioId)
      .then((d) => {
        setVersoes(d.versoes);
        setErro(null);
      })
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCarregando(false));
  }, [cenarioId]);

  if (!carregando && !erro && versoes.length <= 1) return null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 4 }}>Comparar versões</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 14 }}>
        Indicadores do cenário atual lado a lado com o cenário original (se este for derivado) e seus derivados diretos.
      </div>

      {erro && <div style={{ fontSize: 12, color: "var(--status-critical-text)", marginBottom: 10 }}>{erro}</div>}

      {carregando ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Calculando…</div>
      ) : (
        <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
              <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em" }}>Versão</th>
              <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>VPL</th>
              <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>Necessidade máxima</th>
              <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>Mês do pico</th>
              <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "right" }}>Recuperação</th>
            </tr>
          </thead>
          <tbody style={{ font: "var(--text-mono-body)" }}>
            {versoes.map((v) => {
              const atual = v.relacao === "atual";
              return (
                <tr key={v.id} style={{ background: atual ? "var(--accent-soft-bg)" : "transparent" }}>
                  <td style={{ padding: "5px 6px", fontWeight: atual ? 700 : 400, color: atual ? "var(--accent-text)" : "var(--ink-primary)" }}>
                    {v.nome} <span style={{ fontSize: 10.5, color: "var(--ink-muted)", fontWeight: 600, textTransform: "uppercase" }}>· {ROTULO_RELACAO[v.relacao]}</span>
                  </td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: Number(v.vpl) < 0 ? "var(--status-critical-text)" : "var(--ink-primary)" }}>{formatBRL(v.vpl)}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: "var(--ink-primary)" }}>{formatBRL(v.necessidadeMaximaCapital)}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: "var(--ink-primary)" }}>{v.mesPico ?? "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: v.mesRecuperacao ? "var(--status-good-text)" : "var(--status-critical-text)" }}>
                    {v.mesRecuperacao ? `Mês ${v.mesRecuperacao}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
