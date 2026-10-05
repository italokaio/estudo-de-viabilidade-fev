import { PermissoesProvider, nivelDoCenario } from "../permissoes";
import { useEffect, useState } from "react";
import { fetchEmpreendimentos, type EmpreendimentoResumo } from "../api/client.js";
import { CenarioSwitcher } from "../components/CenarioSwitcher.js";
import { ImportarExtratoPanel } from "../components/ImportarExtratoPanel.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

export function ConciliacaoPage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [cenarioId, setCenarioId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchEmpreendimentos()
      .then((emps) => {
        setEmpreendimentos(emps);
        setCenarioId((atual) => atual ?? emps[0]?.cenarios[0]?.id ?? null);
      })
      .catch((e) => setErro(String(e.message ?? e)));
  }, []);

  const selecionado = empreendimentos.flatMap((e) => e.cenarios.map((c) => ({ emp: e.nome, cen: c }))).find((x) => x.cen.id === cenarioId);

  return <PermissoesProvider nivel={nivelDoCenario(empreendimentos, cenarioId)}>(
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }} onClickCapture={() => setErro(null)} onSubmitCapture={() => setErro(null)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>
            {selecionado ? `${selecionado.emp} · ${selecionado.cen.nome}` : "Carregando…"}
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Conciliação</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {empreendimentos.length > 0 && <CenarioSwitcher empreendimentos={empreendimentos} cenarioId={cenarioId} onChange={setCenarioId} />}
          <ThemeToggle />
        </div>
      </div>

      {erro && <div style={{ fontSize: 12.5, color: "var(--status-critical-text)" }}>{erro}</div>}
      {cenarioId && <ImportarExtratoPanel cenarioId={cenarioId} onAtualizado={() => {}} />}
    </div>
  )</PermissoesProvider>;
}
