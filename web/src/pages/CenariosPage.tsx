import { useEffect, useMemo, useState } from "react";
import {
  atualizarCenario,
  criarCenario,
  duplicarCenario,
  excluirCenario,
  fetchComparacaoCenariosMultiplos,
  fetchEmpreendimentoDetalhe,
  fetchEmpreendimentos,
  type CenarioResumo,
  type ComparacaoCenario,
  type EmpreendimentoDetalhe,
  type EmpreendimentoResumo,
} from "../api/client.js";
import { Button } from "../components/Button.js";
import { CenariosComparacaoChart, corDoIndice, type SerieComparacao } from "../components/CenariosComparacaoChart.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { TextField } from "../components/TextField.js";
import { formatBRL } from "../format.js";

const inputSelectStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-primary)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
};

const LABEL_TIPO: Record<string, string> = { base: "Base", otimista: "Otimista", pessimista: "Pessimista", personalizado: "Personalizado" };

/**
 * Fase 2.4 — visão gerencial de Cenários: lista/CRUD (reaproveita as mesmas
 * funções de client.ts já usadas em CadastroPage.tsx, sem removê-la de lá —
 * mesmo precedente de Custos/Cronograma) e comparação de N cenários
 * escolhidos livremente pelo usuário. Todo indicador e toda premissa
 * exibidos vêm prontos de `fetchComparacaoCenariosMultiplos`
 * (`montarComparacaoCenarios`, src/db/servicoMotor.ts) -- nenhum cálculo
 * financeiro novo acontece nesta tela.
 */
export function CenariosPage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [empreendimentoId, setEmpreendimentoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<EmpreendimentoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [comparacao, setComparacao] = useState<ComparacaoCenario[] | null>(null);
  const [comparando, setComparando] = useState(false);

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

  function recarregar() {
    if (!empreendimentoId) return;
    setCarregando(true);
    fetchEmpreendimentoDetalhe(empreendimentoId)
      .then((d) => {
        setDetalhe(d);
        setErro(null);
      })
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    // Trocar de empreendimento nao pode deixar cenario/comparacao do
    // empreendimento anterior visivel -- mesmo cuidado ja aplicado em
    // Vendas/Custos/Cronograma (achado F30).
    setDetalhe(null);
    setSelecionados(new Set());
    setComparacao(null);
    recarregar();
  }, [empreendimentoId]);

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
    setComparacao(null);
  }

  async function comparar() {
    if (!empreendimentoId || selecionados.size === 0) return;
    setComparando(true);
    try {
      const r = await fetchComparacaoCenariosMultiplos(empreendimentoId, [...selecionados]);
      setComparacao(r.cenarios);
      setErro(null);
    } catch (e: any) {
      setErro(String(e.message ?? e));
    } finally {
      setComparando(false);
    }
  }

  const nomesPorId = useMemo(() => new Map((detalhe?.cenarios ?? []).map((c) => [c.id, c.nome])), [detalhe]);

  return (
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>{detalhe ? detalhe.nome : "Carregando…"}</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Cenários</div>
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

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Cenários do empreendimento — {detalhe?.cenarios.length ?? 0}</div>

        {detalhe && detalhe.cenarios.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginBottom: 12 }}>Nenhum cenário cadastrado ainda.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {detalhe?.cenarios.map((c) => (
            <CartaoCenarioComparavel
              key={c.id}
              cenario={c}
              selecionado={selecionados.has(c.id)}
              onAlternarSelecao={() => alternarSelecao(c.id)}
              onAtualizado={recarregar}
              onErro={setErro}
            />
          ))}
        </div>

        {empreendimentoId && (
          <NovoCenarioForm key={empreendimentoId} empreendimentoId={empreendimentoId} onCriado={recarregar} onErro={setErro} />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button onClick={comparar} disabled={selecionados.size === 0 || comparando}>
          {comparando ? "Comparando…" : `Comparar selecionados (${selecionados.size})`}
        </Button>
        {selecionados.size === 1 && <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Selecione ao menos 2 cenários para uma comparação útil.</span>}
      </div>

      {comparacao && comparacao.length > 0 && <ComparacaoResultado cenarios={comparacao} nomesPorId={nomesPorId} />}
    </div>
  );
}

function CartaoCenarioComparavel({
  cenario,
  selecionado,
  onAlternarSelecao,
  onAtualizado,
  onErro,
}: {
  cenario: CenarioResumo;
  selecionado: boolean;
  onAlternarSelecao: () => void;
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState(cenario.nome);
  const [horizonteEdicao, setHorizonteEdicao] = useState(String(cenario.horizonteProjecaoMeses));
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [nomeDuplicacao, setNomeDuplicacao] = useState(`${cenario.nome} (cópia)`);
  const [salvandoDuplicacao, setSalvandoDuplicacao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoEdicao(true);
    try {
      await atualizarCenario(cenario.id, { nome: nomeEdicao, horizonteProjecaoMeses: Number(horizonteEdicao) });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function salvarDuplicacao(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoDuplicacao(true);
    try {
      await duplicarCenario(cenario.id, nomeDuplicacao);
      setDuplicando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoDuplicacao(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir o cenário "${cenario.nome}"? As vendas geradas neste cenário serão apagadas e as unidades voltam para o estoque.`)) return;
    setExcluindo(true);
    try {
      await excluirCenario(cenario.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
      setExcluindo(false);
    }
  }

  if (editando) {
    return (
      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2)" }}>
        <form onSubmit={salvarEdicao} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <TextField label="Nome" value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} required />
          </div>
          <div style={{ width: 130 }}>
            <TextField label="Horizonte (meses)" type="number" min={1} value={horizonteEdicao} onChange={(e) => setHorizonteEdicao(e.target.value)} required />
          </div>
          <Button type="submit" disabled={salvandoEdicao || !nomeEdicao.trim()}>
            {salvandoEdicao ? "Salvando…" : "Salvar"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </form>
      </div>
    );
  }

  if (duplicando) {
    return (
      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2)" }}>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 8 }}>
          Cria um cenário novo com as mesmas premissas, custos, cronograma, índice de correção e financiamento — as vendas não são copiadas.
        </div>
        <form onSubmit={salvarDuplicacao} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <TextField label="Nome do novo cenário" value={nomeDuplicacao} onChange={(e) => setNomeDuplicacao(e.target.value)} required />
          </div>
          <Button type="submit" disabled={salvandoDuplicacao || !nomeDuplicacao.trim()}>
            {salvandoDuplicacao ? "Duplicando…" : "Confirmar"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDuplicando(false)}>
            Cancelar
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        border: selecionado ? "1px solid var(--accent)" : "1px solid var(--border-subtle)",
        background: selecionado ? "var(--accent-soft-bg)" : "var(--surface-2)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input type="checkbox" checked={selecionado} onChange={onAlternarSelecao} style={{ width: 16, height: 16 }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            {cenario.nome}
            {cenario.tipo === "base" && (
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--accent-text)", background: "var(--accent-soft-bg)", border: "1px solid var(--accent)", borderRadius: 6, padding: "1px 6px" }}>
                Base
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
            {LABEL_TIPO[cenario.tipo] ?? cenario.tipo} · {cenario.horizonteProjecaoMeses} meses
            {cenario.derivadoDeNome && ` · Derivado de: ${cenario.derivadoDeNome}`}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Editar
        </Button>
        <Button variant="secondary" onClick={() => setDuplicando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Duplicar
        </Button>
        <Button variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
          {excluindo ? "Excluindo…" : "Excluir"}
        </Button>
      </div>
    </div>
  );
}

function NovoCenarioForm({ empreendimentoId, onCriado, onErro }: { empreendimentoId: string; onCriado: () => void; onErro: (msg: string) => void }) {
  const [tipo, setTipo] = useState("base");
  const [nome, setNome] = useState("");
  const [horizonteProjecaoMeses, setHorizonteProjecaoMeses] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarCenario(empreendimentoId, { tipo, nome, horizonteProjecaoMeses: Number(horizonteProjecaoMeses) });
      setNome("");
      setHorizonteProjecaoMeses("");
      onCriado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submeter} style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-subtle)", alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <TextField label="Novo cenário" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Base" required />
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 140 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Tipo</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={inputSelectStyle}>
          <option value="base">Base</option>
          <option value="otimista">Otimista</option>
          <option value="pessimista">Pessimista</option>
          <option value="personalizado">Personalizado</option>
        </select>
      </label>
      <div style={{ width: 130 }}>
        <TextField label="Horizonte (meses)" type="number" min={1} value={horizonteProjecaoMeses} onChange={(e) => setHorizonteProjecaoMeses(e.target.value)} placeholder="40" required />
      </div>
      <Button type="submit" disabled={salvando || !nome.trim()}>
        {salvando ? "Salvando…" : "Adicionar"}
      </Button>
    </form>
  );
}

const LINHAS_INDICADORES: { rotulo: string; acessor: (c: ComparacaoCenario) => string; formatar?: (v: string) => string }[] = [
  { rotulo: "VGV", acessor: (c) => c.indicadores.vgv, formatar: formatBRL },
  { rotulo: "Recebimentos previstos", acessor: (c) => c.indicadores.totalRecebimentosPrevisto, formatar: formatBRL },
  { rotulo: "Custos previstos", acessor: (c) => c.indicadores.totalCustosPrevisto, formatar: formatBRL },
  { rotulo: "Fluxo líquido (saldo final)", acessor: (c) => c.indicadores.saldoFinal, formatar: formatBRL },
  { rotulo: "Necessidade máxima de capital", acessor: (c) => c.indicadores.necessidadeMaximaCapital, formatar: formatBRL },
  { rotulo: "Mês do pico", acessor: (c) => (c.indicadores.mesPico !== null ? `Mês ${c.indicadores.mesPico}` : "—") },
  { rotulo: "VPL", acessor: (c) => c.indicadores.vpl, formatar: formatBRL },
];

function ComparacaoResultado({ cenarios, nomesPorId }: { cenarios: ComparacaoCenario[]; nomesPorId: Map<string, string> }) {
  const series = (campo: "entradas" | "saidas" | "fluxoMensal" | "fluxoAcumulado"): SerieComparacao[] =>
    cenarios.map((c, i) => ({
      nome: c.nome,
      cor: corDoIndice(i),
      pontos: c.fluxoMensal.map((p) => ({ mes: p.mes, valor: parseFloat(p[campo]) })),
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Indicadores</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                <th style={{ fontWeight: 600, paddingBottom: 6 }}>Indicador</th>
                {cenarios.map((c) => (
                  <th key={c.id} style={{ fontWeight: 700, paddingBottom: 6, textAlign: "right", color: "var(--ink-primary)" }}>
                    {c.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ font: "var(--text-mono-body)" }}>
              {LINHAS_INDICADORES.map((linha) => (
                <tr key={linha.rotulo}>
                  <td style={{ padding: "5px 0", fontFamily: "var(--font-ui)" }}>{linha.rotulo}</td>
                  {cenarios.map((c) => {
                    const bruto = linha.acessor(c);
                    return (
                      <td key={c.id} style={{ textAlign: "right", padding: "5px 0" }}>
                        {linha.formatar ? linha.formatar(bruto) : bruto}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 12 }}>
          TIR e "Resultado" não aparecem aqui porque o motor financeiro deste sistema não calcula esses indicadores hoje — só VPL, necessidade máxima de
          capital, mês do pico, mês de recuperação e saldo final.
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 14 }}>Onde os cenários se separam</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <CenariosComparacaoChart titulo="Recebimentos por mês" series={series("entradas")} formatAxis={formatAxisMoeda} formatTooltip={formatBRL} />
          <CenariosComparacaoChart titulo="Desembolsos por mês" series={series("saidas")} formatAxis={formatAxisMoeda} formatTooltip={formatBRL} />
          <CenariosComparacaoChart titulo="Fluxo líquido mensal" series={series("fluxoMensal")} formatAxis={formatAxisMoeda} formatTooltip={formatBRL} />
          <CenariosComparacaoChart titulo="Saldo acumulado" series={series("fluxoAcumulado")} formatAxis={formatAxisMoeda} formatTooltip={formatBRL} />
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 4 }}>Diferenças de premissas</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 14 }}>
          Só as premissas que realmente variam por cenário neste sistema — preço de unidade e prazo de recebimento são compartilhados por todos os
          cenários do mesmo empreendimento, não aparecem aqui.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cenarios.length}, 1fr)`, gap: 16 }}>
          {cenarios.map((c, i) => (
            <div key={c.id} style={{ border: `1px solid ${corDoIndice(i)}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 8 }}>{c.nome}</div>
              <PremissaLinha rotulo="Horizonte" valor={`${c.premissas.horizonteProjecaoMeses} meses`} />
              <PremissaLinha rotulo="Limite de risco" valor={c.premissas.limiteNecessidadeMaximaCapital ? `${(Number(c.premissas.limiteNecessidadeMaximaCapital) * 100).toFixed(0)}%` : "padrão (30%)"} />
              <PremissaLinha rotulo="Velocidade de vendas" valor={`${c.premissas.velocidadeVendas.totalUnidadesPrevistas} unidade(s) prevista(s)`} />
              {c.premissas.velocidadeVendas.porTipologia.map((t) => (
                <div key={t.tipologiaId} style={{ fontSize: 11, color: "var(--ink-muted)", paddingLeft: 8 }}>
                  · {t.tipologiaNome}: {t.totalUnidadesPrevistas}
                </div>
              ))}
              {c.premissas.custos.length === 0 ? (
                <PremissaLinha rotulo="Custos" valor="nenhum cadastrado" />
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginTop: 8, marginBottom: 4 }}>Custos</div>
                  {c.premissas.custos.map((custo, idx) => (
                    <div key={idx} style={{ fontSize: 11.5, color: "var(--ink-secondary)" }}>
                      · {custo.categoriaNome}
                      {custo.tipologiaNome ? ` (${custo.tipologiaNome})` : ""}: {custo.valorPrevisto ? formatBRL(custo.valorPrevisto) : custo.percentual ? `${(Number(custo.percentual) * 100).toFixed(1)}%` : "faixas"}
                    </div>
                  ))}
                </>
              )}
              <PremissaLinha
                rotulo="Cronograma"
                valor={c.premissas.cronograma ? `${c.premissas.cronograma.quantidadeMeses} mês(es) cadastrado(s)` : "não cadastrado"}
              />
              <PremissaLinha
                rotulo="Financiamento"
                valor={c.premissas.financiamento ? `${formatBRL(c.premissas.financiamento.valorContratado)} contratado` : "sem financiamento"}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PremissaLinha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-secondary)", padding: "2px 0" }}>
      <span>{rotulo}</span>
      <span style={{ fontWeight: 600, color: "var(--ink-primary)", textAlign: "right" }}>{valor}</span>
    </div>
  );
}

function formatAxisMoeda(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} mi`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} mil`;
  return `${sign}${abs.toFixed(0)}`;
}
