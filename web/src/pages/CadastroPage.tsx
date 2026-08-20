import { useEffect, useState } from "react";
import {
  atualizarCenario,
  atualizarEmpreendimento,
  atualizarTipologia,
  criarCategoriaCusto,
  criarCenario,
  criarCondicaoPagamento,
  criarCronograma,
  criarCusto,
  criarEmpreendimento,
  criarPremissasVelocidade,
  criarTipologia,
  criarUnidadesEmLote,
  excluirCenario,
  excluirEmpreendimento,
  excluirTipologia,
  fetchCenarioDetalhe,
  fetchEmpreendimentoDetalhe,
  fetchEmpreendimentos,
  gerarVendas,
  type CategoriaCustoResumo,
  type CenarioDetalhe,
  type EmpreendimentoDetalhe,
  type EmpreendimentoResumo,
  type ModalidadeInput,
  type TipoDistribuicao,
  type TipoIncidenciaCusto,
} from "../api/client.js";
import { Button } from "../components/Button.js";
import { TextField } from "../components/TextField.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { formatBRL } from "../format.js";

export function CadastroPage() {
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoResumo[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<EmpreendimentoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(true);

  function recarregarLista(selecionarId?: string) {
    setCarregandoLista(true);
    fetchEmpreendimentos()
      .then((emps) => {
        setEmpreendimentos(emps);
        if (selecionarId) setSelecionadoId(selecionarId);
        else if (!selecionadoId && emps[0]) setSelecionadoId(emps[0].id);
      })
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCarregandoLista(false));
  }

  useEffect(() => {
    recarregarLista();
  }, []);

  function recarregarDetalhe() {
    if (!selecionadoId) {
      setDetalhe(null);
      return;
    }
    fetchEmpreendimentoDetalhe(selecionadoId)
      .then(setDetalhe)
      .catch((e) => setErro(String(e.message ?? e)));
  }

  useEffect(() => {
    recarregarDetalhe();
  }, [selecionadoId]);

  async function excluirEmpreendimentoSelecionado(id: string) {
    await excluirEmpreendimento(id);
    const emps = await fetchEmpreendimentos();
    setEmpreendimentos(emps);
    setSelecionadoId(emps[0]?.id ?? null);
  }

  return (
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>Empreendimento · Tipologia · Unidade</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Cadastro</div>
        </div>
        <ThemeToggle />
      </div>

      {erro && (
        <div style={{ background: "var(--status-critical-soft-bg)", border: "1px solid var(--status-critical)", borderRadius: 10, padding: "12px 16px", color: "var(--status-critical-text)", fontSize: 13 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
        <ListaEmpreendimentos
          empreendimentos={empreendimentos}
          carregando={carregandoLista}
          selecionadoId={selecionadoId}
          onSelecionar={setSelecionadoId}
          onCriado={(id) => recarregarLista(id)}
          onErro={setErro}
        />

        {detalhe && (
          <DetalheEmpreendimento
            key={detalhe.id}
            detalhe={detalhe}
            onAtualizado={recarregarDetalhe}
            onExcluido={() => excluirEmpreendimentoSelecionado(detalhe.id)}
            onErro={setErro}
          />
        )}
      </div>
    </div>
  );
}

function Painel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>{titulo}</div>
      {children}
    </div>
  );
}

function ListaEmpreendimentos({
  empreendimentos,
  carregando,
  selecionadoId,
  onSelecionar,
  onCriado,
  onErro,
}: {
  empreendimentos: EmpreendimentoResumo[];
  carregando: boolean;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  onCriado: (id: string) => void;
  onErro: (msg: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [incorporador, setIncorporador] = useState("");
  const [endereco, setEndereco] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const criado = await criarEmpreendimento({
        nome,
        incorporador: incorporador || undefined,
        endereco: endereco || undefined,
      });
      setNome("");
      setIncorporador("");
      setEndereco("");
      onCriado(criado.id);
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Painel titulo="Empreendimentos">
        {carregando && <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Carregando…</div>}
        {!carregando && empreendimentos.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Nenhum empreendimento cadastrado ainda.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {empreendimentos.map((emp) => (
            <button
              key={emp.id}
              onClick={() => onSelecionar(emp.id)}
              style={{
                textAlign: "left",
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                background: emp.id === selecionadoId ? "var(--accent-soft-bg)" : "transparent",
                color: emp.id === selecionadoId ? "var(--accent-text)" : "var(--ink-primary)",
                fontFamily: "var(--font-ui)",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {emp.nome}
            </button>
          ))}
        </div>
      </Painel>

      <Painel titulo="Novo empreendimento">
        <form onSubmit={submeter} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <TextField label="Incorporador" value={incorporador} onChange={(e) => setIncorporador(e.target.value)} />
          <TextField label="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          <Button type="submit" disabled={salvando || !nome.trim()}>
            {salvando ? "Salvando…" : "Criar empreendimento"}
          </Button>
        </form>
      </Painel>
    </div>
  );
}

function DetalheEmpreendimento({
  detalhe,
  onAtualizado,
  onExcluido,
  onErro,
}: {
  detalhe: EmpreendimentoDetalhe;
  onAtualizado: () => void;
  onExcluido: () => Promise<void>;
  onErro: (msg: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <EmpreendimentoHeader detalhe={detalhe} onAtualizado={onAtualizado} onExcluido={onExcluido} onErro={onErro} />

      <Painel titulo="Tipologias">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {detalhe.tipologias.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Nenhuma tipologia cadastrada ainda.</div>
          )}
          {detalhe.tipologias.map((t) => (
            <CartaoTipologia key={t.id} tipologia={t} onAtualizado={onAtualizado} onErro={onErro} />
          ))}
        </div>

        <NovaTipologiaForm empreendimentoId={detalhe.id} onCriada={onAtualizado} onErro={onErro} />
      </Painel>

      <Painel titulo="Categorias de custo">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {detalhe.categoriasCusto.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Nenhuma categoria de custo cadastrada ainda.</div>
          )}
          {detalhe.categoriasCusto.map((cc) => (
            <div key={cc.id} style={{ fontSize: 12.5, color: "var(--ink-secondary)" }}>
              <span style={{ fontWeight: 700, color: "var(--ink-primary)" }}>{cc.nome}</span>
              {" — "}
              {ROTULO_INCIDENCIA[cc.tipoIncidencia]}
            </div>
          ))}
        </div>

        <NovaCategoriaCustoForm empreendimentoId={detalhe.id} onCriada={onAtualizado} onErro={onErro} />
      </Painel>

      <Painel titulo="Cenários">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {detalhe.cenarios.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Nenhum cenário cadastrado ainda.</div>
          )}
          {detalhe.cenarios.map((c) => (
            <CartaoCenario key={c.id} cenarioResumo={c} onAtualizado={onAtualizado} onErro={onErro} />
          ))}
        </div>

        <NovoCenarioForm empreendimentoId={detalhe.id} onCriado={onAtualizado} onErro={onErro} />
      </Painel>
    </div>
  );
}

function EmpreendimentoHeader({
  detalhe,
  onAtualizado,
  onExcluido,
  onErro,
}: {
  detalhe: EmpreendimentoDetalhe;
  onAtualizado: () => void;
  onExcluido: () => Promise<void>;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(detalhe.nome);
  const [incorporador, setIncorporador] = useState(detalhe.incorporador ?? "");
  const [endereco, setEndereco] = useState(detalhe.endereco ?? "");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarEmpreendimento(detalhe.id, { nome, incorporador: incorporador || null, endereco: endereco || null });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir "${detalhe.nome}" e tudo cadastrado nele (tipologias, unidades, cenários, vendas)? Esta ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    try {
      await onExcluido();
    } catch (e: any) {
      onErro(String(e.message ?? e));
      setExcluindo(false);
    }
  }

  if (editando) {
    return (
      <Painel titulo="Editar empreendimento">
        <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <TextField label="Incorporador" value={incorporador} onChange={(e) => setIncorporador(e.target.value)} />
          <TextField label="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="submit" disabled={salvando || !nome.trim()}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Painel>
    );
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>{detalhe.nome}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
            Editar
          </Button>
          <Button variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
            {excluindo ? "Excluindo…" : "Excluir"}
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-secondary)", display: "flex", flexDirection: "column", gap: 3 }}>
        <div>{detalhe.incorporador || <span style={{ color: "var(--ink-muted)" }}>Incorporador não informado</span>}</div>
        <div>{detalhe.endereco || <span style={{ color: "var(--ink-muted)" }}>Endereço não informado</span>}</div>
      </div>
    </div>
  );
}

function NovoCenarioForm({
  empreendimentoId,
  onCriado,
  onErro,
}: {
  empreendimentoId: string;
  onCriado: () => void;
  onErro: (msg: string) => void;
}) {
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
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
        >
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

function CartaoCenario({
  cenarioResumo,
  onAtualizado,
  onErro,
}: {
  cenarioResumo: EmpreendimentoDetalhe["cenarios"][number];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [detalhe, setDetalhe] = useState<CenarioDetalhe | null>(null);
  const [tipologiaId, setTipologiaId] = useState("");
  const [mes, setMes] = useState("");
  const [unidadesPrevistas, setUnidadesPrevistas] = useState("");
  const [salvandoPremissa, setSalvandoPremissa] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [resultadoGeracao, setResultadoGeracao] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState(cenarioResumo.nome);
  const [horizonteEdicao, setHorizonteEdicao] = useState(String(cenarioResumo.horizonteProjecaoMeses));
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoEdicao(true);
    try {
      await atualizarCenario(cenarioResumo.id, { nome: nomeEdicao, horizonteProjecaoMeses: Number(horizonteEdicao) });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir o cenário "${cenarioResumo.nome}"? As vendas geradas neste cenário serão apagadas e as unidades voltam para o estoque.`)) return;
    setExcluindo(true);
    try {
      await excluirCenario(cenarioResumo.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
      setExcluindo(false);
    }
  }

  function recarregar() {
    fetchCenarioDetalhe(cenarioResumo.id)
      .then((d) => {
        setDetalhe(d);
        if (!tipologiaId && d.tipologiasDisponiveis[0]) setTipologiaId(d.tipologiasDisponiveis[0].id);
      })
      .catch((e) => onErro(String(e.message ?? e)));
  }

  useEffect(() => {
    if (expandido && !detalhe) recarregar();
  }, [expandido]);

  async function adicionarPremissa(e: React.FormEvent) {
    e.preventDefault();
    if (!tipologiaId) return;
    setSalvandoPremissa(true);
    try {
      await criarPremissasVelocidade(cenarioResumo.id, [{ tipologiaId, mes: Number(mes), unidadesPrevistas }]);
      setMes("");
      setUnidadesPrevistas("");
      recarregar();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoPremissa(false);
    }
  }

  async function executarGeracaoVendas() {
    setGerando(true);
    setResultadoGeracao(null);
    try {
      const r = await gerarVendas(cenarioResumo.id);
      setResultadoGeracao(`${r.totalVendasCriadas} venda(s) gerada(s) — confira em Fluxo de caixa.`);
      recarregar();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setGerando(false);
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

  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-primary)" }}>{cenarioResumo.nome}</div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
            {cenarioResumo.tipo} · {cenarioResumo.horizonteProjecaoMeses} meses
            {detalhe && ` · ${detalhe.totalVendasGeradas} venda(s) gerada(s)`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setExpandido((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {expandido ? "Fechar" : "Detalhes do cenário"}
          </Button>
          <Button variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
            Editar
          </Button>
          <Button variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
            {excluindo ? "Excluindo…" : "Excluir"}
          </Button>
        </div>
      </div>

      {expandido && detalhe && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
              Velocidade de vendas
            </div>
            {detalhe.tipologiasDisponiveis.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Cadastre uma tipologia antes de definir velocidade de vendas.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {detalhe.premissasVelocidade.length > 0 && (
                  <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                        <th style={{ fontWeight: 600, paddingBottom: 4 }}>Tipologia</th>
                        <th style={{ fontWeight: 600, paddingBottom: 4 }}>Mês</th>
                        <th style={{ fontWeight: 600, paddingBottom: 4 }}>Unidades</th>
                      </tr>
                    </thead>
                    <tbody style={{ font: "var(--text-mono-body)" }}>
                      {detalhe.premissasVelocidade.map((p) => (
                        <tr key={p.id}>
                          <td style={{ padding: "2px 0" }}>{p.tipologiaNome}</td>
                          <td>{p.mes}</td>
                          <td>{p.unidadesPrevistas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <form onSubmit={adicionarPremissa} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 150 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Tipologia</span>
                    <select
                      value={tipologiaId}
                      onChange={(e) => setTipologiaId(e.target.value)}
                      style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
                    >
                      {detalhe.tipologiasDisponiveis.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ width: 80 }}>
                    <TextField label="Mês" type="number" min={1} value={mes} onChange={(e) => setMes(e.target.value)} required />
                  </div>
                  <div style={{ width: 100 }}>
                    <TextField label="Unidades" type="number" min={1} value={unidadesPrevistas} onChange={(e) => setUnidadesPrevistas(e.target.value)} required />
                  </div>
                  <Button type="submit" disabled={salvandoPremissa}>
                    {salvandoPremissa ? "Salvando…" : "Adicionar"}
                  </Button>
                </form>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Button onClick={executarGeracaoVendas} disabled={gerando || detalhe.premissasVelocidade.length === 0}>
                    {gerando ? "Gerando…" : "Gerar vendas"}
                  </Button>
                  {resultadoGeracao && (
                    <span style={{ fontSize: 12.5, color: "var(--status-good-text)", fontWeight: 600 }}>{resultadoGeracao}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
              Cronograma físico-financeiro
            </div>
            <CronogramaSecao cenarioId={cenarioResumo.id} cronograma={detalhe.cronograma} onAtualizado={recarregar} onErro={onErro} />
          </div>

          <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
              Custos
            </div>
            <CustosSecao
              cenarioId={cenarioResumo.id}
              custos={detalhe.custos}
              categoriasDisponiveis={detalhe.categoriasCustoDisponiveis}
              onAtualizado={recarregar}
              onErro={onErro}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CronogramaSecao({
  cenarioId,
  cronograma,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  cronograma: CenarioDetalhe["cronograma"];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [pontos, setPontos] = useState<{ mes: string; percentualExecucaoMensal: string }[]>([{ mes: "1", percentualExecucaoMensal: "" }]);
  const [salvando, setSalvando] = useState(false);

  const soma = pontos.reduce((acc, p) => acc + (Number(p.percentualExecucaoMensal) || 0), 0);
  const somaFecha = Math.abs(soma - 1) < 0.001;

  function atualizarPonto(i: number, patch: Partial<{ mes: string; percentualExecucaoMensal: string }>) {
    setPontos((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function adicionarLinha() {
    setPontos((rows) => [...rows, { mes: String(rows.length + 1), percentualExecucaoMensal: "" }]);
  }

  function removerLinha(i: number) {
    setPontos((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarCronograma(
        cenarioId,
        pontos.map((p) => ({ mes: Number(p.mes), percentualExecucaoMensal: p.percentualExecucaoMensal })),
      );
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  if (cronograma.length > 0) {
    return (
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
            <th style={{ fontWeight: 600, paddingBottom: 4 }}>Mês</th>
            <th style={{ fontWeight: 600, paddingBottom: 4 }}>% de execução</th>
          </tr>
        </thead>
        <tbody style={{ font: "var(--text-mono-body)" }}>
          {cronograma.map((p) => (
            <tr key={p.mes}>
              <td style={{ padding: "2px 0" }}>{p.mes}</td>
              <td>{(Number(p.percentualExecucaoMensal) * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <form onSubmit={submeter} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {pontos.map((p, i) => (
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
          {pontos.length > 1 && (
            <Button type="button" variant="secondary" onClick={() => removerLinha(i)} style={{ padding: "8px 10px", fontSize: 12 }}>
              Remover
            </Button>
          )}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button type="button" variant="secondary" onClick={adicionarLinha} style={{ padding: "6px 10px", fontSize: 12 }}>
          + Mês
        </Button>
        <span style={{ fontSize: 12, fontWeight: 600, color: somaFecha ? "var(--status-good-text)" : "var(--status-warning-text)" }}>
          Soma: {(soma * 100).toFixed(1)}% {somaFecha ? "" : "(precisa fechar em 100%)"}
        </span>
        <Button type="submit" disabled={salvando || !somaFecha}>
          {salvando ? "Salvando…" : "Salvar cronograma"}
        </Button>
      </div>
    </form>
  );
}

function CustosSecao({
  cenarioId,
  custos,
  categoriasDisponiveis,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  custos: CenarioDetalhe["custos"];
  categoriasDisponiveis: CategoriaCustoResumo[];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [categoriaId, setCategoriaId] = useState(categoriasDisponiveis[0]?.id ?? "");
  const [valorPrevisto, setValorPrevisto] = useState("");
  const [percentual, setPercentual] = useState("");
  const [competenciaMes, setCompetenciaMes] = useState("");
  const [recorrencia, setRecorrencia] = useState<"unico" | "mensal">("unico");
  const [salvando, setSalvando] = useState(false);

  const categoriaSelecionada = categoriasDisponiveis.find((c) => c.id === categoriaId);
  const incidenciaPorValor = categoriaSelecionada?.tipoIncidencia === "fixo" || categoriaSelecionada?.tipoIncidencia === "pct_execucao";

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    if (!categoriaId) return;
    setSalvando(true);
    try {
      await criarCusto(cenarioId, {
        categoriaId,
        valorPrevisto: incidenciaPorValor ? valorPrevisto : undefined,
        percentual: incidenciaPorValor ? undefined : percentual,
        competenciaMes: categoriaSelecionada?.tipoIncidencia === "fixo" ? Number(competenciaMes) : undefined,
        recorrencia: categoriaSelecionada?.tipoIncidencia === "fixo" ? recorrencia : undefined,
      });
      setValorPrevisto("");
      setPercentual("");
      setCompetenciaMes("");
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  if (categoriasDisponiveis.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Cadastre uma categoria de custo antes de lançar custos.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {custos.length > 0 && (
        <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Categoria</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Valor</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Mês</th>
            </tr>
          </thead>
          <tbody style={{ font: "var(--text-mono-body)" }}>
            {custos.map((c) => (
              <tr key={c.id}>
                <td style={{ padding: "2px 0" }}>{c.categoriaNome}</td>
                <td>{c.valorPrevisto ? formatBRL(c.valorPrevisto) : `${(Number(c.percentual) * 100).toFixed(1)}%`}</td>
                <td>{c.competenciaMes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={submeter} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 190 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Categoria</span>
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          >
            {categoriasDisponiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        {incidenciaPorValor ? (
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
              <select
                value={recorrencia}
                onChange={(e) => setRecorrencia(e.target.value as "unico" | "mensal")}
                style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
              >
                <option value="unico">Único</option>
                <option value="mensal">Mensal</option>
              </select>
            </label>
          </>
        )}
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Adicionar"}
        </Button>
      </form>
    </div>
  );
}

function CartaoTipologia({
  tipologia,
  onAtualizado,
  onErro,
}: {
  tipologia: EmpreendimentoDetalhe["tipologias"][number];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [expandidoCondicao, setExpandidoCondicao] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState(tipologia.nome);
  const [areaEdicao, setAreaEdicao] = useState(tipologia.areaPrivativaPadrao ?? "");
  const [precoEdicao, setPrecoEdicao] = useState(tipologia.precoUnitarioPadrao ?? "");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [precoVenda, setPrecoVenda] = useState(tipologia.precoUnitarioPadrao ?? "");
  const [areaPrivativa, setAreaPrivativa] = useState(tipologia.areaPrivativaPadrao ?? "");
  const [prefixoNumero, setPrefixoNumero] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoEdicao(true);
    try {
      await atualizarTipologia(tipologia.id, {
        nome: nomeEdicao,
        areaPrivativaPadrao: areaEdicao || null,
        precoUnitarioPadrao: precoEdicao || null,
      });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir a tipologia "${tipologia.nome}"?`)) return;
    setExcluindo(true);
    try {
      await excluirTipologia(tipologia.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setExcluindo(false);
    }
  }

  async function gerarUnidades(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarUnidadesEmLote(tipologia.id, {
        quantidade: Number(quantidade),
        precoVenda,
        areaPrivativa: areaPrivativa || undefined,
        prefixoNumero,
      });
      setQuantidade("");
      setPrefixoNumero("");
      setExpandido(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2)" }}>
        <form onSubmit={salvarEdicao} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <TextField label="Nome" value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} required />
          </div>
          <div style={{ width: 110 }}>
            <TextField label="Área padrão (m²)" value={areaEdicao} onChange={(e) => setAreaEdicao(e.target.value)} />
          </div>
          <div style={{ width: 140 }}>
            <TextField label="Preço padrão" value={precoEdicao} onChange={(e) => setPrecoEdicao(e.target.value)} />
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

  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-primary)" }}>{tipologia.nome}</div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2, font: "var(--text-mono-body)" }}>
            {tipologia.areaPrivativaPadrao ? `${tipologia.areaPrivativaPadrao} m²` : "área não informada"}
            {" · "}
            {tipologia.precoUnitarioPadrao ? formatBRL(tipologia.precoUnitarioPadrao) : "preço não informado"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--accent-2-text)",
              background: "var(--accent-2-soft-bg)",
              borderRadius: 999,
              padding: "3px 9px",
            }}
          >
            {tipologia.quantidadeUnidades} unidade{tipologia.quantidadeUnidades === 1 ? "" : "s"}
          </span>
          <Button variant="secondary" onClick={() => setExpandidoCondicao((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {expandidoCondicao ? "Cancelar" : "Condição de pagamento"}
          </Button>
          <Button variant="secondary" onClick={() => setExpandido((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {expandido ? "Cancelar" : "Gerar unidades"}
          </Button>
          <Button variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
            Editar
          </Button>
          <Button variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
            {excluindo ? "Excluindo…" : "Excluir"}
          </Button>
        </div>
      </div>

      {tipologia.condicoesPagamento.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          {tipologia.condicoesPagamento.map((cp) => (
            <div key={cp.id} style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
              <span style={{ fontWeight: 700, color: "var(--ink-primary)" }}>{cp.nome}</span>
              {" — "}
              {cp.modalidades.map((m) => `${m.nome} ${(Number(m.percentual) * 100).toFixed(0)}%`).join(", ")}
            </div>
          ))}
        </div>
      )}

      {expandido && (
        <form onSubmit={gerarUnidades} style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 90 }}>
            <TextField label="Quantidade" type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
          </div>
          <div style={{ width: 140 }}>
            <TextField label="Preço de venda" value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} placeholder="310000" required />
          </div>
          <div style={{ width: 100 }}>
            <TextField label="Área (m²)" value={areaPrivativa} onChange={(e) => setAreaPrivativa(e.target.value)} placeholder="28.5" />
          </div>
          <div style={{ width: 90 }}>
            <TextField label="Prefixo" value={prefixoNumero} onChange={(e) => setPrefixoNumero(e.target.value)} placeholder="ST" required />
          </div>
          <Button type="submit" disabled={salvando}>
            {salvando ? "Gerando…" : "Gerar"}
          </Button>
        </form>
      )}

      {expandidoCondicao && (
        <CondicaoPagamentoForm
          tipologiaId={tipologia.id}
          onCriada={() => {
            setExpandidoCondicao(false);
            onAtualizado();
          }}
          onErro={onErro}
        />
      )}
    </div>
  );
}

const ROTULO_INCIDENCIA: Record<TipoIncidenciaCusto, string> = {
  fixo: "Valor fixo",
  pct_vgv_vendido_no_mes: "% do vendido no mês",
  pct_recebido_mes_anterior: "% do recebido no mês anterior",
  pct_execucao: "% da curva de execução (cronograma)",
};

function NovaCategoriaCustoForm({
  empreendimentoId,
  onCriada,
  onErro,
}: {
  empreendimentoId: string;
  onCriada: () => void;
  onErro: (msg: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [tipoIncidencia, setTipoIncidencia] = useState<TipoIncidenciaCusto>("fixo");
  const [salvando, setSalvando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarCategoriaCusto(empreendimentoId, { nome, tipoIncidencia });
      setNome("");
      onCriada();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submeter} style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-subtle)", alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <TextField label="Nova categoria" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Comissão de vendas" required />
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 240 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Incidência</span>
        <select
          value={tipoIncidencia}
          onChange={(e) => setTipoIncidencia(e.target.value as TipoIncidenciaCusto)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
        >
          {(Object.keys(ROTULO_INCIDENCIA) as TipoIncidenciaCusto[]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_INCIDENCIA[t]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={salvando || !nome.trim()}>
        {salvando ? "Salvando…" : "Adicionar"}
      </Button>
    </form>
  );
}

const TIPOS_DISTRIBUICAO: { valor: TipoDistribuicao; rotulo: string }[] = [
  { valor: "unica_na_venda", rotulo: "Única (no ato)" },
  { valor: "nivelada", rotulo: "Nivelada até o fim" },
  { valor: "periodica", rotulo: "Periódica" },
  { valor: "mes_fixo", rotulo: "Mês fixo" },
];

function CondicaoPagamentoForm({
  tipologiaId,
  onCriada,
  onErro,
}: {
  tipologiaId: string;
  onCriada: () => void;
  onErro: (msg: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [modalidades, setModalidades] = useState<ModalidadeInput[]>([
    { nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" },
  ]);
  const [salvando, setSalvando] = useState(false);

  const soma = modalidades.reduce((acc, m) => acc + (Number(m.percentual) || 0), 0);
  const somaFecha = Math.abs(soma - 1) < 0.001;

  function atualizarModalidade(i: number, patch: Partial<ModalidadeInput>) {
    setModalidades((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function adicionarLinha() {
    setModalidades((rows) => [...rows, { nome: "", percentual: "", tipoDistribuicao: "nivelada" }]);
  }

  function removerLinha(i: number) {
    setModalidades((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarCondicaoPagamento(tipologiaId, { nome, modalidades });
      onCriada();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submeter} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ width: 220 }}>
        <TextField label="Nome da condição" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Padrão" required />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {modalidades.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 130 }}>
              <TextField label="Modalidade" value={m.nome} onChange={(e) => atualizarModalidade(i, { nome: e.target.value })} placeholder="Parcelas" required />
            </div>
            <div style={{ width: 90 }}>
              <TextField label="% (0–1)" value={m.percentual} onChange={(e) => atualizarModalidade(i, { percentual: e.target.value })} placeholder="0.3" required />
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 160 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Distribuição</span>
              <select
                value={m.tipoDistribuicao}
                onChange={(e) => atualizarModalidade(i, { tipoDistribuicao: e.target.value as TipoDistribuicao })}
                style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
              >
                {TIPOS_DISTRIBUICAO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </label>
            {m.tipoDistribuicao === "periodica" && (
              <div style={{ width: 100 }}>
                <TextField
                  label="A cada (meses)"
                  type="number"
                  min={1}
                  value={m.periodicidadeMeses ?? ""}
                  onChange={(e) => atualizarModalidade(i, { periodicidadeMeses: Number(e.target.value) })}
                  required
                />
              </div>
            )}
            {m.tipoDistribuicao === "mes_fixo" && (
              <div style={{ width: 90 }}>
                <TextField
                  label="Mês"
                  type="number"
                  min={1}
                  value={m.mesFixo ?? ""}
                  onChange={(e) => atualizarModalidade(i, { mesFixo: Number(e.target.value) })}
                  required
                />
              </div>
            )}
            {modalidades.length > 1 && (
              <Button type="button" variant="secondary" onClick={() => removerLinha(i)} style={{ padding: "8px 10px", fontSize: 12 }}>
                Remover
              </Button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button type="button" variant="secondary" onClick={adicionarLinha} style={{ padding: "6px 10px", fontSize: 12 }}>
          + Modalidade
        </Button>
        <span style={{ fontSize: 12, fontWeight: 600, color: somaFecha ? "var(--status-good-text)" : "var(--status-warning-text)" }}>
          Soma: {(soma * 100).toFixed(1)}% {somaFecha ? "" : "(precisa fechar em 100%)"}
        </span>
        <Button type="submit" disabled={salvando || !somaFecha || !nome.trim()}>
          {salvando ? "Salvando…" : "Salvar condição"}
        </Button>
      </div>
    </form>
  );
}

function NovaTipologiaForm({
  empreendimentoId,
  onCriada,
  onErro,
}: {
  empreendimentoId: string;
  onCriada: () => void;
  onErro: (msg: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [areaPrivativaPadrao, setAreaPrivativaPadrao] = useState("");
  const [precoUnitarioPadrao, setPrecoUnitarioPadrao] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarTipologia(empreendimentoId, {
        nome,
        areaPrivativaPadrao: areaPrivativaPadrao || undefined,
        precoUnitarioPadrao: precoUnitarioPadrao || undefined,
      });
      setNome("");
      setAreaPrivativaPadrao("");
      setPrecoUnitarioPadrao("");
      onCriada();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submeter} style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-subtle)", alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <TextField label="Nova tipologia" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Studio Compacto" required />
      </div>
      <div style={{ width: 110 }}>
        <TextField label="Área padrão (m²)" value={areaPrivativaPadrao} onChange={(e) => setAreaPrivativaPadrao(e.target.value)} placeholder="28.5" />
      </div>
      <div style={{ width: 140 }}>
        <TextField label="Preço padrão" value={precoUnitarioPadrao} onChange={(e) => setPrecoUnitarioPadrao(e.target.value)} placeholder="310000" />
      </div>
      <Button type="submit" disabled={salvando || !nome.trim()}>
        {salvando ? "Salvando…" : "Adicionar"}
      </Button>
    </form>
  );
}
