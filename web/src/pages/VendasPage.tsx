import { PermissoesProvider, PermitidoEditar, PermitidoExcluir, nivelDoCenario } from "../permissoes";
import { useEffect, useMemo, useState } from "react";
import { useCenarioAtivo } from "../useCenarioAtivo";
import {
  atualizarVenda,
  excluirVenda,
  fetchImpactoExclusaoVenda,
  criarVenda,
  desfazerDistrato,
  fetchEmpreendimentoDetalhe,
  fetchEmpreendimentos,
  fetchEstoque,
  fetchRecebimentos,
  fetchUnidades,
  fetchVendasDoCenario,
  registrarDistrato,
  registrarRenegociacao,
  type EmpreendimentoResumo,
  type EstoqueResumo,
  type RecebimentoResumo,
  type TipologiaResumo,
  type UnidadeResumo,
  type VendaCenarioResumo,
} from "../api/client.js";
import { CenarioSwitcher } from "../components/CenarioSwitcher.js";
import { KpiCard } from "../components/KpiCard.js";
import { Button } from "../components/Button.js";
import { TextField } from "../components/TextField.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { formatBRL } from "../format.js";

const ROTULO_STATUS_UNIDADE: Record<string, string> = {
  estoque: "Disponíveis",
  vendida: "Vendidas",
  permutada: "Permutadas",
  reservada: "Reservadas",
  distratada: "Distratadas",
  indisponivel: "Indisponíveis",
};

/**
 * Fase 2.1 — tela de Vendas. Interface operacional para registrar e
 * acompanhar vendas de um cenário: nenhuma regra financeira vive aqui —
 * a projeção de recebimentos é sempre a que o motor já calculou
 * (fetchRecebimentos, filtrado por vendaId), e as ações reaproveitam as
 * mesmas rotas já usadas em CadastroPage (distrato/renegociação).
 */
export function VendasPage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [cenarioId, setCenarioId] = useState<string | null>(null);
  const [vendas, setVendas] = useState<VendaCenarioResumo[]>([]);
  const [recebimentos, setRecebimentos] = useState<RecebimentoResumo[]>([]);
  const [estoque, setEstoque] = useState<EstoqueResumo | null>(null);
  const [tipologias, setTipologias] = useState<TipologiaResumo[]>([]);
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
    if (!cenarioId || !empreendimentoId) return;
    const alvo = cenarioId;
    setCarregando(true);
    Promise.all([
      fetchVendasDoCenario(cenarioId),
      fetchRecebimentos(cenarioId),
      fetchEstoque(empreendimentoId),
      fetchEmpreendimentoDetalhe(empreendimentoId),
    ])
      .then(([v, r, e, det]) => {
        if (!ehCenarioAtual(alvo)) return;
        setVendas(v);
        setRecebimentos(r);
        setEstoque(e);
        setTipologias(det.tipologias);
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
    // Troca de cenário não pode deixar dado do cenário anterior visível
    // (mesmo cuidado já corrigido no ImportarExtratoPanel — ver achado F29).
    // tipologias PRECISA zerar aqui também: se ficasse com o array antigo
    // até o fetchEmpreendimentoDetalhe() de recarregar() resolver,
    // <FormularioRegistrarVenda key={cenarioId}> remontaria de imediato
    // (efeito do key) mas capturaria a tipologia do empreendimento ANTERIOR
    // logo no primeiro render, antes do dado novo chegar — o mesmo bug de
    // formulário travado encontrado na verificação visual (achado F30),
    // só que numa janela mais estreita.
    setVendas([]);
    setRecebimentos([]);
    setEstoque(null);
    setTipologias([]);
    recarregar();
  }, [cenarioId]);

  return <PermissoesProvider nivel={nivelDoCenario(empreendimentos, cenarioId)}>(
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }} onClickCapture={() => setErro(null)} onSubmitCapture={() => setErro(null)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>
            {cenarioAtual ? `${empreendimentos.find((e) => e.id === empreendimentoId)?.nome} · ${cenarioAtual.nome}` : "Carregando…"}
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Vendas</div>
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

      {carregando && vendas.length === 0 && !erro && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>Carregando…</div>}

      {estoque && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
          <KpiCard label="Total" value={String(estoque.total)} />
          <KpiCard label="Disponíveis" value={String(estoque.porStatus.estoque ?? 0)} tone="good" />
          <KpiCard label="Vendidas" value={String(estoque.porStatus.vendida ?? 0)} tone="accent" />
          <KpiCard label="Permutadas" value={String(estoque.porStatus.permutada ?? 0)} />
          <KpiCard label="Reservadas" value={String(estoque.porStatus.reservada ?? 0)} />
          <KpiCard label="Distratadas" value={String(estoque.porStatus.distratada ?? 0)} />
        </div>
      )}

      {cenarioId && tipologias.length > 0 && (
        <FormularioRegistrarVenda
          // key=cenarioId: forca remontagem completa do formulario ao trocar de
          // cenario -- sem isso, o estado interno tipologiaId (useState so
          // inicializado uma vez) sobrevivia com o id da tipologia do cenario
          // ANTERIOR, e em cenarios com uma unica tipologia nao havia nenhum
          // onChange real pra resincronizar isso, travando o botao de
          // registrar venda para sempre (achado na verificacao visual da
          // Fase 2.1).
          key={cenarioId}
          cenarioId={cenarioId}
          horizonteMeses={cenarioAtual?.horizonteProjecaoMeses ?? 1}
          tipologias={tipologias}
          onAtualizado={recarregar}
          onErro={setErro}
        />
      )}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Vendas do cenário — {vendas.length}</div>
        {vendas.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma venda registrada neste cenário ainda.</div>
        ) : (
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                <th style={{ fontWeight: 600, paddingBottom: 6 }}>Unidade</th>
                <th style={{ fontWeight: 600, paddingBottom: 6 }}>Tipologia</th>
                <th style={{ fontWeight: 600, paddingBottom: 6 }}>Comprador</th>
                <th style={{ fontWeight: 600, paddingBottom: 6 }}>Condição</th>
                <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>Valor</th>
                <th style={{ fontWeight: 600, paddingBottom: 6 }}>Mês</th>
                <th style={{ fontWeight: 600, paddingBottom: 6 }}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody style={{ font: "var(--text-mono-body)" }}>
              {vendas.map((v) => (
                <LinhaVenda key={v.id} venda={v} recebimentos={recebimentos.filter((r) => r.vendaId === v.id)} onAtualizado={recarregar} onErro={setErro} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )</PermissoesProvider>;
}

function FormularioRegistrarVenda({
  cenarioId,
  horizonteMeses,
  tipologias,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  horizonteMeses: number;
  tipologias: TipologiaResumo[];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [tipologiaId, setTipologiaId] = useState(tipologias[0]?.id ?? "");
  const [unidadesDisponiveis, setUnidadesDisponiveis] = useState<UnidadeResumo[]>([]);
  const [unidadeId, setUnidadeId] = useState("");
  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState("");
  const [comprador, setComprador] = useState("");
  const [documentoComprador, setDocumentoComprador] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [mesOrigem, setMesOrigem] = useState("1");
  const [salvando, setSalvando] = useState(false);

  const tipologiaSelecionada = tipologias.find((t) => t.id === tipologiaId);
  const condicoesDaTipologia = tipologiaSelecionada?.condicoesPagamento ?? [];

  useEffect(() => {
    if (!tipologiaId) return;
    fetchUnidades(tipologiaId)
      .then((us) => setUnidadesDisponiveis(us.filter((u) => u.status === "estoque")))
      .catch((e) => onErro(String(e.message ?? e)));
    setUnidadeId("");
  }, [tipologiaId]);

  useEffect(() => {
    setCondicaoPagamentoId(condicoesDaTipologia[0]?.id ?? "");
  }, [tipologiaId, tipologias]);

  useEffect(() => {
    const unidade = unidadesDisponiveis.find((u) => u.id === unidadeId);
    setValorVenda(unidade?.precoVenda ?? "");
  }, [unidadeId, unidadesDisponiveis]);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    if (!unidadeId || !condicaoPagamentoId) return;
    setSalvando(true);
    try {
      await criarVenda(cenarioId, {
        unidadeId,
        condicaoPagamentoId,
        mesOrigem: Number(mesOrigem),
        valorVenda: valorVenda || undefined,
        comprador: comprador.trim() || undefined,
        documentoComprador: documentoComprador.trim() || undefined,
      });
      setComprador("");
      setDocumentoComprador("");
      setMesOrigem("1");
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Registrar venda</div>
      <form onSubmit={submeter} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 160 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Tipologia</span>
          <select
            value={tipologiaId}
            onChange={(e) => setTipologiaId(e.target.value)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          >
            {tipologias.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 150 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Unidade</span>
          <select
            value={unidadeId}
            onChange={(e) => setUnidadeId(e.target.value)}
            required
            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          >
            <option value="">
              {unidadesDisponiveis.length === 0 ? "Nenhuma disponível" : "Selecione…"}
            </option>
            {unidadesDisponiveis.map((u) => (
              <option key={u.id} value={u.id}>
                {u.numero}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 190 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Condição de pagamento</span>
          <select
            value={condicaoPagamentoId}
            onChange={(e) => setCondicaoPagamentoId(e.target.value)}
            required
            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          >
            <option value="">{condicoesDaTipologia.length === 0 ? "Nenhuma cadastrada" : "Selecione…"}</option>
            {condicoesDaTipologia.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <div style={{ width: 170 }}>
          <TextField label="Comprador" value={comprador} onChange={(e) => setComprador(e.target.value)} placeholder="Nome do comprador" />
        </div>
        <div style={{ width: 140 }}>
          <TextField label="CPF/CNPJ" value={documentoComprador} onChange={(e) => setDocumentoComprador(e.target.value)} placeholder="opcional" />
        </div>
        <div style={{ width: 130 }}>
          <TextField label="Valor" value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} placeholder="500000" required />
        </div>
        <div style={{ width: 90 }}>
          <TextField label="Mês" type="number" min={1} max={horizonteMeses} value={mesOrigem} onChange={(e) => setMesOrigem(e.target.value)} required />
        </div>
        <Button requer="editar" type="submit" disabled={salvando || !unidadeId || !condicaoPagamentoId}>
          {salvando ? "Salvando…" : "Registrar venda"}
        </Button>
      </form>
    </div>
  );
}

function LinhaVenda({
  venda,
  recebimentos,
  onAtualizado,
  onErro,
}: {
  venda: VendaCenarioResumo;
  recebimentos: RecebimentoResumo[];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [editando, setEditando] = useState(false);
  const [comprador, setComprador] = useState(venda.comprador ?? "");
  const [valorVenda, setValorVenda] = useState(venda.valorVenda);
  const [salvando, setSalvando] = useState(false);
  const [mostrarRenegociar, setMostrarRenegociar] = useState(false);
  const [novoValor, setNovoValor] = useState("");
  const [motivoRenegociacao, setMotivoRenegociacao] = useState("");

  const distratada = venda.status === "distratada";

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarVenda(venda.id, { comprador: comprador.trim() || null, valorVenda });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  async function distratar() {
    if (!window.confirm(`Distratar a venda da unidade ${venda.unidade.numero}?`)) return;
    const mes = Number(window.prompt("Em qual mês do cenário o distrato acontece? (número inteiro, a partir de 1)", "1"));
    if (!Number.isInteger(mes) || mes < 1) {
      onErro("Informe um mês inteiro, a partir de 1.");
      return;
    }
    try {
      await registrarDistrato(venda.id, { mesDistrato: mes });
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  async function excluirVendaLancada() {
    let avisoProjecao = "";
    try {
      const impacto = await fetchImpactoExclusaoVenda(venda.id);
      if (impacto.premissaPassaraValer) {
        avisoProjecao = " A premissa de velocidade passará a valer para esta tipologia e o VGV do cenário deve mudar.";
      }
    } catch (e: any) {
      onErro(String(e.message ?? e));
      return;
    }
    if (!window.confirm(`Excluir a venda da unidade ${venda.unidade.numero}? A unidade volta ao estoque e os recebimentos previstos desta venda serão removidos.${avisoProjecao}`)) return;
    try {
      await excluirVenda(venda.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  async function desfazer() {
    try {
      await desfazerDistrato(venda.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  async function renegociar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await registrarRenegociacao(venda.id, { novoValorVenda: novoValor, motivo: motivoRenegociacao.trim() || undefined });
      setNovoValor("");
      setMotivoRenegociacao("");
      setMostrarRenegociar(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  return (
    <>
      <tr>
        <td style={{ padding: "5px 0" }}>{venda.unidade.numero}</td>
        <td>{venda.tipologia.nome}</td>
        <td style={{ color: venda.comprador ? "var(--ink-primary)" : "var(--ink-muted)" }}>{venda.comprador ?? "—"}</td>
        <td>{venda.condicaoPagamento.nome}</td>
        <td style={{ textAlign: "right" }}>{formatBRL(venda.valorVenda)}</td>
        <td>{venda.mesOrigem}</td>
        <td>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
              color: distratada ? "var(--status-critical-text)" : "var(--status-good-text)",
              background: distratada ? "var(--status-critical-soft-bg)" : "var(--status-good-soft-bg)",
            }}
          >
            {distratada ? "Distratada" : "Ativa"}
          </span>
        </td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <Button variant="secondary" onClick={() => setExpandido((v) => !v)} style={{ padding: "3px 8px", fontSize: 11 }}>
            Recebimentos{recebimentos.length > 0 ? ` (${recebimentos.length})` : ""}
          </Button>{" "}
          {!distratada && (
            <>
              <Button requer="editar" variant="secondary" onClick={() => setEditando((v) => !v)} style={{ padding: "3px 8px", fontSize: 11 }}>
                Editar
              </Button>{" "}
              <Button requer="editar" variant="secondary" onClick={() => setMostrarRenegociar((v) => !v)} style={{ padding: "3px 8px", fontSize: 11 }}>
                Renegociar
              </Button>{" "}
              <Button requer="editar" variant="secondary" onClick={distratar} style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
                Distratar
              </Button>
            </>
          )}
          {distratada && (
            <Button requer="excluir" variant="secondary" onClick={desfazer} style={{ padding: "3px 8px", fontSize: 11 }}>
              Desfazer distrato
            </Button>
          )}
          {!distratada && (
            <>
              {" "}
              <Button requer="excluir" variant="secondary" onClick={excluirVendaLancada} style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
                Excluir
              </Button>
            </>
          )}
        </td>
      </tr>
      {editando && (
        <tr>
          <td colSpan={8} style={{ padding: "6px 0 10px" }}>
            <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end", font: "var(--text-body)" }}>
              <div style={{ width: 200 }}>
                <TextField label="Comprador" value={comprador} onChange={(e) => setComprador(e.target.value)} />
              </div>
              <div style={{ width: 140 }}>
                <TextField label="Valor" value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} required />
              </div>
              <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "6px 10px", fontSize: 12 }}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
                Cancelar
              </Button>
            </form>
          </td>
        </tr>
      )}
      {mostrarRenegociar && (
        <tr>
          <td colSpan={8} style={{ padding: "6px 0 10px" }}>
            <form onSubmit={renegociar} style={{ display: "flex", gap: 8, alignItems: "flex-end", font: "var(--text-body)" }}>
              <div style={{ width: 140 }}>
                <TextField label="Novo valor" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} placeholder="menor que o atual" required />
              </div>
              <div style={{ width: 220 }}>
                <TextField label="Motivo (opcional)" value={motivoRenegociacao} onChange={(e) => setMotivoRenegociacao(e.target.value)} />
              </div>
              <Button requer="editar" type="submit" style={{ padding: "6px 10px", fontSize: 12 }}>
                Confirmar renegociação
              </Button>
              <Button type="button" variant="secondary" onClick={() => setMostrarRenegociar(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
                Cancelar
              </Button>
            </form>
          </td>
        </tr>
      )}
      {expandido && (
        <tr>
          <td colSpan={8} style={{ padding: "6px 0 14px" }}>
            <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
                Recebimentos gerados pelo motor para esta venda
              </div>
              {recebimentos.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>Nenhum recebimento gerado ainda.</div>
              ) : (
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                      <th style={{ fontWeight: 600, paddingBottom: 4 }}>Mês</th>
                      <th style={{ fontWeight: 600, paddingBottom: 4 }}>Modalidade</th>
                      <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: "right" }}>Previsto</th>
                      <th style={{ fontWeight: 600, paddingBottom: 4 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody style={{ font: "var(--text-mono-body)" }}>
                    {recebimentos.map((r) => (
                      <tr key={r.id}>
                        <td>{r.mesCompetencia}</td>
                        <td>{r.modalidadeNome}</td>
                        <td style={{ textAlign: "right" }}>{formatBRL(r.valorPrevisto)}</td>
                        <td style={{ color: r.status === "previsto" ? "var(--ink-muted)" : "var(--status-good-text)" }}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
