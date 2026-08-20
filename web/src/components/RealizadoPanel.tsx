import { useEffect, useState } from "react";
import {
  estornarCustoRealizado,
  estornarRecebimentoRealizado,
  fetchCenarioDetalhe,
  fetchRecebimentos,
  registrarCustoRealizado,
  registrarRecebimentoRealizado,
  type CustoResumo,
  type RecebimentoResumo,
} from "../api/client.js";
import { formatBRL } from "../format.js";
import { Button } from "./Button.js";
import { TextField } from "./TextField.js";

export function RealizadoPanel({ cenarioId, onAtualizado }: { cenarioId: string; onAtualizado: () => void }) {
  const [recebimentos, setRecebimentos] = useState<RecebimentoResumo[]>([]);
  const [custos, setCustos] = useState<CustoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  function recarregar() {
    fetchRecebimentos(cenarioId)
      .then(setRecebimentos)
      .catch((e) => setErro(String(e.message ?? e)));
    fetchCenarioDetalhe(cenarioId)
      .then((d) => setCustos(d.custos))
      .catch((e) => setErro(String(e.message ?? e)));
  }

  useEffect(() => {
    recarregar();
  }, [cenarioId]);

  function aoRegistrar() {
    recarregar();
    onAtualizado();
  }

  const custosFixos = custos.filter((c) => c.tipoIncidencia === "fixo");
  const recebidos = recebimentos.filter((r) => r.status === "recebido").length;
  const pagos = custosFixos.filter((c) => c.status === "realizado").length;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 4 }}>Realizado × Projetado</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 14 }}>
        Registre o que já entrou ou saiu de verdade — o motor continua projetando com base no previsto; isto é só uma camada de conferência por cima.
      </div>

      {erro && (
        <div style={{ fontSize: 12, color: "var(--status-critical-text)", marginBottom: 10 }}>{erro}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
            Recebimentos — {recebidos} de {recebimentos.length} recebidos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {recebimentos.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>Nenhum recebimento projetado ainda.</div>}
            {recebimentos.map((r) => (
              <LinhaRecebimento key={r.id} recebimento={r} onRegistrado={aoRegistrar} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
            Custos fixos — {pagos} de {custosFixos.length} pagos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {custosFixos.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>Nenhum custo fixo cadastrado ainda.</div>}
            {custosFixos.map((c) => (
              <LinhaCusto key={c.id} custo={c} onRegistrado={aoRegistrar} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LinhaRecebimento({ recebimento, onRegistrado }: { recebimento: RecebimentoResumo; onRegistrado: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(recebimento.valorRealizado ?? recebimento.valorPrevisto);
  const [salvando, setSalvando] = useState(false);

  const jaRecebido = recebimento.status === "recebido";

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await registrarRecebimentoRealizado(recebimento.id, { valorRealizado: valor });
      setEditando(false);
      onRegistrado();
    } catch (err: any) {
      alert(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function estornar() {
    if (!window.confirm("Estornar este recebimento? Ele volta a ficar como previsto, sem valor realizado.")) return;
    try {
      await estornarRecebimentoRealizado(recebimento.id);
      onRegistrado();
    } catch (err: any) {
      alert(String(err.message ?? err));
    }
  }

  if (editando) {
    return (
      <form onSubmit={registrar} style={{ display: "flex", gap: 6, alignItems: "flex-end", fontSize: 12 }}>
        <div style={{ width: 110 }}>
          <TextField label="Valor recebido" value={valor} onChange={(e) => setValor(e.target.value)} required />
        </div>
        <Button type="submit" disabled={salvando} style={{ padding: "6px 10px", fontSize: 11.5 }}>
          {salvando ? "…" : "Confirmar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "6px 10px", fontSize: 11.5 }}>
          Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}>
      <span style={{ color: "var(--ink-secondary)" }}>
        Mês {recebimento.mesCompetencia} · {recebimento.unidadeNumero} · {recebimento.modalidadeNome}{" "}
        <span style={{ font: "var(--text-mono-body)", color: "var(--ink-primary)" }}>{formatBRL(recebimento.valorPrevisto)}</span>
      </span>
      {jaRecebido ? (
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-good-text)" }}>✓ {formatBRL(recebimento.valorRealizado!)}</span>
          <Button variant="secondary" onClick={() => setEditando(true)} style={{ padding: "3px 7px", fontSize: 10.5 }}>
            Editar
          </Button>
          <Button variant="secondary" onClick={estornar} style={{ padding: "3px 7px", fontSize: 10.5, color: "var(--status-critical-text)" }}>
            Estornar
          </Button>
        </span>
      ) : (
        <Button variant="secondary" onClick={() => setEditando(true)} style={{ padding: "4px 8px", fontSize: 11 }}>
          Marcar recebido
        </Button>
      )}
    </div>
  );
}

function LinhaCusto({ custo, onRegistrado }: { custo: CustoResumo; onRegistrado: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(custo.valorRealizado ?? custo.valorPrevisto ?? "");
  const [salvando, setSalvando] = useState(false);

  const jaPago = custo.status === "realizado";

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await registrarCustoRealizado(custo.id, { valorRealizado: valor });
      setEditando(false);
      onRegistrado();
    } catch (err: any) {
      alert(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function estornar() {
    if (!window.confirm("Estornar este custo? Ele volta a ficar como previsto, sem valor realizado.")) return;
    try {
      await estornarCustoRealizado(custo.id);
      onRegistrado();
    } catch (err: any) {
      alert(String(err.message ?? err));
    }
  }

  if (editando) {
    return (
      <form onSubmit={registrar} style={{ display: "flex", gap: 6, alignItems: "flex-end", fontSize: 12 }}>
        <div style={{ width: 110 }}>
          <TextField label="Valor pago" value={valor} onChange={(e) => setValor(e.target.value)} required />
        </div>
        <Button type="submit" disabled={salvando} style={{ padding: "6px 10px", fontSize: 11.5 }}>
          {salvando ? "…" : "Confirmar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "6px 10px", fontSize: 11.5 }}>
          Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}>
      <span style={{ color: "var(--ink-secondary)" }}>
        Mês {custo.competenciaMes} · {custo.categoriaNome}{" "}
        <span style={{ font: "var(--text-mono-body)", color: "var(--ink-primary)" }}>{formatBRL(custo.valorPrevisto ?? "0")}</span>
      </span>
      {jaPago ? (
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-good-text)" }}>✓ {formatBRL(custo.valorRealizado!)}</span>
          <Button variant="secondary" onClick={() => setEditando(true)} style={{ padding: "3px 7px", fontSize: 10.5 }}>
            Editar
          </Button>
          <Button variant="secondary" onClick={estornar} style={{ padding: "3px 7px", fontSize: 10.5, color: "var(--status-critical-text)" }}>
            Estornar
          </Button>
        </span>
      ) : (
        <Button variant="secondary" onClick={() => setEditando(true)} style={{ padding: "4px 8px", fontSize: 11 }}>
          Marcar pago
        </Button>
      )}
    </div>
  );
}
