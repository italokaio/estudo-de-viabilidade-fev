import { PermissoesProvider, PermitidoEditar, PermitidoExcluir, nivelDoCenario } from "../permissoes";
import { useEffect, useMemo, useState } from "react";
import { useCenarioAtivo } from "../useCenarioAtivo";
import {
  criarCronograma,
  substituirCronograma,
  excluirCronograma,
  fetchCenarioDetalhe,
  fetchCronogramaCurva,
  fetchEmpreendimentos,
  type EmpreendimentoResumo,
  type PontoCurvaCronograma,
} from "../api/client.js";
import { Button } from "../components/Button.js";
import { CenarioSwitcher } from "../components/CenarioSwitcher.js";
import { CronogramaChart } from "../components/CronogramaChart.js";
import { KpiCard } from "../components/KpiCard.js";
import { TextField } from "../components/TextField.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { formatBRL } from "../format.js";

/**
 * Fase 2.3 — visão gerencial de Cronograma. Nenhum cálculo financeiro vive
 * aqui: o percentual acumulado e o desembolso (mensal e acumulado) vêm
 * prontos do backend (/cronograma-curva, montarCurvaCronogramaDoCenario +
 * calcularCurvaCronograma) -- os mesmos números que alimentam o fluxo de
 * caixa (via Custo com tipoIncidencia="pct_execucao"). Cadastro/edição
 * continua a mesma política já decidida (excluir e recriar, regra R6:
 * soma=100%) -- só reaproveitada aqui com layout próprio, ao lado da curva.
 */
export function CronogramaPage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [cenarioId, setCenarioId] = useState<string | null>(null);
  const [pontos, setPontos] = useState<PontoCurvaCronograma[]>([]);
  const [cronogramaBruto, setCronogramaBruto] = useState<{ mes: number; percentualExecucaoMensal: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const empreendimentoId = useMemo(
    () => empreendimentos.find((e) => e.cenarios.some((c) => c.id === cenarioId))?.id ?? null,
    [empreendimentos, cenarioId],
  );
  const cenarioAtual = useMemo(
    () => empreendimentos.flatMap((e) => e.cenarios).find((c) => c.id === cenarioId) ?? null,
    [empreendimentos, cenarioId],
  );

  useEffect(() => {
    fetchEmpreendimentos()
      .then((emps) => {
        setEmpreendimentos(emps);
        const primeiro = emps[0]?.cenarios[0]?.id ?? null;
        setCenarioId((atual) => atual ?? primeiro);
        if (!primeiro) setCarregando(false);
      })
      .catch((e) => {
        setErro(String(e.message ?? e));
        setCarregando(false);
      });
  }, []);

  const ehCenarioAtual = useCenarioAtivo(cenarioId);

  function recarregar() {
    if (!cenarioId) return;
    const alvo = cenarioId;
    setCarregando(true);
    Promise.all([fetchCronogramaCurva(cenarioId), fetchCenarioDetalhe(cenarioId)])
      .then(([curva, det]) => {
        if (!ehCenarioAtual(alvo)) return;
        setPontos(curva.pontos);
        setCronogramaBruto(det.cronograma);
        setErro(null);
      })
      .catch((e) => {
        if (ehCenarioAtual(alvo)) setErro(String(e.message ?? e));
      })
      .finally(() => {
        if (ehCenarioAtual(alvo)) setCarregando(false);
      });
  }

  useEffect(() => {
    // Troca de cenário não pode deixar dado do cenário anterior visível --
    // mesmo cuidado (e mesmo bug corrigido) das telas de Vendas e Custos,
    // achado F30.
    setPontos([]);
    setCronogramaBruto([]);
    recarregar();
  }, [cenarioId]);

  const mesesComExecucao = pontos.filter((p) => parseFloat(p.percentualExecucaoMensal) > 0);
  const mesInicio = mesesComExecucao.length > 0 ? Math.min(...mesesComExecucao.map((p) => p.mes)) : null;
  const mesFim = mesesComExecucao.length > 0 ? Math.max(...mesesComExecucao.map((p) => p.mes)) : null;
  const duracaoMeses = mesInicio !== null && mesFim !== null ? mesFim - mesInicio + 1 : null;
  const mesPico =
    pontos.length > 0 ? pontos.reduce((maior, p) => (parseFloat(p.desembolsoMensal) > parseFloat(maior.desembolsoMensal) ? p : maior), pontos[0]!).mes : null;
  const valorTotalObra = pontos.length > 0 ? pontos[pontos.length - 1]!.desembolsoAcumulado : "0";

  return <PermissoesProvider nivel={nivelDoCenario(empreendimentos, cenarioId)}>(
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }} onClickCapture={() => setErro(null)} onSubmitCapture={() => setErro(null)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>
            {cenarioAtual ? `${empreendimentos.find((e) => e.id === empreendimentoId)?.nome} · ${cenarioAtual.nome}` : "Carregando…"}
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Cronograma</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {empreendimentos.length > 0 && <CenarioSwitcher empreendimentos={empreendimentos} cenarioId={cenarioId} onChange={setCenarioId} />}
          <ThemeToggle />
        </div>
      </div>

      {erro && (
        <div style={{ background: "var(--status-critical-soft-bg)", border: "1px solid var(--status-critical)", borderRadius: 10, padding: "12px 16px", color: "var(--status-critical-text)", fontSize: 13 }}>
          {erro}
        </div>
      )}

      {carregando && pontos.length === 0 && !erro && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>Carregando…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KpiCard label="Duração da obra" value={duracaoMeses !== null ? `${duracaoMeses} ${duracaoMeses === 1 ? "mês" : "meses"}` : "—"} />
        <KpiCard label="Mês de maior desembolso" value={mesPico !== null ? `Mês ${mesPico}` : "—"} tone="accent" />
        <KpiCard label="Desembolso total de obra" value={formatBRL(valorTotalObra, { abbreviate: true })} tone="good" />
        <KpiCard label="Meses cadastrados" value={String(pontos.length)} />
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        <CronogramaChart pontos={pontos} />
      </div>

      {cenarioId && (
        <CronogramaFormSecao
          key={cenarioId}
          cenarioId={cenarioId}
          cronograma={cronogramaBruto}
          onAtualizado={recarregar}
          onErro={setErro}
        />
      )}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Curva mês a mês</div>
        {pontos.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum cronograma cadastrado neste cenário ainda.</div>
        ) : (
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                <th style={{ fontWeight: 600, paddingBottom: 6 }}>Mês</th>
                <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>% físico</th>
                <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>% acumulado</th>
                <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>Desembolso</th>
                <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>Desembolso acumulado</th>
              </tr>
            </thead>
            <tbody style={{ font: "var(--text-mono-body)" }}>
              {pontos.map((p) => (
                <tr key={p.mes}>
                  <td style={{ padding: "3px 0" }}>{p.mes}</td>
                  <td style={{ textAlign: "right" }}>{(parseFloat(p.percentualExecucaoMensal) * 100).toFixed(1)}%</td>
                  <td style={{ textAlign: "right" }}>{(parseFloat(p.percentualAcumulado) * 100).toFixed(1)}%</td>
                  <td style={{ textAlign: "right" }}>{formatBRL(p.desembolsoMensal)}</td>
                  <td style={{ textAlign: "right" }}>{formatBRL(p.desembolsoAcumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )</PermissoesProvider>;
}

/**
 * Cadastro/edição do cronograma — mesma política já decidida em
 * CadastroPage.tsx (CronogramaSecao): sem edição ponto a ponto (quebraria a
 * regra R6, soma=100%), "editar" é excluir tudo e recriar. Reaproveitada
 * aqui com layout próprio da tela gerencial.
 */
function CronogramaFormSecao({
  cenarioId,
  cronograma,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  cronograma: { mes: number; percentualExecucaoMensal: string }[];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [pontosForm, setPontosForm] = useState<{ mes: string; percentualExecucaoMensal: string }[]>(
    cronograma.length > 0
      ? cronograma.map((p) => ({ mes: String(p.mes), percentualExecucaoMensal: p.percentualExecucaoMensal }))
      : [{ mes: "1", percentualExecucaoMensal: "" }],
  );
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const soma = pontosForm.reduce((acc, p) => acc + (Number(p.percentualExecucaoMensal) || 0), 0);
  const somaFecha = Math.abs(soma - 1) < 0.001;

  async function excluir() {
    if (!window.confirm("Excluir o cronograma inteiro deste cenário? Você poderá cadastrar um novo em seguida.")) return;
    setExcluindo(true);
    try {
      await excluirCronograma(cenarioId);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setExcluindo(false);
    }
  }

  function editar() {
    setPontosForm(cronograma.map((p) => ({ mes: String(p.mes), percentualExecucaoMensal: p.percentualExecucaoMensal })));
    setEditando(true);
  }

  function atualizarPonto(i: number, patch: Partial<{ mes: string; percentualExecucaoMensal: string }>) {
    setPontosForm((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function adicionarLinha() {
    setPontosForm((rows) => [...rows, { mes: String(rows.length + 1), percentualExecucaoMensal: "" }]);
  }

  function removerLinha(i: number) {
    setPontosForm((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const pontos = pontosForm.map((p) => ({ mes: Number(p.mes), percentualExecucaoMensal: p.percentualExecucaoMensal }));
      if (cronograma.length > 0) await substituirCronograma(cenarioId, pontos);
      else await criarCronograma(cenarioId, pontos);
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)" }}>Cadastro do cronograma</div>
        {cronograma.length > 0 && !editando && (
          <div style={{ display: "flex", gap: 8 }}>
            <Button requer="editar" variant="secondary" onClick={editar} style={{ padding: "4px 8px", fontSize: 11 }}>
              Editar
            </Button>
            <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "4px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
              {excluindo ? "Excluindo…" : "Excluir cronograma"}
            </Button>
          </div>
        )}
      </div>

      {cronograma.length > 0 && !editando ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
          {cronograma.length} {cronograma.length === 1 ? "mês cadastrado" : "meses cadastrados"} — veja a curva acima ou clique em "Editar" para
          substituir.
        </div>
      ) : (
        <form onSubmit={submeter} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pontosForm.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ width: 80 }}>
                <TextField label="Mês" type="number" min={1} value={p.mes} onChange={(e) => atualizarPonto(i, { mes: e.target.value })} required />
              </div>
              <div style={{ width: 110 }}>
                <TextField
                  label="% (0–1)"
                  value={p.percentualExecucaoMensal}
                  onChange={(e) => atualizarPonto(i, { percentualExecucaoMensal: e.target.value })}
                  placeholder="0.3"
                  required
                />
              </div>
              {pontosForm.length > 1 && (
                <Button requer="editar" type="button" variant="secondary" onClick={() => removerLinha(i)} style={{ padding: "8px 10px", fontSize: 12 }}>
                  Remover
                </Button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Button requer="editar" type="button" variant="secondary" onClick={adicionarLinha} style={{ padding: "6px 10px", fontSize: 12 }}>
              + Mês
            </Button>
            <span style={{ fontSize: 12, fontWeight: 600, color: somaFecha ? "var(--status-good-text)" : "var(--status-warning-text)" }}>
              Soma: {(soma * 100).toFixed(1)}% {somaFecha ? "" : "(precisa fechar em 100%)"}
            </span>
            <Button requer="editar" type="submit" disabled={salvando || !somaFecha}>
              {salvando ? "Salvando…" : "Salvar cronograma"}
            </Button>
            {editando && (
              <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "8px 12px", fontSize: 12.5 }}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
