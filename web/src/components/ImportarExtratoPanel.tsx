import { useEffect, useRef, useState } from "react";
import {
  atualizarCenario,
  confirmarConciliacaoExtrato,
  fetchCenarioDetalhe,
  sugerirConciliacaoExtrato,
  type CandidatoConciliacaoResumo,
  type SugestaoLinhaExtrato,
} from "../api/client.js";
import { formatBRL } from "../format.js";
import { Button } from "./Button.js";
import { TextField } from "./TextField.js";

const ROTULO_TIPO: Record<string, string> = {
  recebimento: "Recebimento",
  custo_fixo: "Custo fixo",
  desembolso_custo: "Custo percentual",
};

/**
 * Importação em lote de extrato bancário (achado F27, docs/DECISOES.md):
 * lê um CSV (Data,Descrição,Valor) direto no navegador — nada é enviado
 * como arquivo, só o texto já lido — pede sugestões ao backend, e só marca
 * como realizado o que o usuário efetivamente confirmar linha a linha.
 * Nunca marca nada sozinho.
 */
export function ImportarExtratoPanel({ cenarioId, onAtualizado }: { cenarioId: string; onAtualizado: () => void }) {
  const [sugestoes, setSugestoes] = useState<SugestaoLinhaExtrato[] | null>(null);
  const [selecoes, setSelecoes] = useState<Record<number, CandidatoConciliacaoResumo | null>>({});
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dataMesUmInput, setDataMesUmInput] = useState("");
  const [salvandoData, setSalvandoData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCenarioDetalhe(cenarioId)
      .then((d) => setDataMesUmInput(d.dataMesUm ?? ""))
      .catch((e) => setErro(String(e.message ?? e)));
  }, [cenarioId]);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro(null);
    setCarregando(true);
    try {
      const texto = await arquivo.text();
      const resultado = await sugerirConciliacaoExtrato(cenarioId, texto);
      setSugestoes(resultado.sugestoes);
      const iniciais: Record<number, CandidatoConciliacaoResumo | null> = {};
      resultado.sugestoes.forEach((s, i) => {
        iniciais[i] = s.candidatos[0] ?? null;
      });
      setSelecoes(iniciais);
    } catch (err: any) {
      setErro(String(err.message ?? err));
    } finally {
      setCarregando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmar() {
    if (!sugestoes) return;
    const confirmacoes = sugestoes
      .map((s, i) => ({ candidato: selecoes[i], valor: s.linha.valor }))
      .filter((c): c is { candidato: CandidatoConciliacaoResumo; valor: string } => c.candidato !== null && c.candidato !== undefined)
      .map((c) => ({ tipo: c.candidato.tipo, id: c.candidato.id, valorRealizado: c.valor.replace("-", "") }));
    if (confirmacoes.length === 0) return;
    setConfirmando(true);
    setErro(null);
    try {
      await confirmarConciliacaoExtrato(cenarioId, confirmacoes);
      setSugestoes(null);
      setSelecoes({});
      onAtualizado();
    } catch (err: any) {
      setErro(String(err.message ?? err));
    } finally {
      setConfirmando(false);
    }
  }

  async function salvarDataMesUm(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoData(true);
    try {
      await atualizarCenario(cenarioId, { dataMesUm: dataMesUmInput || null });
      onAtualizado();
    } catch (err: any) {
      setErro(String(err.message ?? err));
    } finally {
      setSalvandoData(false);
    }
  }

  const totalSelecionados = Object.values(selecoes).filter((c) => c !== null && c !== undefined).length;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 4 }}>Importar extrato bancário</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 14 }}>
        Envie um CSV (colunas Data, Descrição, Valor — positivo para entradas, negativo para saídas). O sistema sugere qual recebimento ou custo cada
        linha provavelmente é; nada é marcado como realizado sem sua confirmação.
      </div>

      <form onSubmit={salvarDataMesUm} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ width: 160 }}>
          <TextField
            label="Data do mês 1 (opcional)"
            type="date"
            value={dataMesUmInput}
            onChange={(e) => setDataMesUmInput(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={salvandoData} style={{ padding: "8px 12px", fontSize: 12 }}>
          {salvandoData ? "Salvando…" : "Salvar"}
        </Button>
        <span style={{ fontSize: 11, color: "var(--ink-muted)", paddingBottom: 8 }}>
          Sem essa data, as sugestões usam só o valor — com ela, também consideram a proximidade do mês.
        </span>
      </form>

      {erro && <div style={{ fontSize: 12, color: "var(--status-critical-text)", marginBottom: 10 }}>{erro}</div>}

      <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={aoEscolherArquivo} disabled={carregando} style={{ fontSize: 12.5 }} />
      {carregando && <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 8 }}>Lendo arquivo…</div>}

      {sugestoes && (
        <div style={{ marginTop: 14 }}>
          {sugestoes.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma linha válida encontrada no arquivo.</div>
          ) : (
            <>
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                    <th style={{ fontWeight: 600, paddingBottom: 4 }}>Data</th>
                    <th style={{ fontWeight: 600, paddingBottom: 4 }}>Descrição</th>
                    <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: "right" }}>Valor</th>
                    <th style={{ fontWeight: 600, paddingBottom: 4 }}>Conciliar com</th>
                  </tr>
                </thead>
                <tbody style={{ font: "var(--text-mono-body)" }}>
                  {sugestoes.map((s, i) => (
                    <tr key={i}>
                      <td style={{ padding: "4px 6px 4px 0" }}>{s.linha.data ?? "—"}</td>
                      <td style={{ color: "var(--ink-secondary)" }}>{s.linha.descricao}</td>
                      <td style={{ textAlign: "right", color: Number(s.linha.valor) < 0 ? "var(--status-critical-text)" : "var(--ink-primary)" }}>
                        {formatBRL(s.linha.valor)}
                      </td>
                      <td>
                        {s.candidatos.length === 0 ? (
                          <span style={{ color: "var(--ink-muted)" }}>sem sugestão</span>
                        ) : (
                          <select
                            value={selecoes[i] ? `${selecoes[i]!.tipo}|${selecoes[i]!.id}` : ""}
                            onChange={(e) => {
                              const [tipo, id] = e.target.value.split("|");
                              const candidato = s.candidatos.find((c) => c.tipo === tipo && c.id === id) ?? null;
                              setSelecoes((prev) => ({ ...prev, [i]: candidato }));
                            }}
                            style={{
                              fontFamily: "var(--font-ui)",
                              fontSize: 12,
                              color: "var(--ink-primary)",
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "4px 6px",
                            }}
                          >
                            <option value="">Ignorar esta linha</option>
                            {s.candidatos.map((c) => (
                              <option key={`${c.tipo}|${c.id}`} value={`${c.tipo}|${c.id}`}>
                                {ROTULO_TIPO[c.tipo]} · {c.descricao} · mês {c.mes} · {formatBRL(c.valorPrevisto)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12 }}>
                <Button type="button" onClick={confirmar} disabled={confirmando || totalSelecionados === 0} style={{ padding: "8px 14px", fontSize: 12.5 }}>
                  {confirmando ? "Confirmando…" : `Confirmar ${totalSelecionados} conciliação${totalSelecionados === 1 ? "" : "ões"}`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
