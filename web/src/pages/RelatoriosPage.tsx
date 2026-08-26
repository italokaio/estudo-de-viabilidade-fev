import { useEffect, useState } from "react";
import {
  baixarRelatorioComparativo,
  baixarRelatorioViabilidade,
  fetchEmpreendimentoDetalhe,
  fetchEmpreendimentos,
  type EmpreendimentoDetalhe,
  type EmpreendimentoResumo,
  type FormatoRelatorio,
} from "../api/client.js";
import { Button } from "../components/Button.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

const inputSelectStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-primary)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
};

type TipoRelatorio = "viabilidade" | "comparativo";

/**
 * Fase 2.5 — módulo de Relatórios: seleção de empreendimento/cenário(s)/
 * tipo/formato e download do PDF/Excel. Todo o conteúdo do arquivo vem do
 * backend (src/relatorios) -- esta tela não monta nem calcula nada, só
 * dispara a requisição e o download (docs/DECISOES.md, achado F34).
 */
export function RelatoriosPage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [empreendimentoId, setEmpreendimentoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<EmpreendimentoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoRelatorio>("viabilidade");
  const [cenarioId, setCenarioId] = useState<string>("");
  const [cenariosSelecionados, setCenariosSelecionados] = useState<Set<string>>(new Set());
  const [formato, setFormato] = useState<FormatoRelatorio>("pdf");
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    fetchEmpreendimentos()
      .then((emps) => {
        setEmpreendimentos(emps);
        const primeiro = emps[0]?.id ?? null;
        setEmpreendimentoId(primeiro);
        if (!primeiro) setCarregando(false);
      })
      .catch((e) => {
        setErro(String(e.message ?? e));
        setCarregando(false);
      });
  }, []);

  useEffect(() => {
    // Trocar de empreendimento nao pode deixar cenario do anterior
    // selecionado (mesmo cuidado ja aplicado em Vendas/Custos/Cronograma/
    // Cenarios, achado F30).
    setDetalhe(null);
    setCenarioId("");
    setCenariosSelecionados(new Set());
    if (!empreendimentoId) return;
    setCarregando(true);
    fetchEmpreendimentoDetalhe(empreendimentoId)
      .then((d) => {
        setDetalhe(d);
        setCenarioId(d.cenarios[0]?.id ?? "");
        setErro(null);
      })
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCarregando(false));
  }, [empreendimentoId]);

  function alternarSelecao(id: string) {
    setCenariosSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function gerar() {
    setErro(null);
    setGerando(true);
    try {
      if (tipo === "viabilidade") {
        if (!cenarioId) return;
        await baixarRelatorioViabilidade(cenarioId, formato);
      } else {
        if (!empreendimentoId || cenariosSelecionados.size === 0) return;
        await baixarRelatorioComparativo(empreendimentoId, [...cenariosSelecionados], formato);
      }
    } catch (e: any) {
      setErro(String(e.message ?? e));
    } finally {
      setGerando(false);
    }
  }

  const podeGerar = tipo === "viabilidade" ? Boolean(cenarioId) : cenariosSelecionados.size > 0;

  return (
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>{detalhe ? detalhe.nome : "Carregando…"}</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Relatórios</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {empreendimentos.length > 0 && (
            <select value={empreendimentoId ?? ""} onChange={(e) => setEmpreendimentoId(e.target.value)} style={{ ...inputSelectStyle, fontWeight: 600 }}>
              {empreendimentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          )}
          <ThemeToggle />
        </div>
      </div>

      {erro && (
        <div style={{ background: "var(--status-critical-soft-bg)", border: "1px solid var(--status-critical)", borderRadius: 10, padding: "12px 16px", color: "var(--status-critical-text)", fontSize: 13 }}>
          {erro}
        </div>
      )}

      {carregando && !detalhe && !erro && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>Carregando…</div>}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px 24px", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 8 }}>Tipo de relatório</div>
          <div style={{ display: "flex", gap: 10 }}>
            <OpcaoTipo rotulo="Viabilidade" descricao="Um cenário — capa, premissas, produto, vendas, recebimentos, custos, cronograma, fluxo de caixa e necessidade de capital." selecionado={tipo === "viabilidade"} onClick={() => setTipo("viabilidade")} />
            <OpcaoTipo rotulo="Comparativo de Cenários" descricao="Vários cenários do mesmo empreendimento — indicadores, premissas, fluxo de caixa e necessidade de capital lado a lado." selecionado={tipo === "comparativo"} onClick={() => setTipo("comparativo")} />
          </div>
        </div>

        {detalhe && tipo === "viabilidade" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Cenário</span>
            <select value={cenarioId} onChange={(e) => setCenarioId(e.target.value)} style={inputSelectStyle}>
              {detalhe.cenarios.length === 0 && <option value="">Nenhum cenário cadastrado</option>}
              {detalhe.cenarios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.tipo})
                </option>
              ))}
            </select>
          </label>
        )}

        {detalhe && tipo === "comparativo" && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)", display: "block", marginBottom: 8 }}>
              Cenários a comparar
            </span>
            {detalhe.cenarios.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum cenário cadastrado.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {detalhe.cenarios.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-primary)" }}>
                    <input type="checkbox" checked={cenariosSelecionados.has(c.id)} onChange={() => alternarSelecao(c.id)} style={{ width: 15, height: 15 }} />
                    {c.nome} ({c.tipo})
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 8 }}>Formato</div>
          <div style={{ display: "flex", gap: 10 }}>
            <OpcaoTipo rotulo="PDF" descricao="Documento para apresentação, reunião ou impressão." selecionado={formato === "pdf"} onClick={() => setFormato("pdf")} />
            <OpcaoTipo rotulo="Excel" descricao="Planilha auditável, com abas por seção." selecionado={formato === "xlsx"} onClick={() => setFormato("xlsx")} />
          </div>
        </div>

        <Button onClick={gerar} disabled={!podeGerar || gerando} style={{ alignSelf: "flex-start" }}>
          {gerando ? "Gerando…" : "Gerar relatório"}
        </Button>
      </div>
    </div>
  );
}

function OpcaoTipo({ rotulo, descricao, selecionado, onClick }: { rotulo: string; descricao: string; selecionado: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: "left",
        border: selecionado ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: selecionado ? "var(--accent-soft-bg)" : "var(--surface)",
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: selecionado ? "var(--accent-text)" : "var(--ink-primary)" }}>{rotulo}</span>
      <span style={{ fontSize: 11, color: "var(--ink-muted)", lineHeight: 1.4 }}>{descricao}</span>
    </button>
  );
}
