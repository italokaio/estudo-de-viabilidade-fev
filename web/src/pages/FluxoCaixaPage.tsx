import { useEffect, useState } from "react";
import { fetchEmpreendimentos, fetchFluxoCaixa, type EmpreendimentoResumo, type FluxoCaixaResposta } from "../api/client.js";
import { AlertasPanel } from "../components/AlertasPanel.js";
import { CenarioSwitcher } from "../components/CenarioSwitcher.js";
import { FinanciamentoFluxoPanel } from "../components/FinanciamentoFluxoPanel.js";
import { FluxoChart } from "../components/FluxoChart.js";
import { FluxoTable } from "../components/FluxoTable.js";
import { KpiCard } from "../components/KpiCard.js";
import { RealizadoPanel } from "../components/RealizadoPanel.js";
import { SensibilidadePanel } from "../components/SensibilidadePanel.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { formatBRL } from "../format.js";

export function FluxoCaixaPage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [cenarioId, setCenarioId] = useState<string | null>(null);
  const [dados, setDados] = useState<FluxoCaixaResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetchEmpreendimentos()
      .then((emps) => {
        setEmpreendimentos(emps);
        const primeiro = emps[0]?.cenarios[0]?.id ?? null;
        setCenarioId(primeiro);
        if (!primeiro) setCarregando(false);
      })
      .catch((e) => {
        setErro(String(e.message ?? e));
        setCarregando(false);
      });
  }, []);

  function recarregarFluxo() {
    if (!cenarioId) return;
    fetchFluxoCaixa(cenarioId)
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    if (!cenarioId) return;
    setCarregando(true);
    recarregarFluxo();
  }, [cenarioId]);

  return (
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>
            {dados ? `${dados.empreendimento} · ${dados.cenario}` : "Carregando…"}
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Fluxo de caixa</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {empreendimentos.length > 0 && <CenarioSwitcher empreendimentos={empreendimentos} cenarioId={cenarioId} onChange={setCenarioId} />}
          <ThemeToggle />
        </div>
      </div>

      {erro && (
        <div style={{ background: "var(--status-critical-soft-bg)", border: "1px solid var(--status-critical)", borderRadius: 10, padding: "12px 16px", color: "var(--status-critical-text)", fontSize: 13 }}>
          Não foi possível carregar os dados: {erro}. A API está rodando em <code>npm run dev</code> dentro de <code>api/</code>?
        </div>
      )}

      {carregando && !dados && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>Carregando…</div>}

      {dados && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            <KpiCard label="Necessidade máxima" value={formatBRL(dados.indicadores.necessidadeMaximaCapital, { abbreviate: true })} tone="accent" />
            <KpiCard label="Mês do pico" value={dados.indicadores.mesPico?.toString() ?? "—"} />
            <KpiCard label="Recuperação" value={dados.indicadores.mesRecuperacao ? `Mês ${dados.indicadores.mesRecuperacao}` : "—"} tone="good" />
            <KpiCard label="VPL (0,5% a.m.)" value={formatBRL(dados.indicadores.vpl, { abbreviate: true })} />
          </div>

          <AlertasPanel alertas={dados.alertas} />

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, height: 420, flex: "none" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-sm)", minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)" }}>Fluxo mensal — {dados.horizonteProjecaoMeses} meses</div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-muted)", fontWeight: 600 }}>
                  <Legenda cor="var(--accent)" rotulo="Entradas" />
                  <Legenda cor="var(--ink-muted)" rotulo="Saídas" />
                  <Legenda cor="var(--accent-2)" rotulo="Acumulado" linha />
                </div>
              </div>
              <FluxoChart dados={dados.fluxo} mesPico={dados.indicadores.mesPico} mesRecuperacao={dados.indicadores.mesRecuperacao} />
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px 6px", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Detalhe mês a mês</div>
              <FluxoTable dados={dados.fluxo} />
            </div>
          </div>

          {cenarioId && <RealizadoPanel cenarioId={cenarioId} onAtualizado={recarregarFluxo} />}
          <FinanciamentoFluxoPanel financiamento={dados.financiamento} />
          {cenarioId && <SensibilidadePanel cenarioId={cenarioId} />}
        </>
      )}
    </div>
  );
}

function Legenda({ cor, rotulo, linha }: { cor: string; rotulo: string; linha?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ display: "inline-block", width: 8, height: linha ? 2.5 : 8, borderRadius: linha ? 0 : 2, background: cor }} />
      {rotulo}
    </span>
  );
}
