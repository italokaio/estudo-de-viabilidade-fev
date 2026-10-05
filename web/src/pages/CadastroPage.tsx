import { PermissoesProvider, PermitidoEditar, PermitidoExcluir, nivelDoEmpreendimento } from "../permissoes";
import { textoImpactoExclusao } from "../impactoExclusao";
import { useEffect, useState } from "react";
import {
  atualizarCategoriaCusto,
  atualizarCenario,
  atualizarCondicaoPagamento,
  atualizarCusto,
  atualizarDestinatarioComissao,
  atualizarEmpreendimento,
  atualizarTipologia,
  criarCategoriaCusto,
  criarCenario,
  criarCondicaoPagamento,
  criarContrapartePermuta,
  criarCronograma,
  substituirCronograma,
  criarCusto,
  criarDestinatarioComissao,
  criarFaixaComissao,
  criarEmpreendimento,
  atualizarPrecoUnidade,
  atualizarPremissaVelocidade,
  criarPremissasVelocidade,
  excluirPremissaVelocidade,
  criarTerreno,
  criarTipologia,
  atualizarPermuta,
  criarUnidadesEmLote,
  criarUnidadesPorAndar,
  definirFinanciamento,
  definirPontoIndiceCorrecao,
  atualizarTerreno,
  excluirTerreno,
  desfazerDistrato,
  desfazerPermuta,
  excluirCategoriaCusto,
  duplicarCenario,
  excluirCenario,
  fetchImpactoExclusaoCenario,
  fetchImpactoExclusaoEmpreendimento,
  excluirCondicaoPagamento,
  excluirContrapartePermuta,
  excluirCronograma,
  excluirCusto,
  excluirDestinatarioComissao,
  excluirFaixaComissao,
  excluirEmpreendimento,
  excluirFinanciamento,
  excluirPontoIndiceCorrecao,
  excluirTipologia,
  fetchCenarioDetalhe,
  fetchEmpreendimentoDetalhe,
  fetchEmpreendimentos,
  fetchUnidades,
  gerarVendas,
  registrarDistrato,
  registrarPermuta,
  registrarRenegociacao,
  type CategoriaCustoResumo,
  type CenarioDetalhe,
  type EmpreendimentoDetalhe,
  type EmpreendimentoResumo,
  type FormaAquisicaoTerreno,
  type ModalidadeInput,
  type StatusValidacaoArea,
  type TipoAmortizacao,
  type TipoDistribuicao,
  type PapelCategoriaCusto,
  type TipoIncidenciaCusto,
  type TipoIncrementoAndar,
  type UnidadeResumo,
  atualizarContrapartePermuta,
  atualizarFaixaComissao,
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

  return <PermissoesProvider nivel={nivelDoEmpreendimento(empreendimentos, selecionadoId)}>(
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }} onClickCapture={() => setErro(null)} onSubmitCapture={() => setErro(null)}>
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
  )</PermissoesProvider>;
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
          <Button requer="criarEmpreendimento" type="submit" disabled={salvando || !nome.trim()}>
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

      <Painel titulo="Terreno">
        <TerrenoSecao empreendimentoId={detalhe.id} terrenos={detalhe.terrenos} onAtualizado={onAtualizado} onErro={onErro} />
      </Painel>

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
            <LinhaCategoriaCusto key={cc.id} categoria={cc} onAtualizado={onAtualizado} onErro={onErro} />
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
            <CartaoCenario key={c.id} empreendimentoId={detalhe.id} cenarioResumo={c} onAtualizado={onAtualizado} onErro={onErro} />
          ))}
        </div>

        <NovoCenarioForm empreendimentoId={detalhe.id} onCriado={onAtualizado} onErro={onErro} />
      </Painel>
    </div>
  );
}

const selectFieldStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-primary)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
};

/**
 * Múltiplas matrículas/áreas por empreendimento (achado F26, docs/DECISOES.md):
 * até essa fatia era um único terreno por empreendimento (upsert); agora é
 * uma lista, mesmo padrão de CustosSecao — cada matrícula tem seu próprio
 * "Editar"/"Excluir", mais um formulário de "adicionar" abaixo da lista.
 */
function TerrenoSecao({
  empreendimentoId,
  terrenos,
  onAtualizado,
  onErro,
}: {
  empreendimentoId: string;
  terrenos: EmpreendimentoDetalhe["terrenos"];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {terrenos.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Nenhuma matrícula cadastrada ainda.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {terrenos.map((t) => (
            <LinhaTerreno key={t.id} terreno={t} onAtualizado={onAtualizado} onErro={onErro} />
          ))}
        </div>
      )}
      <NovoTerrenoForm empreendimentoId={empreendimentoId} onCriado={onAtualizado} onErro={onErro} />
    </div>
  );
}

function CamposTerreno({
  numeroMatricula,
  setNumeroMatricula,
  areaValor,
  setAreaValor,
  areaUnidade,
  setAreaUnidade,
  areaStatusValidacao,
  setAreaStatusValidacao,
  formaAquisicao,
  setFormaAquisicao,
  areaObservacao,
  setAreaObservacao,
}: {
  numeroMatricula: string;
  setNumeroMatricula: (v: string) => void;
  areaValor: string;
  setAreaValor: (v: string) => void;
  areaUnidade: string;
  setAreaUnidade: (v: string) => void;
  areaStatusValidacao: StatusValidacaoArea;
  setAreaStatusValidacao: (v: StatusValidacaoArea) => void;
  formaAquisicao: FormaAquisicaoTerreno | "";
  setFormaAquisicao: (v: FormaAquisicaoTerreno | "") => void;
  areaObservacao: string;
  setAreaObservacao: (v: string) => void;
}) {
  return (
    <>
      <div style={{ width: 140 }}>
        <TextField label="Matrícula" value={numeroMatricula} onChange={(e) => setNumeroMatricula(e.target.value)} placeholder="nº no cartório" />
      </div>
      <div style={{ width: 100 }}>
        <TextField label="Área" value={areaValor} onChange={(e) => setAreaValor(e.target.value)} placeholder="5000" />
      </div>
      <div style={{ width: 70 }}>
        <TextField label="Unidade" value={areaUnidade} onChange={(e) => setAreaUnidade(e.target.value)} placeholder="m2" />
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Status</span>
        <select value={areaStatusValidacao} onChange={(e) => setAreaStatusValidacao(e.target.value as StatusValidacaoArea)} style={selectFieldStyle}>
          <option value="pendente">Pendente</option>
          <option value="validado">Validado</option>
          <option value="conflitante">Conflitante</option>
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Aquisição</span>
        <select value={formaAquisicao} onChange={(e) => setFormaAquisicao(e.target.value as FormaAquisicaoTerreno)} style={selectFieldStyle}>
          <option value="">—</option>
          <option value="compra">Compra</option>
          <option value="permuta">Permuta</option>
          <option value="misto">Misto</option>
        </select>
      </label>
      <div style={{ width: 220 }}>
        <TextField label="Observação" value={areaObservacao} onChange={(e) => setAreaObservacao(e.target.value)} placeholder="opcional" />
      </div>
    </>
  );
}

function LinhaTerreno({
  terreno,
  onAtualizado,
  onErro,
}: {
  terreno: EmpreendimentoDetalhe["terrenos"][number];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [numeroMatricula, setNumeroMatricula] = useState(terreno.numeroMatricula ?? "");
  const [areaValor, setAreaValor] = useState(terreno.areaValor ?? "");
  const [areaUnidade, setAreaUnidade] = useState(terreno.areaUnidade);
  const [areaStatusValidacao, setAreaStatusValidacao] = useState<StatusValidacaoArea>(terreno.areaStatusValidacao);
  const [areaObservacao, setAreaObservacao] = useState(terreno.areaObservacao ?? "");
  const [formaAquisicao, setFormaAquisicao] = useState<FormaAquisicaoTerreno | "">(terreno.formaAquisicao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarTerreno(terreno.id, {
        numeroMatricula: numeroMatricula || null,
        areaValor: areaValor || null,
        areaUnidade: areaUnidade || undefined,
        areaStatusValidacao,
        areaObservacao: areaObservacao || null,
        formaAquisicao: formaAquisicao || null,
      });
      setEditando(false);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir a matrícula "${terreno.numeroMatricula || terreno.id}"?`)) return;
    setExcluindo(true);
    try {
      await excluirTerreno(terreno.id);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setExcluindo(false);
    }
  }

  if (editando) {
    return (
      <form
        onSubmit={salvar}
        style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}
      >
        <CamposTerreno
          numeroMatricula={numeroMatricula}
          setNumeroMatricula={setNumeroMatricula}
          areaValor={areaValor}
          setAreaValor={setAreaValor}
          areaUnidade={areaUnidade}
          setAreaUnidade={setAreaUnidade}
          areaStatusValidacao={areaStatusValidacao}
          setAreaStatusValidacao={setAreaStatusValidacao}
          formaAquisicao={formaAquisicao}
          setFormaAquisicao={setFormaAquisicao}
          areaObservacao={areaObservacao}
          setAreaObservacao={setAreaObservacao}
        />
        <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "8px 12px", fontSize: 12.5 }}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "8px 12px", fontSize: 12.5 }}>
          Cancelar
        </Button>
      </form>
    );
  }

  const corStatus =
    terreno.areaStatusValidacao === "validado"
      ? "var(--status-good-text)"
      : terreno.areaStatusValidacao === "conflitante"
        ? "var(--status-critical-text)"
        : "var(--ink-muted)";

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
        {terreno.numeroMatricula && <span style={{ fontWeight: 700, color: "var(--ink-primary)" }}>{terreno.numeroMatricula} — </span>}
        {terreno.areaValor ? `${terreno.areaValor} ${terreno.areaUnidade}` : "Área não informada"}
        {" · "}
        <span style={{ color: corStatus, fontWeight: 600 }}>{terreno.areaStatusValidacao}</span>
        {terreno.formaAquisicao && ` · ${terreno.formaAquisicao}`}
        {terreno.areaObservacao && <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>{terreno.areaObservacao}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flex: "none" }}>
        <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Editar
        </Button>
        <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
          {excluindo ? "…" : "Excluir"}
        </Button>
      </div>
    </div>
  );
}

function NovoTerrenoForm({
  empreendimentoId,
  onCriado,
  onErro,
}: {
  empreendimentoId: string;
  onCriado: () => void;
  onErro: (msg: string) => void;
}) {
  const [numeroMatricula, setNumeroMatricula] = useState("");
  const [areaValor, setAreaValor] = useState("");
  const [areaUnidade, setAreaUnidade] = useState("m2");
  const [areaStatusValidacao, setAreaStatusValidacao] = useState<StatusValidacaoArea>("pendente");
  const [areaObservacao, setAreaObservacao] = useState("");
  const [formaAquisicao, setFormaAquisicao] = useState<FormaAquisicaoTerreno | "">("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarTerreno(empreendimentoId, {
        numeroMatricula: numeroMatricula || undefined,
        areaValor: areaValor || undefined,
        areaUnidade: areaUnidade || undefined,
        areaStatusValidacao,
        areaObservacao: areaObservacao || undefined,
        formaAquisicao: formaAquisicao || undefined,
      });
      setNumeroMatricula("");
      setAreaValor("");
      setAreaObservacao("");
      setFormaAquisicao("");
      onCriado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <CamposTerreno
        numeroMatricula={numeroMatricula}
        setNumeroMatricula={setNumeroMatricula}
        areaValor={areaValor}
        setAreaValor={setAreaValor}
        areaUnidade={areaUnidade}
        setAreaUnidade={setAreaUnidade}
        areaStatusValidacao={areaStatusValidacao}
        setAreaStatusValidacao={setAreaStatusValidacao}
        formaAquisicao={formaAquisicao}
        setFormaAquisicao={setFormaAquisicao}
        areaObservacao={areaObservacao}
        setAreaObservacao={setAreaObservacao}
      />
      <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "8px 12px", fontSize: 12.5 }}>
        {salvando ? "Salvando…" : "Adicionar matrícula"}
      </Button>
    </form>
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
    let impacto;
    try {
      impacto = await fetchImpactoExclusaoEmpreendimento(detalhe.id);
    } catch (e: any) {
      onErro(String(e.message ?? e));
      return;
    }
    if (!window.confirm(`Excluir "${detalhe.nome}" e tudo cadastrado nele (tipologias, unidades, cenários, vendas)? ${textoImpactoExclusao(impacto)} Esta ação não pode ser desfeita.`)) return;
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
            <Button requer="editar" type="submit" disabled={salvando || !nome.trim()}>
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
          <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
            Editar
          </Button>
          <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
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
      <Button requer="editar" type="submit" disabled={salvando || !nome.trim()}>
        {salvando ? "Salvando…" : "Adicionar"}
      </Button>
    </form>
  );
}

function CartaoCenario({
  empreendimentoId,
  cenarioResumo,
  onAtualizado,
  onErro,
}: {
  empreendimentoId: string;
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
  const [premissaEditandoId, setPremissaEditandoId] = useState<string | null>(null);
  const [unidadesEdicaoPremissa, setUnidadesEdicaoPremissa] = useState("");
  const [salvandoEdicaoPremissa, setSalvandoEdicaoPremissa] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [resultadoGeracao, setResultadoGeracao] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState(cenarioResumo.nome);
  const [horizonteEdicao, setHorizonteEdicao] = useState(String(cenarioResumo.horizonteProjecaoMeses));
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [nomeDuplicacao, setNomeDuplicacao] = useState(`${cenarioResumo.nome} (cópia)`);
  const [salvandoDuplicacao, setSalvandoDuplicacao] = useState(false);

  async function salvarDuplicacao(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoDuplicacao(true);
    try {
      await duplicarCenario(cenarioResumo.id, nomeDuplicacao);
      setDuplicando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoDuplicacao(false);
    }
  }

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
    let impacto;
    try {
      impacto = await fetchImpactoExclusaoCenario(cenarioResumo.id);
    } catch (e: any) {
      onErro(String(e.message ?? e));
      return;
    }
    if (!window.confirm(`Excluir o cenário "${cenarioResumo.nome}"? As vendas geradas neste cenário serão apagadas e as unidades voltam para o estoque. ${textoImpactoExclusao(impacto)} Esta ação não pode ser desfeita.`)) return;
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

  async function salvarEdicaoPremissa(premissaId: string) {
    setSalvandoEdicaoPremissa(true);
    try {
      await atualizarPremissaVelocidade(cenarioResumo.id, premissaId, { unidadesPrevistas: unidadesEdicaoPremissa });
      setPremissaEditandoId(null);
      recarregar();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoEdicaoPremissa(false);
    }
  }

  async function excluirPremissa(p: { id: string; tipologiaNome: string; mes: number; unidadesPrevistas: string }) {
    if (!window.confirm(`Excluir a premissa de ${p.unidadesPrevistas} unidade(s) de ${p.tipologiaNome} no mês ${p.mes}?`)) return;
    try {
      await excluirPremissaVelocidade(cenarioResumo.id, p.id);
      recarregar();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

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
          <Button requer="editar" type="submit" disabled={salvandoEdicao || !nomeEdicao.trim()}>
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
          <Button requer="editar" type="submit" disabled={salvandoDuplicacao || !nomeDuplicacao.trim()}>
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
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-primary)" }}>{cenarioResumo.nome}</div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
            {cenarioResumo.tipo} · {cenarioResumo.horizonteProjecaoMeses} meses
            {detalhe && ` · ${detalhe.totalVendasGeradas} venda(s) gerada(s)`}
          </div>
          {cenarioResumo.derivadoDeNome && (
            <div
              style={{
                display: "inline-block",
                marginTop: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--ink-muted)",
                background: "var(--surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                padding: "2px 8px",
              }}
            >
              Derivado de: {cenarioResumo.derivadoDeNome}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setExpandido((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {expandido ? "Fechar" : "Detalhes do cenário"}
          </Button>
          <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
            Editar
          </Button>
          <Button requer="editar" variant="secondary" onClick={() => setDuplicando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
            Duplicar
          </Button>
          <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
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
                        <th></th>
                      </tr>
                    </thead>
                    <tbody style={{ font: "var(--text-mono-body)" }}>
                      {detalhe.premissasVelocidade.map((p) => (
                        <tr key={p.id}>
                          <td style={{ padding: "2px 0" }}>{p.tipologiaNome}</td>
                          <td>{p.mes}</td>
                          <td>
                            {premissaEditandoId === p.id ? (
                              <input
                                value={unidadesEdicaoPremissa}
                                onChange={(e) => setUnidadesEdicaoPremissa(e.target.value)}
                                inputMode="decimal"
                                style={{ width: 80, font: "inherit", padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 6 }}
                              />
                            ) : (
                              p.unidadesPrevistas
                            )}
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {premissaEditandoId === p.id ? (
                              <>
                                <Button requer="editar" onClick={() => salvarEdicaoPremissa(p.id)} disabled={salvandoEdicaoPremissa} style={{ padding: "3px 8px", fontSize: 11 }}>
                                  {salvandoEdicaoPremissa ? "Salvando…" : "Salvar"}
                                </Button>{" "}
                                <Button variant="secondary" onClick={() => setPremissaEditandoId(null)} style={{ padding: "3px 8px", fontSize: 11 }}>
                                  Cancelar
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button requer="editar"
                                  variant="secondary"
                                  onClick={() => {
                                    setPremissaEditandoId(p.id);
                                    setUnidadesEdicaoPremissa(p.unidadesPrevistas);
                                  }}
                                  style={{ padding: "3px 8px", fontSize: 11 }}
                                >
                                  Editar
                                </Button>{" "}
                                <Button requer="excluir" variant="secondary" onClick={() => excluirPremissa(p)} style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
                                  Excluir
                                </Button>
                              </>
                            )}
                          </td>
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
                  <Button requer="editar" type="submit" disabled={salvandoPremissa}>
                    {salvandoPremissa ? "Salvando…" : "Adicionar"}
                  </Button>
                </form>
                {detalhe.avisos.map((aviso) => (
                  <div key={aviso} style={{ fontSize: 12, color: "var(--status-warning-text)" }}>
                    Aviso: {aviso}
                  </div>
                ))}

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Button requer="editar" onClick={executarGeracaoVendas} disabled={gerando || detalhe.premissasVelocidade.length === 0}>
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
              Índice de correção monetária
            </div>
            <IndiceCorrecaoSecao cenarioId={cenarioResumo.id} indicesCorrecao={detalhe.indicesCorrecao} onAtualizado={recarregar} onErro={onErro} />
          </div>

          <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
              Financiamento de produção
            </div>
            <FinanciamentoSecao cenarioId={cenarioResumo.id} financiamento={detalhe.financiamento} onAtualizado={recarregar} onErro={onErro} />
          </div>

          <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
              Alertas de risco
            </div>
            <AlertasConfigSecao
              cenarioId={cenarioResumo.id}
              limiteNecessidadeMaximaCapital={detalhe.limiteNecessidadeMaximaCapital}
              onAtualizado={recarregar}
              onErro={onErro}
            />
            <div style={{ height: 12 }} />
            <TaxaDescontoSecao
              cenarioId={cenarioResumo.id}
              taxaDescontoMensal={detalhe.taxaDescontoMensal}
              onAtualizado={recarregar}
              onErro={onErro}
            />
          </div>

          <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 8 }}>
              Custos
            </div>
            <CustosSecao
              empreendimentoId={empreendimentoId}
              cenarioId={cenarioResumo.id}
              custos={detalhe.custos}
              categoriasDisponiveis={detalhe.categoriasCustoDisponiveis}
              tipologiasDisponiveis={detalhe.tipologiasDisponiveis}
              gruposIndiceCorrecao={detalhe.indicesCorrecao}
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
  const [editando, setEditando] = useState(false);
  const [pontos, setPontos] = useState<{ mes: string; percentualExecucaoMensal: string }[]>(
    cronograma.length > 0
      ? cronograma.map((p) => ({ mes: String(p.mes), percentualExecucaoMensal: p.percentualExecucaoMensal }))
      : [{ mes: "1", percentualExecucaoMensal: "" }],
  );
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const soma = pontos.reduce((acc, p) => acc + (Number(p.percentualExecucaoMensal) || 0), 0);
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
    setPontos(cronograma.map((p) => ({ mes: String(p.mes), percentualExecucaoMensal: p.percentualExecucaoMensal })));
    setEditando(true);
  }

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
      // editar um cronograma existente e excluir + recriar (regra R6: soma=100%
      // precisa valer sempre, sem uma tela de diffing ponto a ponto).
      const pontosEnvio = pontos.map((p) => ({ mes: Number(p.mes), percentualExecucaoMensal: p.percentualExecucaoMensal }));
      if (cronograma.length > 0) await substituirCronograma(cenarioId, pontosEnvio);
      else await criarCronograma(cenarioId, pontosEnvio);
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  if (cronograma.length > 0 && !editando) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
        <div style={{ display: "flex", gap: 8 }}>
          <Button requer="editar" variant="secondary" onClick={editar} style={{ padding: "4px 8px", fontSize: 11 }}>
            Editar
          </Button>
          <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "4px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
            {excluindo ? "Excluindo…" : "Excluir cronograma"}
          </Button>
        </div>
      </div>
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
            <Button requer="editar" type="button" variant="secondary" onClick={() => removerLinha(i)} style={{ padding: "8px 10px", fontSize: 12 }}>
              Remover
            </Button>
          )}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
  );
}

function IndiceCorrecaoSecao({
  cenarioId,
  indicesCorrecao,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  indicesCorrecao: CenarioDetalhe["indicesCorrecao"];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [grupo, setGrupo] = useState("padrao");
  const [mes, setMes] = useState("1");
  const [percentual, setPercentual] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  // Grupos ja usados no cenario (achado F20, docs/DECISOES.md — "correcao
  // monetaria por indice diferenciado"): sugestao no datalist do formulario,
  // sempre incluindo "padrao" mesmo que ainda nao tenha nenhum ponto.
  const gruposConhecidos = Array.from(new Set(["padrao", ...indicesCorrecao.map((p) => p.grupo)]));
  const porGrupo = new Map<string, CenarioDetalhe["indicesCorrecao"]>();
  for (const p of indicesCorrecao) {
    const lista = porGrupo.get(p.grupo) ?? [];
    lista.push(p);
    porGrupo.set(p.grupo, lista);
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await definirPontoIndiceCorrecao(cenarioId, { grupo: grupo.trim() || "padrao", mes: Number(mes), percentual });
      setPercentual("");
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(grupoRemover: string, mesRemover: number) {
    const chave = `${grupoRemover}|${mesRemover}`;
    setExcluindo(chave);
    try {
      await excluirPontoIndiceCorrecao(cenarioId, grupoRemover, mesRemover);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setExcluindo(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {indicesCorrecao.length > 0 ? (
        Array.from(porGrupo.entries()).map(([g, pontos]) => (
          <div key={g}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)", marginBottom: 4 }}>
              {g === "padrao" ? "Padrão (vendas e demais custos)" : g}
            </div>
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                  <th style={{ fontWeight: 600, paddingBottom: 4 }}>Mês</th>
                  <th style={{ fontWeight: 600, paddingBottom: 4 }}>Variação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody style={{ font: "var(--text-mono-body)" }}>
                {pontos.map((p) => (
                  <tr key={p.mes}>
                    <td style={{ padding: "2px 0" }}>{p.mes}</td>
                    <td>{(Number(p.percentual) * 100).toFixed(2)}%</td>
                    <td style={{ textAlign: "right" }}>
                      <PermitidoExcluir><button
                        type="button"
                        onClick={() => remover(g, p.mes)}
                        disabled={excluindo === `${g}|${p.mes}`}
                        title="Remover"
                        style={{ border: "none", background: "transparent", color: "var(--status-critical-text)", cursor: "pointer", fontSize: 13, padding: 0 }}
                      >
                        ×
                      </button></PermitidoExcluir>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum índice cadastrado — o fluxo de caixa não aplica correção monetária.</div>
      )}

      <form onSubmit={adicionar} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ width: 130 }}>
          <TextField label="Grupo" list="grupos-indice-correcao" value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="padrao" required />
          <datalist id="grupos-indice-correcao">
            {gruposConhecidos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div style={{ width: 80 }}>
          <TextField label="Mês" type="number" min={1} value={mes} onChange={(e) => setMes(e.target.value)} required />
        </div>
        <div style={{ width: 150 }}>
          <TextField label="Variação (0–1)" value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="0.005 = 0,5%" required />
        </div>
        <Button requer="editar" type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Definir"}
        </Button>
      </form>
      <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
        O grupo "padrao" corrige as vendas e todo custo que não escolher outro grupo específico (aba de custos) — ex.: cadastre um grupo "obra" com a variação do INCC e associe apenas os custos de obra a ele.
      </div>
    </div>
  );
}

function FinanciamentoSecao({
  cenarioId,
  financiamento,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  financiamento: CenarioDetalhe["financiamento"];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valorContratado, setValorContratado] = useState(financiamento?.valorContratado ?? "");
  const [taxaJurosMensal, setTaxaJurosMensal] = useState(financiamento?.taxaJurosMensal ?? "");
  const [mesAmortizacao, setMesAmortizacao] = useState(financiamento ? String(financiamento.mesAmortizacao) : "");
  const [tipoAmortizacao, setTipoAmortizacao] = useState<TipoAmortizacao>(financiamento?.tipoAmortizacao ?? "unico");
  const [numeroParcelas, setNumeroParcelas] = useState(financiamento?.numeroParcelas ? String(financiamento.numeroParcelas) : "");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await definirFinanciamento(cenarioId, {
        valorContratado,
        taxaJurosMensal,
        mesAmortizacao: Number(mesAmortizacao),
        tipoAmortizacao,
        numeroParcelas: tipoAmortizacao === "unico" ? undefined : Number(numeroParcelas),
      });
      setEditando(false);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm("Excluir o financiamento deste cenário?")) return;
    setExcluindo(true);
    try {
      await excluirFinanciamento(cenarioId);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setExcluindo(false);
    }
  }

  if (editando || !financiamento) {
    return (
      <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 140 }}>
          <TextField label="Valor contratado" value={valorContratado} onChange={(e) => setValorContratado(e.target.value)} placeholder="1000000" required />
        </div>
        <div style={{ width: 130 }}>
          <TextField label="Juros mensal (0–1)" value={taxaJurosMensal} onChange={(e) => setTaxaJurosMensal(e.target.value)} placeholder="0.01" required />
        </div>
        <div style={{ width: 140 }}>
          <TextField
            label={tipoAmortizacao === "unico" ? "Mês de amortização" : "1ª parcela no mês"}
            type="number"
            min={1}
            value={mesAmortizacao}
            onChange={(e) => setMesAmortizacao(e.target.value)}
            required
          />
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 160 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Tabela de amortização</span>
          <select
            value={tipoAmortizacao}
            onChange={(e) => setTipoAmortizacao(e.target.value as TipoAmortizacao)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          >
            <option value="unico">Pagamento único</option>
            <option value="sac">SAC (amortização constante)</option>
            <option value="price">Price (parcela constante)</option>
          </select>
        </label>
        {tipoAmortizacao !== "unico" && (
          <div style={{ width: 120 }}>
            <TextField label="Nº de parcelas" type="number" min={1} value={numeroParcelas} onChange={(e) => setNumeroParcelas(e.target.value)} required />
          </div>
        )}
        <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "8px 12px", fontSize: 12.5 }}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        {financiamento && (
          <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "8px 12px", fontSize: 12.5 }}>
            Cancelar
          </Button>
        )}
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
        {formatBRL(financiamento.valorContratado)} contratados · {(Number(financiamento.taxaJurosMensal) * 100).toFixed(2)}% a.m. ·{" "}
        {financiamento.tipoAmortizacao === "unico"
          ? `amortização no mês ${financiamento.mesAmortizacao}`
          : `${financiamento.tipoAmortizacao === "sac" ? "SAC" : "Price"}, ${financiamento.numeroParcelas} parcelas a partir do mês ${financiamento.mesAmortizacao}`}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Editar
        </Button>
        <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
          {excluindo ? "Excluindo…" : "Excluir"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Limite de risco configurável por cenário (achado F15, docs/DECISOES.md
 * — "alertas de risco configuráveis"): sem valor definido, o motor usa o
 * padrão de 30% (`LIMITE_NECESSIDADE_MAXIMA_SOBRE_VGV_PADRAO`,
 * src/core/motorAlertas.ts) — a mesma regra desde a décima oitava fatia.
 */
function AlertasConfigSecao({
  cenarioId,
  limiteNecessidadeMaximaCapital,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  limiteNecessidadeMaximaCapital: string | null;
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(limiteNecessidadeMaximaCapital ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarCenario(cenarioId, { limiteNecessidadeMaximaCapital: valor.trim() || null });
      setEditando(false);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function restaurarPadrao() {
    setSalvando(true);
    try {
      await atualizarCenario(cenarioId, { limiteNecessidadeMaximaCapital: null });
      setValor("");
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 200 }}>
          <TextField label="Limite (0–1, ex.: 0.3 = 30%)" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.3" />
        </div>
        <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "8px 12px", fontSize: 12.5 }}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "8px 12px", fontSize: 12.5 }}>
          Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
        Necessidade máxima acima de{" "}
        <strong style={{ color: "var(--ink-primary)" }}>
          {limiteNecessidadeMaximaCapital ? `${(Number(limiteNecessidadeMaximaCapital) * 100).toFixed(0)}%` : "30% (padrão)"}
        </strong>{" "}
        do VGV dispara alerta crítico.
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Editar
        </Button>
        {limiteNecessidadeMaximaCapital && (
          <Button requer="editar" variant="secondary" onClick={restaurarPadrao} disabled={salvando} style={{ padding: "6px 10px", fontSize: 12 }}>
            Restaurar padrão
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Taxa de desconto mensal (TMA) do VPL deste cenario. Nulo = padrao do sistema
 * (0,5% a.m.). Usada por fluxo de caixa, comparacao, sensibilidade e relatorios.
 */
function TaxaDescontoSecao({
  cenarioId,
  taxaDescontoMensal,
  onAtualizado,
  onErro,
}: {
  cenarioId: string;
  taxaDescontoMensal: string | null;
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(taxaDescontoMensal ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarCenario(cenarioId, { taxaDescontoMensal: valor.trim() || null });
      setEditando(false);
      onAtualizado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 240 }}>
          <TextField label="Taxa de desconto mensal (0–1, ex.: 0.008 = 0,8%)" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.005" />
        </div>
        <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "8px 12px", fontSize: 12.5 }}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "8px 12px", fontSize: 12.5 }}>
          Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
        Taxa de desconto (TMA) do VPL:{" "}
        <strong style={{ color: "var(--ink-primary)" }}>
          {taxaDescontoMensal ? `${(Number(taxaDescontoMensal) * 100).toFixed(2)}% a.m.` : "0,50% a.m. (padrão)"}
        </strong>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Editar
        </Button>
        {taxaDescontoMensal && (
          <Button requer="editar" variant="secondary" onClick={() => atualizarCenario(cenarioId, { taxaDescontoMensal: null }).then(onAtualizado).catch((err: any) => onErro(String(err.message ?? err)))} style={{ padding: "6px 10px", fontSize: 12 }}>
            Restaurar padrão
          </Button>
        )}
      </div>
    </div>
  );
}

function CustosSecao({
  empreendimentoId,
  cenarioId,
  custos,
  categoriasDisponiveis,
  tipologiasDisponiveis,
  gruposIndiceCorrecao,
  onAtualizado,
  onErro,
}: {
  empreendimentoId: string;
  cenarioId: string;
  custos: CenarioDetalhe["custos"];
  categoriasDisponiveis: CategoriaCustoResumo[];
  tipologiasDisponiveis: { id: string; nome: string }[];
  gruposIndiceCorrecao: CenarioDetalhe["indicesCorrecao"];
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
  const gruposConhecidos = Array.from(new Set(["padrao", ...gruposIndiceCorrecao.map((p) => p.grupo)]));

  const categoriaSelecionada = categoriasDisponiveis.find((c) => c.id === categoriaId);
  const incidenciaPorValor = categoriaSelecionada?.tipoIncidencia === "fixo" || categoriaSelecionada?.tipoIncidencia === "pct_execucao";
  // Faixas de comissao progressiva (achado F28, docs/DECISOES.md): o
  // percentual nao e um valor unico no Custo -- e cadastrado depois, como
  // uma tabela de faixas, no painel "Faixas" da propria linha.
  const usaFaixas = categoriaSelecionada?.tipoIncidencia === "faixas_vgv_acumulado";
  // Escopo por tipologia (achado F11, docs/DECISOES.md — "estrutura de
  // comissao") so faz sentido para pct_vgv_vendido_no_mes, pct_recebido_no_mes
  // (achado F25) ou faixas_vgv_acumulado (achado F28): permite um
  // percentual/tabela de comissao diferente por tipologia (ex.: loja x apartamento).
  const suportaTipologia =
    categoriaSelecionada?.tipoIncidencia === "pct_vgv_vendido_no_mes" ||
    categoriaSelecionada?.tipoIncidencia === "pct_recebido_no_mes" ||
    usaFaixas;

  async function adicionarRet() {
    setSalvando(true);
    try {
      let categoria = categoriasDisponiveis.find((c) => c.nome === NOME_CATEGORIA_RET && c.papel === "tributo");
      if (custos.some((c) => c.categoriaNome === NOME_CATEGORIA_RET)) {
        throw new Error("A RET já está cadastrada neste cenário. Edite a alíquota na linha dela.");
      }
      if (!categoria) {
        categoria = await criarCategoriaCusto(empreendimentoId, { nome: NOME_CATEGORIA_RET, tipoIncidencia: "pct_recebido_no_mes", papel: "tributo" });
      }
      await criarCusto(cenarioId, { categoriaId: categoria.id, percentual: "0.04", grupoIndiceCorrecao: "padrao" });
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, color: "var(--ink-secondary)" }}>
        <span>RET — Regime Especial de Tributação: 4% sobre o recebido no mês, cadastrado como tributo (aparece em "Tributos" nos relatórios).</span>
        <Button requer="editar" type="button" variant="secondary" onClick={adicionarRet} disabled={salvando} style={{ padding: "6px 10px", fontSize: 12 }}>
          Adicionar RET (4%)
        </Button>
      </div>
      {custos.length > 0 && (
        <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Categoria</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Tipologia</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Valor</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Mês</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Índice</th>
              <th></th>
            </tr>
          </thead>
          <tbody style={{ font: "var(--text-mono-body)" }}>
            {custos.map((c) => (
              <LinhaCusto key={c.id} custo={c} onAtualizado={onAtualizado} onErro={onErro} />
            ))}
          </tbody>
        </table>
      )}

      {categoriasDisponiveis.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Cadastre uma categoria de custo antes de lançar novos custos.</div>
      ) : (
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
        {suportaTipologia && (
          <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 170 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Tipologia (opcional)</span>
            <select
              value={tipologiaId}
              onChange={(e) => setTipologiaId(e.target.value)}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
            >
              <option value="">Todas</option>
              {tipologiasDisponiveis.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {usaFaixas ? null : incidenciaPorValor ? (
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
        <div style={{ width: 130 }}>
          <TextField
            label="Índice"
            list="grupos-indice-correcao-custo"
            value={grupoIndiceCorrecao}
            onChange={(e) => setGrupoIndiceCorrecao(e.target.value)}
            placeholder="padrao"
          />
          <datalist id="grupos-indice-correcao-custo">
            {gruposConhecidos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <Button requer="editar" type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Adicionar"}
        </Button>
        {usaFaixas && (
          <span style={{ fontSize: 11, color: "var(--ink-muted)", flexBasis: "100%" }}>
            As faixas de VGV/percentual são cadastradas depois, no botão "Faixas" da linha do custo.
          </span>
        )}
      </form>
      )}
    </div>
  );
}

function LinhaCusto({
  custo,
  onAtualizado,
  onErro,
}: {
  custo: CenarioDetalhe["custos"][number];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valorPrevisto, setValorPrevisto] = useState(custo.valorPrevisto ?? "");
  const [percentual, setPercentual] = useState(custo.percentual ?? "");
  const [competenciaMes, setCompetenciaMes] = useState(custo.competenciaMes?.toString() ?? "");
  const [recorrencia, setRecorrencia] = useState<"unico" | "mensal">((custo.recorrencia as "unico" | "mensal") ?? "unico");
  const [grupoIndiceCorrecao, setGrupoIndiceCorrecao] = useState(custo.grupoIndiceCorrecao);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [mostrarSplit, setMostrarSplit] = useState(false);
  const [nomeDestinatario, setNomeDestinatario] = useState("");
  const [splitDestinatario, setSplitDestinatario] = useState("");
  const [salvandoDestinatario, setSalvandoDestinatario] = useState(false);
  const [mostrarFaixas, setMostrarFaixas] = useState(false);
  const [volumeAteFaixa, setVolumeAteFaixa] = useState("");
  const [percentualFaixa, setPercentualFaixa] = useState("");
  const [salvandoFaixa, setSalvandoFaixa] = useState(false);

  const incidenciaPorValor = custo.tipoIncidencia === "fixo" || custo.tipoIncidencia === "pct_execucao";
  // Faixas de comissao progressiva (achado F28, docs/DECISOES.md): nem
  // valorPrevisto nem percentual existem neste Custo -- a tabela de faixas
  // e que define a comissao, cadastrada no painel "Faixas" abaixo.
  const usaFaixas = custo.tipoIncidencia === "faixas_vgv_acumulado";

  async function adicionarFaixa(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoFaixa(true);
    try {
      await criarFaixaComissao(custo.id, volumeAteFaixa.trim() || null, percentualFaixa);
      setVolumeAteFaixa("");
      setPercentualFaixa("");
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoFaixa(false);
    }
  }

  const [faixaEdicao, setFaixaEdicao] = useState<{ id: string; volumeAte: string; percentual: string } | null>(null);

  async function salvarFaixa(e: React.FormEvent) {
    e.preventDefault();
    if (!faixaEdicao) return;
    try {
      await atualizarFaixaComissao(faixaEdicao.id, {
        volumeAte: faixaEdicao.volumeAte.trim() === "" ? null : faixaEdicao.volumeAte.trim(),
        percentual: faixaEdicao.percentual.trim(),
      });
      setFaixaEdicao(null);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  async function removerFaixa(id: string) {
    if (!window.confirm("Remover esta faixa da tabela de comissão?")) return;
    try {
      await excluirFaixaComissao(id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  async function adicionarDestinatario(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoDestinatario(true);
    try {
      await criarDestinatarioComissao(custo.id, nomeDestinatario, splitDestinatario);
      setNomeDestinatario("");
      setSplitDestinatario("");
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoDestinatario(false);
    }
  }

  async function removerDestinatario(id: string, nome: string) {
    if (!window.confirm(`Remover "${nome}" do split desta comissão?`)) return;
    try {
      await excluirDestinatarioComissao(id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarCusto(custo.id, {
        valorPrevisto: incidenciaPorValor ? valorPrevisto : undefined,
        percentual: incidenciaPorValor || usaFaixas ? undefined : percentual,
        competenciaMes: custo.tipoIncidencia === "fixo" ? Number(competenciaMes) : undefined,
        recorrencia: custo.tipoIncidencia === "fixo" ? recorrencia : undefined,
        grupoIndiceCorrecao: grupoIndiceCorrecao.trim() || "padrao",
      });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir o custo "${custo.categoriaNome}"?`)) return;
    setExcluindo(true);
    try {
      await excluirCusto(custo.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setExcluindo(false);
    }
  }

  if (editando) {
    return (
      <tr>
        <td colSpan={6} style={{ padding: "6px 0" }}>
          <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", font: "var(--text-body)" }}>
            {usaFaixas ? null : incidenciaPorValor ? (
              <div style={{ width: 130 }}>
                <TextField label="Valor previsto" value={valorPrevisto} onChange={(e) => setValorPrevisto(e.target.value)} required />
              </div>
            ) : (
              <div style={{ width: 90 }}>
                <TextField label="% (0–1)" value={percentual} onChange={(e) => setPercentual(e.target.value)} required />
              </div>
            )}
            {custo.tipoIncidencia === "fixo" && (
              <>
                <div style={{ width: 80 }}>
                  <TextField label="Mês" type="number" min={1} value={competenciaMes} onChange={(e) => setCompetenciaMes(e.target.value)} required />
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 110 }}>
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
            <div style={{ width: 110 }}>
              <TextField label="Índice" value={grupoIndiceCorrecao} onChange={(e) => setGrupoIndiceCorrecao(e.target.value)} placeholder="padrao" />
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
    );
  }

  return (
    <>
      <tr>
        <td style={{ padding: "2px 0" }}>{custo.categoriaNome}</td>
        <td style={{ color: custo.tipologiaNome ? "var(--ink-primary)" : "var(--ink-muted)" }}>{custo.tipologiaNome ?? "Todas"}</td>
        <td>
          {usaFaixas
            ? `${custo.faixasComissao.length} faixa${custo.faixasComissao.length === 1 ? "" : "s"}`
            : custo.valorPrevisto
              ? formatBRL(custo.valorPrevisto)
              : `${(Number(custo.percentual) * 100).toFixed(1)}%`}
        </td>
        <td>{custo.competenciaMes ?? "—"}</td>
        <td style={{ color: custo.grupoIndiceCorrecao === "padrao" ? "var(--ink-muted)" : "var(--ink-primary)" }}>
          {custo.grupoIndiceCorrecao === "padrao" ? "Padrão" : custo.grupoIndiceCorrecao}
        </td>
        <td style={{ textAlign: "right" }}>
          {usaFaixas && (
            <>
              <Button requer="editar" variant="secondary" onClick={() => setMostrarFaixas((v) => !v)} style={{ padding: "3px 8px", fontSize: 11 }}>
                Faixas{custo.faixasComissao.length > 0 ? ` (${custo.faixasComissao.length})` : ""}
              </Button>{" "}
            </>
          )}
          <Button requer="editar" variant="secondary" onClick={() => setMostrarSplit((v) => !v)} style={{ padding: "3px 8px", fontSize: 11 }}>
            Split{custo.destinatariosComissao.length > 0 ? ` (${custo.destinatariosComissao.length})` : ""}
          </Button>{" "}
          <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "3px 8px", fontSize: 11 }}>
            Editar
          </Button>{" "}
          <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
            {excluindo ? "…" : "Excluir"}
          </Button>
        </td>
      </tr>
      {mostrarSplit && (
        <tr>
          <td colSpan={6} style={{ padding: "6px 0 10px", font: "var(--text-body)" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)" }}>
                Split nominal — quem recebe esta comissão (não afeta o motor financeiro)
              </div>
              {custo.destinatariosComissao.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {custo.destinatariosComissao.map((d) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <span style={{ flex: 1 }}>{d.nome}</span>
                      <span style={{ font: "var(--text-mono-body)", color: "var(--ink-muted)" }}>{(Number(d.percentualSplit) * 100).toFixed(1)}%</span>
                      <PermitidoExcluir><button
                        type="button"
                        onClick={() => removerDestinatario(d.id, d.nome)}
                        title="Remover"
                        style={{ border: "none", background: "transparent", color: "var(--status-critical-text)", cursor: "pointer", fontSize: 13, padding: 0 }}
                      >
                        ×
                      </button></PermitidoExcluir>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={adicionarDestinatario} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <TextField label="Nome" value={nomeDestinatario} onChange={(e) => setNomeDestinatario(e.target.value)} placeholder="Corretor, imobiliária…" required />
                </div>
                <div style={{ width: 100 }}>
                  <TextField label="% (0–1)" value={splitDestinatario} onChange={(e) => setSplitDestinatario(e.target.value)} placeholder="0.5" required />
                </div>
                <Button requer="editar" type="submit" disabled={salvandoDestinatario} style={{ padding: "6px 10px", fontSize: 12 }}>
                  {salvandoDestinatario ? "Salvando…" : "Adicionar"}
                </Button>
              </form>
            </div>
          </td>
        </tr>
      )}
      {mostrarFaixas && (
        <tr>
          <td colSpan={6} style={{ padding: "6px 0 10px", font: "var(--text-body)" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)" }}>
                Faixas de comissão por VGV acumulado — em ordem, volume final crescente, a última pode ficar em aberto
              </div>
              {custo.faixasComissao.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {/* A API devolve as faixas por ordem de cadastro, não por volumeAte (achado F28: cadastrar fora
                      de ordem é válido, o motor reordena sozinho) -- a tela precisa ordenar antes de exibir, senão
                      o rótulo "Até"/"De ... até" fica incoerente com o valor de quem veio antes na lista visual. */}
                  {[...custo.faixasComissao]
                    .sort((a, b) => {
                      if (a.volumeAte === null) return 1;
                      if (b.volumeAte === null) return -1;
                      return Number(a.volumeAte) - Number(b.volumeAte);
                    })
                    .map((f, i, ordenadas) => {
                      const anterior = ordenadas[i - 1];
                      let rotulo: string;
                      if (f.volumeAte === null) {
                        rotulo = anterior ? `De ${formatBRL(anterior.volumeAte!)} em diante` : "Qualquer volume";
                      } else if (anterior) {
                        rotulo = `De ${formatBRL(anterior.volumeAte!)} até ${formatBRL(f.volumeAte)}`;
                      } else {
                        rotulo = `Até ${formatBRL(f.volumeAte)}`;
                      }
                      return (
                        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                          {faixaEdicao?.id === f.id ? (
                            <form onSubmit={salvarFaixa} style={{ display: "flex", gap: 6, alignItems: "flex-end", flex: 1 }}>
                              <TextField label="Até (vazio = sem limite)" value={faixaEdicao.volumeAte} onChange={(e) => setFaixaEdicao({ ...faixaEdicao, volumeAte: e.target.value })} />
                              <TextField label="%" value={faixaEdicao.percentual} onChange={(e) => setFaixaEdicao({ ...faixaEdicao, percentual: e.target.value })} required />
                              <Button requer="editar" type="submit" style={{ padding: "4px 8px", fontSize: 11 }}>Salvar</Button>
                              <Button type="button" variant="secondary" onClick={() => setFaixaEdicao(null)} style={{ padding: "4px 8px", fontSize: 11 }}>Cancelar</Button>
                            </form>
                          ) : (
                            <>
                              <span style={{ flex: 1 }}>{rotulo}</span>
                              <span style={{ font: "var(--text-mono-body)", color: "var(--ink-muted)" }}>{(Number(f.percentual) * 100).toFixed(1)}%</span>
                              <Button
                                requer="editar"
                                variant="secondary"
                                onClick={() => setFaixaEdicao({ id: f.id, volumeAte: f.volumeAte ?? "", percentual: f.percentual })}
                                style={{ padding: "2px 6px", fontSize: 11 }}
                              >
                                Editar
                              </Button>
                            </>
                          )}
                          <PermitidoExcluir><button
                            type="button"
                            onClick={() => removerFaixa(f.id)}
                            title="Remover"
                            style={{ border: "none", background: "transparent", color: "var(--status-critical-text)", cursor: "pointer", fontSize: 13, padding: 0 }}
                          >
                            ×
                          </button></PermitidoExcluir>
                        </div>
                      );
                    })}
                </div>
              )}
              <form onSubmit={adicionarFaixa} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ width: 150 }}>
                  <TextField
                    label="Volume até (vazio = sem limite)"
                    value={volumeAteFaixa}
                    onChange={(e) => setVolumeAteFaixa(e.target.value)}
                    placeholder="1000000"
                  />
                </div>
                <div style={{ width: 100 }}>
                  <TextField label="% (0–1)" value={percentualFaixa} onChange={(e) => setPercentualFaixa(e.target.value)} placeholder="0.05" required />
                </div>
                <Button requer="editar" type="submit" disabled={salvandoFaixa} style={{ padding: "6px 10px", fontSize: 12 }}>
                  {salvandoFaixa ? "Salvando…" : "Adicionar faixa"}
                </Button>
              </form>
            </div>
          </td>
        </tr>
      )}
    </>
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
  const [modoGeracao, setModoGeracao] = useState<"unico" | "andar">("unico");
  const [expandidoCondicao, setExpandidoCondicao] = useState(false);
  const [expandidoPermuta, setExpandidoPermuta] = useState(false);
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
          <Button requer="editar" type="submit" disabled={salvandoEdicao || !nomeEdicao.trim()}>
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
          <Button variant="secondary" onClick={() => setExpandidoPermuta((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {expandidoPermuta ? "Fechar" : "Permuta"}
          </Button>
          <Button requer="editar" variant="secondary" onClick={() => setExpandido((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {expandido ? "Cancelar" : "Gerar unidades"}
          </Button>
          <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
            Editar
          </Button>
          <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
            {excluindo ? "Excluindo…" : "Excluir"}
          </Button>
        </div>
      </div>

      {tipologia.condicoesPagamento.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          {tipologia.condicoesPagamento.map((cp) => (
            <LinhaCondicaoPagamento key={cp.id} condicao={cp} onAtualizado={onAtualizado} onErro={onErro} />
          ))}
        </div>
      )}

      {expandido && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            <PermitidoEditar><button
              type="button"
              onClick={() => setModoGeracao("unico")}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: modoGeracao === "unico" ? "var(--accent-soft-bg)" : "transparent",
                color: modoGeracao === "unico" ? "var(--accent-text)" : "var(--ink-secondary)",
                cursor: "pointer",
              }}
            >
              Preço único
            </button></PermitidoEditar>
            <PermitidoEditar><button
              type="button"
              onClick={() => setModoGeracao("andar")}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: modoGeracao === "andar" ? "var(--accent-soft-bg)" : "transparent",
                color: modoGeracao === "andar" ? "var(--accent-text)" : "var(--ink-secondary)",
                cursor: "pointer",
              }}
            >
              Cascata por andar
            </button></PermitidoEditar>
          </div>

          {modoGeracao === "unico" ? (
            <form onSubmit={gerarUnidades} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
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
              <Button requer="editar" type="submit" disabled={salvando}>
                {salvando ? "Gerando…" : "Gerar"}
              </Button>
            </form>
          ) : (
            <GeracaoPorAndarForm
              tipologiaId={tipologia.id}
              onGerado={() => {
                setExpandido(false);
                onAtualizado();
              }}
              onErro={onErro}
            />
          )}
        </div>
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

      {expandidoPermuta && <PermutaSecao tipologiaId={tipologia.id} onAtualizado={onAtualizado} onErro={onErro} />}
    </div>
  );
}

function PermutaSecao({
  tipologiaId,
  onAtualizado,
  onErro,
}: {
  tipologiaId: string;
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [unidades, setUnidades] = useState<UnidadeResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  function recarregar() {
    fetchUnidades(tipologiaId)
      .then(setUnidades)
      .catch((e) => onErro(String(e.message ?? e)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    recarregar();
  }, [tipologiaId]);

  function aoRegistrar() {
    recarregar();
    onAtualizado();
  }

  if (carregando) return <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 12 }}>Carregando…</div>;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
      {unidades.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhuma unidade cadastrada ainda.</div>
      ) : (
        <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Unidade</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Status</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Contraparte / distrato</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}></th>
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => (
              <LinhaUnidadePermuta key={u.id} unidade={u} onRegistrado={aoRegistrar} onErro={onErro} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LinhaUnidadePermuta({
  unidade,
  onRegistrado,
  onErro,
}: {
  unidade: UnidadeResumo;
  onRegistrado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nomeContraparte, setNomeContraparte] = useState("");
  const [documento, setDocumento] = useState("");
  const [valorAtribuido, setValorAtribuido] = useState("");
  const [distratando, setDistratando] = useState(false);
  const [percentualRetencao, setPercentualRetencao] = useState("0");
  const [mesDistrato, setMesDistrato] = useState("");
  const [motivo, setMotivo] = useState("");
  const [renegociando, setRenegociando] = useState(false);
  const [novoValorVenda, setNovoValorVenda] = useState("");
  const [motivoRenegociacao, setMotivoRenegociacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mostrarSplit, setMostrarSplit] = useState(false);
  const [nomeContraparteSplit, setNomeContraparteSplit] = useState("");
  const [percentualSplit, setPercentualSplit] = useState("");
  const [salvandoContraparte, setSalvandoContraparte] = useState(false);
  const [editandoPreco, setEditandoPreco] = useState(false);
  const [precoEdicao, setPrecoEdicao] = useState("");
  const [salvandoPreco, setSalvandoPreco] = useState(false);

  async function salvarPreco(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoPreco(true);
    try {
      await atualizarPrecoUnidade(unidade.id, { precoVenda: precoEdicao });
      setEditandoPreco(false);
      onRegistrado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoPreco(false);
    }
  }

  async function adicionarContraparte(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade.permuta) return;
    setSalvandoContraparte(true);
    try {
      await criarContrapartePermuta(unidade.permuta.id, { nome: nomeContraparteSplit, percentualSplit: percentualSplit });
      setNomeContraparteSplit("");
      setPercentualSplit("");
      onRegistrado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoContraparte(false);
    }
  }

  const [contraparteEdicao, setContraparteEdicao] = useState<{ id: string; nome: string; percentual: string } | null>(null);

  async function salvarContraparte(e: React.FormEvent) {
    e.preventDefault();
    if (!contraparteEdicao) return;
    try {
      await atualizarContrapartePermuta(contraparteEdicao.id, { nome: contraparteEdicao.nome.trim(), percentualSplit: contraparteEdicao.percentual.trim() });
      setContraparteEdicao(null);
      onRegistrado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  async function removerContraparte(id: string, nome: string) {
    if (!window.confirm(`Remover "${nome}" do split desta permuta?`)) return;
    try {
      await excluirContrapartePermuta(id);
      onRegistrado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    }
  }

  function abrirRegistro() {
    setNomeContraparte("");
    setDocumento("");
    setValorAtribuido("");
    setEditando(true);
  }

  function abrirEdicaoPermuta() {
    setNomeContraparte(unidade.permuta?.nomeContraparte ?? "");
    setDocumento(unidade.permuta?.documento ?? "");
    setValorAtribuido(unidade.permuta?.valorAtribuido ?? "");
    setEditando(true);
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      if (unidade.permuta) {
        await atualizarPermuta(unidade.id, { nomeContraparte, documento: documento || undefined, valorAtribuido: valorAtribuido || undefined });
      } else {
        await registrarPermuta(unidade.id, { nomeContraparte, documento: documento || undefined, valorAtribuido: valorAtribuido || undefined });
      }
      setEditando(false);
      onRegistrado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function desfazer() {
    if (!window.confirm(`Desfazer a permuta da unidade "${unidade.numero}"? Ela volta para o estoque.`)) return;
    try {
      await desfazerPermuta(unidade.id);
      onRegistrado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    }
  }

  async function distratar(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade.venda) return;
    setSalvando(true);
    try {
      await registrarDistrato(unidade.venda.id, { mesDistrato: Number(mesDistrato), percentualRetencao: percentualRetencao || undefined, motivo: motivo || undefined });
      setDistratando(false);
      onRegistrado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function desfazerDistratoAcao() {
    if (!unidade.venda) return;
    if (!window.confirm(`Desfazer o distrato da unidade "${unidade.numero}"? A venda volta a ficar ativa.`)) return;
    try {
      await desfazerDistrato(unidade.venda.id);
      onRegistrado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    }
  }

  async function renegociar(e: React.FormEvent) {
    e.preventDefault();
    if (!unidade.venda) return;
    setSalvando(true);
    try {
      await registrarRenegociacao(unidade.venda.id, { novoValorVenda, motivo: motivoRenegociacao || undefined });
      setRenegociando(false);
      setNovoValorVenda("");
      setMotivoRenegociacao("");
      onRegistrado();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <tr>
        <td colSpan={4} style={{ padding: "6px 0" }}>
          <form onSubmit={registrar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 160 }}>
              <TextField label="Contraparte" value={nomeContraparte} onChange={(e) => setNomeContraparte(e.target.value)} required />
            </div>
            <div style={{ width: 130 }}>
              <TextField label="Documento" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="CPF/CNPJ" />
            </div>
            <div style={{ width: 120 }}>
              <TextField label="Valor atribuído" value={valorAtribuido} onChange={(e) => setValorAtribuido(e.target.value)} placeholder="310000" />
            </div>
            <Button requer="editar" type="submit" disabled={salvando || !nomeContraparte.trim()} style={{ padding: "6px 10px", fontSize: 12 }}>
              {salvando ? "Salvando…" : "Confirmar"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
              Cancelar
            </Button>
          </form>
        </td>
      </tr>
    );
  }

  if (distratando) {
    return (
      <tr>
        <td colSpan={4} style={{ padding: "6px 0" }}>
          <form onSubmit={distratar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 140 }}>
              <TextField label="Mês do distrato" type="number" min={1} value={mesDistrato} onChange={(e) => setMesDistrato(e.target.value)} placeholder="ex.: 12" required />
            </div>
            <div style={{ width: 140 }}>
              <TextField label="Retenção (0–1)" value={percentualRetencao} onChange={(e) => setPercentualRetencao(e.target.value)} placeholder="0.2 = 20%" />
            </div>
            <div style={{ width: 200 }}>
              <TextField label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="opcional" />
            </div>
            <Button requer="editar" type="submit" disabled={salvando} style={{ padding: "6px 10px", fontSize: 12, color: "var(--status-critical-text)" }}>
              {salvando ? "Salvando…" : "Confirmar distrato"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDistratando(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
              Cancelar
            </Button>
          </form>
        </td>
      </tr>
    );
  }

  if (renegociando) {
    return (
      <tr>
        <td colSpan={4} style={{ padding: "6px 0" }}>
          <form onSubmit={renegociar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 140 }}>
              <TextField label="Novo valor da venda" value={novoValorVenda} onChange={(e) => setNovoValorVenda(e.target.value)} placeholder={unidade.venda?.valorVenda} required />
            </div>
            <div style={{ width: 200 }}>
              <TextField label="Motivo" value={motivoRenegociacao} onChange={(e) => setMotivoRenegociacao(e.target.value)} placeholder="opcional" />
            </div>
            <Button requer="editar" type="submit" disabled={salvando || !novoValorVenda.trim()} style={{ padding: "6px 10px", fontSize: 12 }}>
              {salvando ? "Salvando…" : "Confirmar renegociação"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRenegociando(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
              Cancelar
            </Button>
          </form>
        </td>
      </tr>
    );
  }

  if (editandoPreco) {
    return (
      <tr>
        <td colSpan={4} style={{ padding: "6px 0" }}>
          <form onSubmit={salvarPreco} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 160 }}>
              <TextField label={`Preço da unidade ${unidade.numero}`} value={precoEdicao} onChange={(e) => setPrecoEdicao(e.target.value)} placeholder="310000" required />
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-muted)", flexBasis: "100%" }}>
              Vale só para vendas futuras. Vendas, projeções e resultados já existentes não mudam.
            </span>
            <Button requer="editar" type="submit" disabled={salvandoPreco || !precoEdicao.trim()} style={{ padding: "6px 10px", fontSize: 12 }}>
              {salvandoPreco ? "Salvando…" : "Salvar preço"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditandoPreco(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
              Cancelar
            </Button>
          </form>
        </td>
      </tr>
    );
  }

  const distratoInfo = unidade.status === "estoque" && unidade.venda?.status === "distratada" ? unidade.venda.distrato : null;
  const ultimaRenegociacao = unidade.venda?.renegociacoes.length ? unidade.venda.renegociacoes[unidade.venda.renegociacoes.length - 1] : null;
  const contrapartes = unidade.permuta?.contrapartes ?? [];

  return (
    <>
      <tr>
        <td style={{ padding: "4px 0", color: "var(--ink-primary)", font: "var(--text-mono-body)" }}>{unidade.numero}</td>
        <td style={{ color: "var(--ink-secondary)" }}>
          {unidade.status}
          {unidade.precoVenda ? ` · ${formatBRL(unidade.precoVenda)}` : ""}
        </td>
        <td style={{ color: "var(--ink-secondary)" }}>
          {unidade.permuta?.nomeContraparte ??
            (distratoInfo ? `Reembolsar ${formatBRL(distratoInfo.valorReembolsar)} · retido ${formatBRL(distratoInfo.valorRetido)}` : null) ??
            (ultimaRenegociacao ? `Renegociada: ${formatBRL(ultimaRenegociacao.valorVendaAnterior)} → ${formatBRL(ultimaRenegociacao.novoValorVenda)}` : "—")}
        </td>
        <td style={{ textAlign: "right" }}>
          {unidade.status === "estoque" && (
            <>
              <Button
                requer="editar"
                variant="secondary"
                onClick={() => {
                  setPrecoEdicao(unidade.precoVenda ?? "");
                  setEditandoPreco(true);
                }}
                style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}
              >
                Editar preço
              </Button>
              <Button requer="editar" variant="secondary" onClick={abrirRegistro} style={{ padding: "4px 8px", fontSize: 11, marginRight: distratoInfo ? 6 : 0 }}>
                Registrar permuta
              </Button>
            </>
          )}
          {unidade.status === "permutada" && (
            <>
              <Button requer="editar" variant="secondary" onClick={() => setMostrarSplit((v) => !v)} style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>
                Split{contrapartes.length > 0 ? ` (${contrapartes.length})` : ""}
              </Button>
              <Button requer="editar" variant="secondary" onClick={abrirEdicaoPermuta} style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>
                Editar
              </Button>
              <Button requer="excluir" variant="secondary" onClick={desfazer} style={{ padding: "4px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
                Desfazer
              </Button>
            </>
          )}
          {unidade.status === "vendida" && unidade.venda?.status === "ativa" && (
            <>
              <Button requer="editar" variant="secondary" onClick={() => setRenegociando(true)} style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>
                Renegociar
              </Button>
              <Button requer="editar" variant="secondary" onClick={() => setDistratando(true)} style={{ padding: "4px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
                Distratar
              </Button>
            </>
          )}
          {distratoInfo && (
            <Button requer="excluir" variant="secondary" onClick={desfazerDistratoAcao} style={{ padding: "4px 8px", fontSize: 11 }}>
              Desfazer distrato
            </Button>
          )}
        </td>
      </tr>
      {mostrarSplit && unidade.permuta && (
        <tr>
          <td colSpan={4} style={{ padding: "6px 0 10px", font: "var(--text-body)" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-muted)" }}>
                Split nominal — quem mais divide esta permuta com {unidade.permuta.nomeContraparte} (não afeta o motor financeiro)
              </div>
              {contrapartes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {contrapartes.map((c) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      {contraparteEdicao?.id === c.id ? (
                        <form onSubmit={salvarContraparte} style={{ display: "flex", gap: 6, alignItems: "flex-end", flex: 1 }}>
                          <TextField label="Nome" value={contraparteEdicao.nome} onChange={(e) => setContraparteEdicao({ ...contraparteEdicao, nome: e.target.value })} required />
                          <TextField label="Split (0–1)" value={contraparteEdicao.percentual} onChange={(e) => setContraparteEdicao({ ...contraparteEdicao, percentual: e.target.value })} required />
                          <Button requer="editar" type="submit" style={{ padding: "4px 8px", fontSize: 11 }}>Salvar</Button>
                          <Button type="button" variant="secondary" onClick={() => setContraparteEdicao(null)} style={{ padding: "4px 8px", fontSize: 11 }}>Cancelar</Button>
                        </form>
                      ) : (
                        <>
                          <span style={{ flex: 1 }}>{c.nome}</span>
                          <span style={{ font: "var(--text-mono-body)", color: "var(--ink-muted)" }}>{(Number(c.percentualSplit) * 100).toFixed(1)}%</span>
                          <Button
                            requer="editar"
                            variant="secondary"
                            onClick={() => setContraparteEdicao({ id: c.id, nome: c.nome, percentual: c.percentualSplit })}
                            style={{ padding: "2px 6px", fontSize: 11 }}
                          >
                            Editar
                          </Button>
                        </>
                      )}
                      <PermitidoExcluir><button
                        type="button"
                        onClick={() => removerContraparte(c.id, c.nome)}
                        title="Remover"
                        style={{ border: "none", background: "transparent", color: "var(--status-critical-text)", cursor: "pointer", fontSize: 13, padding: 0 }}
                      >
                        ×
                      </button></PermitidoExcluir>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={adicionarContraparte} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <TextField label="Nome" value={nomeContraparteSplit} onChange={(e) => setNomeContraparteSplit(e.target.value)} placeholder="Coproprietário, sócio…" required />
                </div>
                <div style={{ width: 100 }}>
                  <TextField label="% (0–1)" value={percentualSplit} onChange={(e) => setPercentualSplit(e.target.value)} placeholder="0.5" required />
                </div>
                <Button requer="editar" type="submit" disabled={salvandoContraparte} style={{ padding: "6px 10px", fontSize: 12 }}>
                  {salvandoContraparte ? "Salvando…" : "Adicionar"}
                </Button>
              </form>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function GeracaoPorAndarForm({
  tipologiaId,
  onGerado,
  onErro,
}: {
  tipologiaId: string;
  onGerado: () => void;
  onErro: (msg: string) => void;
}) {
  const [prefixoNumero, setPrefixoNumero] = useState("AP");
  const [areaPrivativa, setAreaPrivativa] = useState("");
  const [andares, setAndares] = useState<{ andar: string; quantidade: string }[]>([{ andar: "1", quantidade: "" }]);
  const [precoBase, setPrecoBase] = useState("");
  const [andarBase, setAndarBase] = useState("1");
  const [incremento, setIncremento] = useState("");
  const [tipoIncremento, setTipoIncremento] = useState<TipoIncrementoAndar>("fixo");
  const [salvando, setSalvando] = useState(false);

  function atualizarAndar(i: number, patch: Partial<{ andar: string; quantidade: string }>) {
    setAndares((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function adicionarLinha() {
    setAndares((rows) => [...rows, { andar: "", quantidade: "" }]);
  }

  function removerLinha(i: number) {
    setAndares((rows) => rows.filter((_, idx) => idx !== i));
  }

  const totalUnidades = andares.reduce((acc, a) => acc + (Number(a.quantidade) || 0), 0);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarUnidadesPorAndar(tipologiaId, {
        prefixoNumero,
        areaPrivativa: areaPrivativa || undefined,
        andares: andares.map((a) => ({ andar: Number(a.andar), quantidade: Number(a.quantidade) })),
        precificacao: { precoBase, andarBase: Number(andarBase), incremento, tipoIncremento },
      });
      onGerado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submeter} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ width: 90 }}>
          <TextField label="Prefixo" value={prefixoNumero} onChange={(e) => setPrefixoNumero(e.target.value)} placeholder="AP" required />
        </div>
        <div style={{ width: 100 }}>
          <TextField label="Área (m²)" value={areaPrivativa} onChange={(e) => setAreaPrivativa(e.target.value)} placeholder="65" />
        </div>
        <div style={{ width: 130 }}>
          <TextField label="Preço base" value={precoBase} onChange={(e) => setPrecoBase(e.target.value)} placeholder="300000" required />
        </div>
        <div style={{ width: 100 }}>
          <TextField label="Andar de referência" type="number" value={andarBase} onChange={(e) => setAndarBase(e.target.value)} required />
        </div>
        <div style={{ width: 110 }}>
          <TextField
            label={tipoIncremento === "fixo" ? "Incremento (R$)" : "Incremento (%)"}
            value={incremento}
            onChange={(e) => setIncremento(e.target.value)}
            placeholder={tipoIncremento === "fixo" ? "5000" : "0.02"}
            required
          />
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 140 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Tipo</span>
          <select
            value={tipoIncremento}
            onChange={(e) => setTipoIncremento(e.target.value as TipoIncrementoAndar)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          >
            <option value="fixo">Fixo por andar</option>
            <option value="percentual">% por andar</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {andares.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 90 }}>
              <TextField label="Andar" type="number" value={a.andar} onChange={(e) => atualizarAndar(i, { andar: e.target.value })} required />
            </div>
            <div style={{ width: 110 }}>
              <TextField label="Unidades" type="number" min={1} value={a.quantidade} onChange={(e) => atualizarAndar(i, { quantidade: e.target.value })} required />
            </div>
            {andares.length > 1 && (
              <Button requer="editar" type="button" variant="secondary" onClick={() => removerLinha(i)} style={{ padding: "8px 10px", fontSize: 12 }}>
                Remover
              </Button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button requer="editar" type="button" variant="secondary" onClick={adicionarLinha} style={{ padding: "6px 10px", fontSize: 12 }}>
          + Andar
        </Button>
        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{totalUnidades} unidade{totalUnidades === 1 ? "" : "s"} no total</span>
        <Button requer="editar" type="submit" disabled={salvando || totalUnidades === 0}>
          {salvando ? "Gerando…" : "Gerar"}
        </Button>
      </div>
    </form>
  );
}

const NOME_CATEGORIA_RET = "RET — Regime Especial de Tributação";

const ROTULO_PAPEL_CATEGORIA: Record<PapelCategoriaCusto, string> = {
  custo: "Custo",
  comissao_corretagem: "Comissão de corretagem",
  tributo: "Tributo",
};

const ROTULO_INCIDENCIA: Record<TipoIncidenciaCusto, string> = {
  fixo: "Valor fixo",
  pct_vgv_vendido_no_mes: "% do vendido no mês",
  pct_recebido_no_mes: "% do recebido, na curva de recebimento",
  pct_recebido_mes_anterior: "% do recebido no mês anterior",
  pct_execucao: "% da curva de execução (cronograma)",
  faixas_vgv_acumulado: "Faixas progressivas por volume vendido (VGV acumulado)",
};

function LinhaCategoriaCusto({
  categoria,
  onAtualizado,
  onErro,
}: {
  categoria: CategoriaCustoResumo;
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(categoria.nome);
  const [tipoIncidencia, setTipoIncidencia] = useState<TipoIncidenciaCusto>(categoria.tipoIncidencia);
  const [papel, setPapel] = useState<PapelCategoriaCusto>(categoria.papel);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarCategoriaCusto(categoria.id, { nome, tipoIncidencia, papel });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir a categoria "${categoria.nome}"?`)) return;
    setExcluindo(true);
    try {
      await excluirCategoriaCusto(categoria.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setExcluindo(false);
    }
  }

  if (editando) {
    return (
      <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <SeletorPapelCategoria value={papel} onChange={setPapel} largura={200} />
        <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 220 }}>
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
        <Button requer="editar" type="submit" disabled={salvando || !nome.trim()} style={{ padding: "6px 10px", fontSize: 12 }}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Cancelar
        </Button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-secondary)" }}>
      <span>
        <span style={{ fontWeight: 700, color: "var(--ink-primary)" }}>{categoria.nome}</span>
        {" — "}
        {ROTULO_INCIDENCIA[categoria.tipoIncidencia]}
        {categoria.papel !== "custo" && ` · ${ROTULO_PAPEL_CATEGORIA[categoria.papel]}`}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "3px 8px", fontSize: 11 }}>
          Editar
        </Button>
        <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
          {excluindo ? "…" : "Excluir"}
        </Button>
      </div>
    </div>
  );
}

function SeletorPapelCategoria({ value, onChange, largura }: { value: PapelCategoriaCusto; onChange: (p: PapelCategoriaCusto) => void; largura: number }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, width: largura }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Papel</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PapelCategoriaCusto)}
        style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
      >
        {(Object.keys(ROTULO_PAPEL_CATEGORIA) as PapelCategoriaCusto[]).map((p) => (
          <option key={p} value={p}>
            {ROTULO_PAPEL_CATEGORIA[p]}
          </option>
        ))}
      </select>
    </label>
  );
}

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
  const [papel, setPapel] = useState<PapelCategoriaCusto>("custo");
  const [salvando, setSalvando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarCategoriaCusto(empreendimentoId, { nome, tipoIncidencia, papel });
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
      <SeletorPapelCategoria value={papel} onChange={setPapel} largura={200} />
      <Button requer="editar" type="submit" disabled={salvando || !nome.trim()}>
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

/** Linhas dinâmicas de modalidade (nome/%/distribuição), reutilizadas tanto para criar quanto para editar uma condição de pagamento. */
function ModalidadesFields({ modalidades, onChange }: { modalidades: ModalidadeInput[]; onChange: (m: ModalidadeInput[]) => void }) {
  function atualizarModalidade(i: number, patch: Partial<ModalidadeInput>) {
    onChange(modalidades.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function adicionarLinha() {
    onChange([...modalidades, { nome: "", percentual: "", tipoDistribuicao: "nivelada" }]);
  }

  function removerLinha(i: number) {
    onChange(modalidades.filter((_, idx) => idx !== i));
  }

  const soma = modalidades.reduce((acc, m) => acc + (Number(m.percentual) || 0), 0);
  const somaFecha = Math.abs(soma - 1) < 0.001;

  return (
    <>
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
                style={selectFieldStyle}
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
            {m.tipoDistribuicao === "nivelada" && (
              <>
                <div style={{ width: 150 }}>
                  <TextField
                    label="Até o mês (opcional)"
                    type="number"
                    min={1}
                    placeholder="horizonte"
                    value={m.mesFinal ?? ""}
                    onChange={(e) => atualizarModalidade(i, { mesFinal: e.target.value === "" ? undefined : Number(e.target.value) })}
                  />
                </div>
                <span style={{ fontSize: 11, color: "var(--ink-muted)", flexBasis: "100%" }}>
                  Em branco, a parcela nivelada vai até o horizonte do cenário. Preencha para parar no mês informado (ex.: fim da obra).
                </span>
              </>
            )}
            {modalidades.length > 1 && (
              <Button requer="editar" type="button" variant="secondary" onClick={() => removerLinha(i)} style={{ padding: "8px 10px", fontSize: 12 }}>
                Remover
              </Button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button requer="editar" type="button" variant="secondary" onClick={adicionarLinha} style={{ padding: "6px 10px", fontSize: 12 }}>
          + Modalidade
        </Button>
        <span style={{ fontSize: 12, fontWeight: 600, color: somaFecha ? "var(--status-good-text)" : "var(--status-warning-text)" }}>
          Soma: {(soma * 100).toFixed(1)}% {somaFecha ? "" : "(precisa fechar em 100%)"}
        </span>
      </div>
    </>
  );
}

function LinhaCondicaoPagamento({
  condicao,
  onAtualizado,
  onErro,
}: {
  condicao: EmpreendimentoDetalhe["tipologias"][number]["condicoesPagamento"][number];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [editandoModalidades, setEditandoModalidades] = useState(false);
  const [nome, setNome] = useState(condicao.nome);
  const [modalidades, setModalidades] = useState<ModalidadeInput[]>(() =>
    condicao.modalidades.map((m) => ({
      nome: m.nome,
      percentual: m.percentual,
      tipoDistribuicao: m.tipoDistribuicao,
      periodicidadeMeses: m.periodicidadeMeses ?? undefined,
      mesFixo: m.mesFixo ?? undefined,
      mesFinal: m.mesFinal ?? undefined,
      repeticoesSobreTotal: m.repeticoesSobreTotal,
      geraEventoParcial: m.geraEventoParcial,
    })),
  );
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const soma = modalidades.reduce((acc, m) => acc + (Number(m.percentual) || 0), 0);
  const somaFecha = Math.abs(soma - 1) < 0.001;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarCondicaoPagamento(condicao.id, { nome });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarModalidades(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await atualizarCondicaoPagamento(condicao.id, { modalidades });
      setEditandoModalidades(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir a condição de pagamento "${condicao.nome}"?`)) return;
    setExcluindo(true);
    try {
      await excluirCondicaoPagamento(condicao.id);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setExcluindo(false);
    }
  }

  if (editando) {
    return (
      <form onSubmit={salvar} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ width: 200 }}>
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <Button requer="editar" type="submit" disabled={salvando || !nome.trim()} style={{ padding: "6px 10px", fontSize: 12 }}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditando(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
          Cancelar
        </Button>
      </form>
    );
  }

  if (editandoModalidades) {
    return (
      <form onSubmit={salvarModalidades} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ModalidadesFields modalidades={modalidades} onChange={setModalidades} />
        <div style={{ display: "flex", gap: 8 }}>
          <Button requer="editar" type="submit" disabled={salvando || !somaFecha} style={{ padding: "6px 10px", fontSize: 12 }}>
            {salvando ? "Salvando…" : "Salvar modalidades"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditandoModalidades(false)} style={{ padding: "6px 10px", fontSize: 12 }}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--ink-secondary)" }}>
      <span>
        <span style={{ fontWeight: 700, color: "var(--ink-primary)" }}>{condicao.nome}</span>
        {" — "}
        {condicao.modalidades
          .map((m) => `${m.nome} ${(Number(m.percentual) * 100).toFixed(0)}%${m.mesFinal ? ` (até o mês ${m.mesFinal})` : ""}`)
          .join(", ")}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <Button requer="editar" variant="secondary" onClick={() => setEditando(true)} style={{ padding: "3px 8px", fontSize: 11 }}>
          Editar nome
        </Button>
        <Button requer="editar" variant="secondary" onClick={() => setEditandoModalidades(true)} style={{ padding: "3px 8px", fontSize: 11 }}>
          Editar modalidades
        </Button>
        <Button requer="excluir" variant="secondary" onClick={excluir} disabled={excluindo} style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
          {excluindo ? "…" : "Excluir"}
        </Button>
      </div>
    </div>
  );
}

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

      <ModalidadesFields modalidades={modalidades} onChange={setModalidades} />

      <div>
        <Button requer="editar" type="submit" disabled={salvando || !somaFecha || !nome.trim()}>
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
      <Button requer="editar" type="submit" disabled={salvando || !nome.trim()}>
        {salvando ? "Salvando…" : "Adicionar"}
      </Button>
    </form>
  );
}
