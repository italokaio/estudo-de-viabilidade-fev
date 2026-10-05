import { PermissoesProvider, PermitidoEditar, PermitidoExcluir, nivelDoCenario } from "../permissoes";
import { useEffect, useMemo, useState } from "react";
import { useCenarioAtivo } from "../useCenarioAtivo";
import {
  atualizarCusto,
  criarCusto,
  estornarCustoRealizado,
  estornarDesembolsoCustoRealizado,
  excluirCusto,
  fetchCenarioDetalhe,
  fetchCustosResumo,
  fetchDistribuicaoMensalCusto,
  fetchEmpreendimentos,
  registrarCustoRealizado,
  registrarDesembolsoCustoRealizado,
  type CategoriaCustoResumo,
  type CustoResumoGerencial,
  type DistribuicaoMensalCusto,
  type EmpreendimentoResumo,
  type TipoIncidenciaCusto,
} from "../api/client.js";
import { CenarioSwitcher } from "../components/CenarioSwitcher.js";
import { KpiCard } from "../components/KpiCard.js";
import { Button } from "../components/Button.js";
import { TextField } from "../components/TextField.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { formatBRL } from "../format.js";

const LABEL_TIPO_INCIDENCIA: Record<TipoIncidenciaCusto, string> = {
  fixo: "Fixo",
  pct_vgv_vendido_no_mes: "% do VGV vendido no mês",
  pct_recebido_no_mes: "% do recebido no mês",
  pct_recebido_mes_anterior: "% do recebido no mês anterior",
  faixas_vgv_acumulado: "Faixas por VGV acumulado",
  pct_execucao: "% da execução física",
};

type CampoOrdenacao = "categoriaNome" | "totalPrevisto" | "totalRealizado" | "desvio";

const inputSelectStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-primary)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
};

/**
 * Fase 2.2 — visão gerencial de Custos (achado F31, docs/DECISOES.md).
 * Nenhum cálculo financeiro vive aqui: previsto/realizado/saldo/desvio de
 * cada custo, e a distribuição mensal, vêm prontos do backend
 * (/custos-resumo, /distribuicao-mensal) -- ambos reaproveitam
 * exatamente o que rodarMotorParaCenario já calcula para o fluxo de
 * caixa, nunca um recálculo paralelo.
 */
export function CustosPage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [cenarioId, setCenarioId] = useState<string | null>(null);
  const [resumo, setResumo] = useState<CustoResumoGerencial[]>([]);
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<CategoriaCustoResumo[]>([]);
  const [tipologiasDisponiveis, setTipologiasDisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [gruposIndiceCorrecao, setGruposIndiceCorrecao] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroCategoriaId, setFiltroCategoriaId] = useState("");
  const [agrupar, setAgrupar] = useState(true);
  const [ordenarPor, setOrdenarPor] = useState<CampoOrdenacao>("categoriaNome");

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
    Promise.all([fetchCustosResumo(cenarioId), fetchCenarioDetalhe(cenarioId)])
      .then(([r, det]) => {
        if (!ehCenarioAtual(alvo)) return;
        setResumo(r);
        setCategoriasDisponiveis(det.categoriasCustoDisponiveis);
        setTipologiasDisponiveis(det.tipologiasDisponiveis);
        setGruposIndiceCorrecao(Array.from(new Set(["padrao", ...det.indicesCorrecao.map((i) => i.grupo)])));
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
    // mesmo cuidado (e mesmo bug corrigido) da tela de Vendas, achado F30.
    // categoriasDisponiveis/tipologiasDisponiveis PRECISAM zerar aqui: são
    // elas que <FormularioNovoCusto key={cenarioId}> usa no primeiro
    // render após o remount.
    setResumo([]);
    setCategoriasDisponiveis([]);
    setTipologiasDisponiveis([]);
    setFiltroCategoriaId("");
    recarregar();
  }, [cenarioId]);

  const totalPrevisto = resumo.reduce((acc, c) => acc + parseFloat(c.totalPrevisto), 0);
  const totalRealizado = resumo.reduce((acc, c) => acc + parseFloat(c.totalRealizado), 0);
  const saldoARealizar = totalPrevisto - totalRealizado;

  const porCategoria = new Map<string, { nome: string; previsto: number; desvio: number }>();
  for (const c of resumo) {
    const atual = porCategoria.get(c.categoriaId) ?? { nome: c.categoriaNome, previsto: 0, desvio: 0 };
    atual.previsto += parseFloat(c.totalPrevisto);
    atual.desvio += parseFloat(c.desvio);
    porCategoria.set(c.categoriaId, atual);
  }
  const categoriaMaiorPeso = [...porCategoria.values()].sort((a, b) => b.previsto - a.previsto)[0];
  const categoriaMaiorDesvio = [...porCategoria.values()].sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))[0];

  const filtrados = resumo.filter((c) => {
    if (filtroCategoriaId && c.categoriaId !== filtroCategoriaId) return false;
    const alvo = filtroTexto.trim().toLowerCase();
    if (alvo && !c.categoriaNome.toLowerCase().includes(alvo) && !(c.tipologiaNome ?? "").toLowerCase().includes(alvo)) return false;
    return true;
  });
  const ordenados = [...filtrados].sort((a, b) => {
    if (ordenarPor === "categoriaNome") return a.categoriaNome.localeCompare(b.categoriaNome);
    if (ordenarPor === "totalPrevisto") return parseFloat(b.totalPrevisto) - parseFloat(a.totalPrevisto);
    if (ordenarPor === "totalRealizado") return parseFloat(b.totalRealizado) - parseFloat(a.totalRealizado);
    return Math.abs(parseFloat(b.desvio)) - Math.abs(parseFloat(a.desvio));
  });

  const idsCategoriasComCusto = Array.from(new Set(ordenados.map((c) => c.categoriaId)));
  const grupos = agrupar
    ? idsCategoriasComCusto.map((catId) => ({
        categoriaId: catId,
        categoriaNome: ordenados.find((c) => c.categoriaId === catId)!.categoriaNome,
        itens: ordenados.filter((c) => c.categoriaId === catId),
      }))
    : [{ categoriaId: "__todos__", categoriaNome: "", itens: ordenados }];

  return <PermissoesProvider nivel={nivelDoCenario(empreendimentos, cenarioId)}>(
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }} onClickCapture={() => setErro(null)} onSubmitCapture={() => setErro(null)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>
            {cenarioAtual ? `${empreendimentos.find((e) => e.id === empreendimentoId)?.nome} · ${cenarioAtual.nome}` : "Carregando…"}
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Custos</div>
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

      {carregando && resumo.length === 0 && !erro && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>Carregando…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
        <KpiCard label="Total previsto" value={formatBRL(totalPrevisto, { abbreviate: true })} />
        <KpiCard label="Total realizado" value={formatBRL(totalRealizado, { abbreviate: true })} tone="good" />
        <KpiCard label="Saldo a realizar" value={formatBRL(saldoARealizar, { abbreviate: true })} tone="accent" />
        <KpiCard label="Categoria de maior peso" value={categoriaMaiorPeso ? categoriaMaiorPeso.nome : "—"} />
        <KpiCard label="Categoria de maior desvio" value={categoriaMaiorDesvio ? categoriaMaiorDesvio.nome : "—"} />
      </div>

      {cenarioId && categoriasDisponiveis.length > 0 && (
        <FormularioNovoCusto
          // key=cenarioId: forca remontagem ao trocar de cenario, mesmo
          // cuidado do bug corrigido em VendasPage (achado F30) -- sem
          // isso o estado interno categoriaId ficaria preso na categoria
          // do cenario anterior.
          key={cenarioId}
          cenarioId={cenarioId}
          categoriasDisponiveis={categoriasDisponiveis}
          tipologiasDisponiveis={tipologiasDisponiveis}
          gruposIndiceCorrecao={gruposIndiceCorrecao}
          onAtualizado={recarregar}
          onErro={setErro}
        />
      )}

      {cenarioId && categoriasDisponiveis.length === 0 && !carregando && (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
          Nenhuma categoria de custo cadastrada para este empreendimento ainda — cadastre uma na tela de Cadastro antes de lançar custos aqui.
        </div>
      )}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)" }}>Custos do cenário — {resumo.length}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 180 }}>
              <TextField label="" placeholder="Buscar categoria/tipologia" value={filtroTexto} onChange={(e) => setFiltroTexto(e.target.value)} />
            </div>
            <select value={filtroCategoriaId} onChange={(e) => setFiltroCategoriaId(e.target.value)} style={{ ...inputSelectStyle, padding: "9px 10px" }}>
              <option value="">Todas as categorias</option>
              {categoriasDisponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value as CampoOrdenacao)} style={{ ...inputSelectStyle, padding: "9px 10px" }}>
              <option value="categoriaNome">Ordenar: categoria</option>
              <option value="totalPrevisto">Ordenar: previsto</option>
              <option value="totalRealizado">Ordenar: realizado</option>
              <option value="desvio">Ordenar: desvio</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-secondary)" }}>
              <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} />
              Agrupar por categoria
            </label>
          </div>
        </div>

        {ordenados.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum custo cadastrado neste cenário ainda.</div>
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.categoriaId} style={{ marginBottom: 18 }}>
              {agrupar && (
                <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", margin: "6px 0" }}>
                  {grupo.categoriaNome} — {formatBRL(grupo.itens.reduce((acc, c) => acc + parseFloat(c.totalPrevisto), 0))} previsto
                </div>
              )}
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                    {!agrupar && <th style={{ fontWeight: 600, paddingBottom: 6 }}>Categoria</th>}
                    <th style={{ fontWeight: 600, paddingBottom: 6 }}>Tipologia</th>
                    <th style={{ fontWeight: 600, paddingBottom: 6 }}>Incidência</th>
                    <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>Previsto</th>
                    <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>Realizado</th>
                    <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>Saldo</th>
                    <th style={{ fontWeight: 600, paddingBottom: 6, textAlign: "right" }}>Desvio</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody style={{ font: "var(--text-mono-body)" }}>
                  {grupo.itens.map((c) => (
                    <LinhaCustoGerencial
                      key={c.id}
                      custo={c}
                      mostrarCategoria={!agrupar}
                      gruposIndiceCorrecao={gruposIndiceCorrecao}
                      onAtualizado={recarregar}
                      onErro={setErro}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  )</PermissoesProvider>;
}

function FormularioNovoCusto({
  cenarioId,
  categoriasDisponiveis,
  tipologiasDisponiveis,
  gruposIndiceCorrecao,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  categoriasDisponiveis: CategoriaCustoResumo[];
  tipologiasDisponiveis: { id: string; nome: string }[];
  gruposIndiceCorrecao: string[];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [categoriaId, setCategoriaId] = useState(categoriasDisponiveis[0]?.id ?? "");
  const [tipologiaId, setTipologiaId] = useState("");
  const [valorPrevisto, setValorPrevisto] = useState("");
  const [percentual, setPercentual] = useState("");
  const [competenciaMes, setCompetenciaMes] = useState("");
  const [recorrencia, setRecorrencia] = useState<"unico" | "mensal">("unico");
  const [grupoIndiceCorrecao, setGrupoIndiceCorrecao] = useState("padrao");
  const [salvando, setSalvando] = useState(false);

  const categoriaSelecionada = categoriasDisponiveis.find((c) => c.id === categoriaId);
  const incidenciaPorValor = categoriaSelecionada?.tipoIncidencia === "fixo" || categoriaSelecionada?.tipoIncidencia === "pct_execucao";
  const usaFaixas = categoriaSelecionada?.tipoIncidencia === "faixas_vgv_acumulado";
  const suportaTipologia =
    categoriaSelecionada?.tipoIncidencia === "pct_vgv_vendido_no_mes" ||
    categoriaSelecionada?.tipoIncidencia === "pct_recebido_no_mes" ||
    usaFaixas;

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    if (!categoriaId) return;
    setSalvando(true);
    try {
      await criarCusto(cenarioId, {
        categoriaId,
        tipologiaId: suportaTipologia && tipologiaId ? tipologiaId : undefined,
        valorPrevisto: incidenciaPorValor ? valorPrevisto : undefined,
        percentual: incidenciaPorValor || usaFaixas ? undefined : percentual,
        competenciaMes: categoriaSelecionada?.tipoIncidencia === "fixo" ? Number(competenciaMes) : undefined,
        recorrencia: categoriaSelecionada?.tipoIncidencia === "fixo" ? recorrencia : undefined,
        grupoIndiceCorrecao: grupoIndiceCorrecao.trim() || "padrao",
      });
      setValorPrevisto("");
      setPercentual("");
      setCompetenciaMes("");
      setTipologiaId("");
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Lançar custo</div>
      <form onSubmit={submeter} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 190 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Categoria</span>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={inputSelectStyle}>
            {categoriasDisponiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {LABEL_TIPO_INCIDENCIA[c.tipoIncidencia]}
              </option>
            ))}
          </select>
        </label>
        {suportaTipologia && (
          <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 170 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Tipologia (opcional)</span>
            <select value={tipologiaId} onChange={(e) => setTipologiaId(e.target.value)} style={inputSelectStyle}>
              <option value="">Todas</option>
              {tipologiasDisponiveis.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {usaFaixas ? (
          <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>As faixas de VGV/percentual são cadastradas na tela de Cadastro, depois de criar o custo.</span>
        ) : incidenciaPorValor ? (
          <div style={{ width: 140 }}>
            <TextField label="Valor previsto" value={valorPrevisto} onChange={(e) => setValorPrevisto(e.target.value)} placeholder="500000" required />
          </div>
        ) : (
          <div style={{ width: 100 }}>
            <TextField label="% (0–1)" value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="0.05" required />
          </div>
        )}
        {categoriaSelecionada?.tipoIncidencia === "fixo" && (
          <>
            <div style={{ width: 90 }}>
              <TextField label="Mês" type="number" min={1} value={competenciaMes} onChange={(e) => setCompetenciaMes(e.target.value)} required />
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 130 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Recorrência</span>
              <select value={recorrencia} onChange={(e) => setRecorrencia(e.target.value as "unico" | "mensal")} style={inputSelectStyle}>
                <option value="unico">Único</option>
                <option value="mensal">Mensal</option>
              </select>
            </label>
          </>
        )}
        <div style={{ width: 130 }}>
          <TextField label="Índice" list="grupos-indice-correcao-custo-gerencial" value={grupoIndiceCorrecao} onChange={(e) => setGrupoIndiceCorrecao(e.target.value)} placeholder="padrao" />
          <datalist id="grupos-indice-correcao-custo-gerencial">
            {gruposIndiceCorrecao.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <Button requer="editar" type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Lançar custo"}
        </Button>
      </form>
    </div>
  );
}

function LinhaCustoGerencial({
  custo,
  mostrarCategoria,
  gruposIndiceCorrecao,
  onAtualizado,
  onErro,
}: {
  custo: CustoResumoGerencial;
  mostrarCategoria: boolean;
  gruposIndiceCorrecao: string[];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [marcandoRealizado, setMarcandoRealizado] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [distribuicao, setDistribuicao] = useState<DistribuicaoMensalCusto | null>(null);
  const [carregandoDistribuicao, setCarregandoDistribuicao] = useState(false);

  const ehFixo = custo.tipoIncidencia === "fixo";
  const desvioPct = custo.desvioPercentual !== null ? `${parseFloat(custo.desvioPercentual) > 0 ? "+" : ""}${custo.desvioPercentual}%` : "—";
  const desvioNegativoParaCliente = parseFloat(custo.desvio) > 0; // realizado > previsto: gastou mais do que planejado

  function alternarExpandido() {
    setExpandido((v) => !v);
    if (!expandido && !distribuicao) {
      setCarregandoDistribuicao(true);
      fetchDistribuicaoMensalCusto(custo.id)
        .then(setDistribuicao)
        .catch((e) => onErro(String(e.message ?? e)))
        .finally(() => setCarregandoDistribuicao(false));
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir este custo de "${custo.categoriaNome}"?`)) return;
    try {
      await excluirCusto(custo.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  return (
    <>
      <tr>
        {mostrarCategoria && <td style={{ padding: "5px 0" }}>{custo.categoriaNome}</td>}
        <td>{custo.tipologiaNome ?? "Todas"}</td>
        <td style={{ fontSize: 11.5 }}>
          {LABEL_TIPO_INCIDENCIA[custo.tipoIncidencia]}
          {ehFixo && custo.competenciaMes ? ` · mês ${custo.competenciaMes}${custo.recorrencia === "mensal" ? "+" : ""}` : ""}
        </td>
        <td style={{ textAlign: "right" }}>{formatBRL(custo.totalPrevisto)}</td>
        <td style={{ textAlign: "right", color: parseFloat(custo.totalRealizado) > 0 ? "var(--status-good-text)" : "var(--ink-muted)" }}>{formatBRL(custo.totalRealizado)}</td>
        <td style={{ textAlign: "right" }}>{formatBRL(custo.saldoARealizar)}</td>
        <td style={{ textAlign: "right", color: desvioNegativoParaCliente ? "var(--status-critical-text)" : "var(--ink-muted)" }}>{desvioPct}</td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <Button variant="secondary" onClick={alternarExpandido} style={{ padding: "3px 8px", fontSize: 11 }}>
            Distribuição
          </Button>{" "}
          {ehFixo && (
            <Button requer="editar" variant="secondary" onClick={() => setMarcandoRealizado((v) => !v)} style={{ padding: "3px 8px", fontSize: 11 }}>
              {custo.status === "realizado" ? "Realizado ✓" : "Marcar realizado"}
            </Button>
          )}{" "}
          <Button requer="editar" variant="secondary" onClick={() => setEditando((v) => !v)} style={{ padding: "3px 8px", fontSize: 11 }}>
            Editar
          </Button>{" "}
          <Button requer="excluir" variant="secondary" onClick={excluir} style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
            Excluir
          </Button>
        </td>
      </tr>

      {marcandoRealizado && ehFixo && (
        <tr>
          <td colSpan={8} style={{ padding: "4px 0 10px" }}>
            <MarcarRealizadoFixo
              custo={custo}
              onSalvo={() => {
                setMarcandoRealizado(false);
                onAtualizado();
              }}
              onErro={onErro}
            />
          </td>
        </tr>
      )}

      {editando && (
        <tr>
          <td colSpan={8} style={{ padding: "4px 0 10px" }}>
            <EditarCustoForm
              custo={custo}
              gruposIndiceCorrecao={gruposIndiceCorrecao}
              onSalvo={() => {
                setEditando(false);
                onAtualizado();
              }}
              onCancelar={() => setEditando(false)}
              onErro={onErro}
            />
          </td>
        </tr>
      )}

      {expandido && (
        <tr>
          <td colSpan={8} style={{ padding: "4px 0 14px" }}>
            <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
                Distribuição mensal (calculada pelo motor)
              </div>
              {carregandoDistribuicao && <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>Carregando…</div>}
              {distribuicao && !distribuicao.granular && (
                <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 8 }}>
                  Este custo é de incidência fixa: o realizado é um único valor agregado (marcado acima), sem acompanhamento mês a mês — limitação
                  atual do modelo, não desta tela.
                </div>
              )}
              {distribuicao && distribuicao.meses.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>Nenhum valor projetado para este custo no horizonte do cenário.</div>}
              {distribuicao && distribuicao.meses.length > 0 && (
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                      <th style={{ fontWeight: 600, paddingBottom: 4 }}>Mês</th>
                      <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: "right" }}>Previsto</th>
                      {distribuicao.granular && <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: "right" }}>Realizado</th>}
                      {distribuicao.granular && <th></th>}
                    </tr>
                  </thead>
                  <tbody style={{ font: "var(--text-mono-body)" }}>
                    {distribuicao.meses.map((m) => {
                      const item = distribuicao.realizadoPorMes.find((r) => r.mes === m.mes);
                      return (
                        <LinhaMesDistribuicao
                          key={m.mes}
                          mes={m.mes}
                          valorPrevisto={m.valorPrevisto}
                          semBase={m.semBase}
                          granular={distribuicao.granular}
                          item={item ?? null}
                          onAtualizado={() => {
                            fetchDistribuicaoMensalCusto(custo.id).then(setDistribuicao).catch((e) => onErro(String(e.message ?? e)));
                            onAtualizado();
                          }}
                          onErro={onErro}
                        />
                      );
                    })}
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

function LinhaMesDistribuicao({
  mes,
  valorPrevisto,
  semBase,
  granular,
  item,
  onAtualizado,
  onErro,
}: {
  mes: number;
  valorPrevisto: string;
  semBase: boolean;
  granular: boolean;
  item: { mes: number; valorRealizado: string | null; status: string; desembolsoId: string } | null;
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(item?.valorRealizado ?? valorPrevisto);

  if (!granular || !item) {
    return (
      <tr>
        <td>{mes}</td>
        <td style={{ textAlign: "right" }}>{formatBRL(valorPrevisto)}</td>
      </tr>
    );
  }

  const jaPago = item.status === "realizado";

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await registrarDesembolsoCustoRealizado(item!.desembolsoId, { valorRealizado: valor });
      setEditando(false);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    }
  }

  async function estornar() {
    const pergunta = semBase
      ? "Estornar este desembolso? Ele não tem mais base de cálculo, então a linha será removida."
      : "Estornar este desembolso? Ele volta a ficar como previsto.";
    if (!window.confirm(pergunta)) return;
    try {
      await estornarDesembolsoCustoRealizado(item!.desembolsoId);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    }
  }

  return (
    <tr>
      <td>{mes}</td>
      <td style={{ textAlign: "right" }}>
        {formatBRL(valorPrevisto)}
        {semBase && <div style={{ fontSize: 10.5, color: "var(--ink-muted)" }}>sem base — previsto removido</div>}
      </td>
      <td style={{ textAlign: "right" }}>
        {editando ? (
          <form onSubmit={registrar} style={{ display: "flex", gap: 5, justifyContent: "flex-end", alignItems: "center" }}>
            <div style={{ width: 100 }}>
              <TextField label="" value={valor} onChange={(e) => setValor(e.target.value)} required />
            </div>
            <Button requer="editar" type="submit" style={{ padding: "3px 7px", fontSize: 10.5 }}>
              OK
            </Button>
          </form>
        ) : jaPago ? (
          <span style={{ color: "var(--status-good-text)", fontWeight: 700 }}>{formatBRL(item.valorRealizado!)}</span>
        ) : (
          "—"
        )}
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {!editando && jaPago && (
          <Button requer="editar" variant="secondary" onClick={estornar} style={{ padding: "3px 7px", fontSize: 10.5, color: "var(--status-critical-text)" }}>
            Estornar
          </Button>
        )}
        {!editando && !jaPago && (
          <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "3px 7px", fontSize: 10.5 }}>
            Marcar pago
          </Button>
        )}
      </td>
    </tr>
  );
}

function MarcarRealizadoFixo({ custo, onSalvo, onErro }: { custo: CustoResumoGerencial; onSalvo: () => void; onErro: (msg: string) => void }) {
  const [valor, setValor] = useState(custo.totalRealizado !== "0.00" ? custo.totalRealizado : custo.totalPrevisto);
  const [salvando, setSalvando] = useState(false);
  const jaPago = custo.status === "realizado";

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await registrarCustoRealizado(custo.id, { valorRealizado: valor });
      onSalvo();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function estornar() {
    if (!window.confirm("Estornar este custo? Ele volta a ficar como previsto.")) return;
    try {
      await estornarCustoRealizado(custo.id);
      onSalvo();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    }
  }

  return (
    <form onSubmit={registrar} style={{ display: "flex", gap: 8, alignItems: "flex-end", font: "var(--text-body)" }}>
      <div style={{ width: 140 }}>
        <TextField label="Valor realizado" value={valor} onChange={(e) => setValor(e.target.value)} required />
      </div>
      <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "6px 10px", fontSize: 12 }}>
        {salvando ? "Salvando…" : "Confirmar"}
      </Button>
      {jaPago && (
        <Button requer="editar" type="button" variant="secondary" onClick={estornar} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
          Estornar
        </Button>
      )}
    </form>
  );
}

function EditarCustoForm({
  custo,
  gruposIndiceCorrecao,
  onSalvo,
  onCancelar,
  onErro,
}: {
  custo: CustoResumoGerencial;
  gruposIndiceCorrecao: string[];
  onSalvo: () => void;
  onCancelar: () => void;
  onErro: (msg: string) => void;
}) {
  const incidenciaPorValor = custo.tipoIncidencia === "fixo" || custo.tipoIncidencia === "pct_execucao";
  const usaFaixas = custo.tipoIncidencia === "faixas_vgv_acumulado";
  const [valorPrevisto, setValorPrevisto] = useState(incidenciaPorValor ? custo.totalPrevisto : "");
  const [percentual, setPercentual] = useState("");
  const [competenciaMes, setCompetenciaMes] = useState(custo.competenciaMes?.toString() ?? "");
  const [recorrencia, setRecorrencia] = useState<"unico" | "mensal">((custo.recorrencia as "unico" | "mensal") ?? "unico");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarCusto(custo.id, {
        valorPrevisto: incidenciaPorValor ? valorPrevisto : undefined,
        percentual: !incidenciaPorValor && !usaFaixas ? percentual || undefined : undefined,
        competenciaMes: custo.tipoIncidencia === "fixo" ? Number(competenciaMes) : undefined,
        recorrencia: custo.tipoIncidencia === "fixo" ? recorrencia : undefined,
      });
      onSalvo();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  if (usaFaixas) {
    return (
      <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>
        Custos por faixas de VGV acumulado são editados na tela de Cadastro (tabela de faixas).{" "}
        <Button variant="secondary" onClick={onCancelar} style={{ padding: "3px 8px", fontSize: 11 }}>
          Fechar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end", font: "var(--text-body)" }}>
      {incidenciaPorValor ? (
        <div style={{ width: 140 }}>
          <TextField label="Valor previsto" value={valorPrevisto} onChange={(e) => setValorPrevisto(e.target.value)} required />
        </div>
      ) : (
        <div style={{ width: 100 }}>
          <TextField label="% (0–1)" value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="mantém o atual se vazio" />
        </div>
      )}
      {custo.tipoIncidencia === "fixo" && (
        <>
          <div style={{ width: 90 }}>
            <TextField label="Mês" type="number" min={1} value={competenciaMes} onChange={(e) => setCompetenciaMes(e.target.value)} required />
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 130 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Recorrência</span>
            <select value={recorrencia} onChange={(e) => setRecorrencia(e.target.value as "unico" | "mensal")} style={inputSelectStyle}>
              <option value="unico">Único</option>
              <option value="mensal">Mensal</option>
            </select>
          </label>
        </>
      )}
      <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "6px 10px", fontSize: 12 }}>
        {salvando ? "Salvando…" : "Salvar"}
      </Button>
      <Button type="button" variant="secondary" onClick={onCancelar} style={{ padding: "6px 10px", fontSize: 12 }}>
        Cancelar
      </Button>
    </form>
  );
}
