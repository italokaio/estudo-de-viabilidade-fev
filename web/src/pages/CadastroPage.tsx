import { useEffect, useState } from "react";
import {
  criarEmpreendimento,
  criarTipologia,
  criarUnidadesEmLote,
  fetchEmpreendimentoDetalhe,
  fetchEmpreendimentos,
  type EmpreendimentoDetalhe,
  type EmpreendimentoResumo,
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
  onErro,
}: {
  detalhe: EmpreendimentoDetalhe;
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Painel titulo={detalhe.nome}>
        <div style={{ fontSize: 13, color: "var(--ink-secondary)", display: "flex", flexDirection: "column", gap: 3 }}>
          <div>{detalhe.incorporador || <span style={{ color: "var(--ink-muted)" }}>Incorporador não informado</span>}</div>
          <div>{detalhe.endereco || <span style={{ color: "var(--ink-muted)" }}>Endereço não informado</span>}</div>
        </div>
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
  const [quantidade, setQuantidade] = useState("");
  const [precoVenda, setPrecoVenda] = useState(tipologia.precoUnitarioPadrao ?? "");
  const [areaPrivativa, setAreaPrivativa] = useState(tipologia.areaPrivativaPadrao ?? "");
  const [prefixoNumero, setPrefixoNumero] = useState("");
  const [salvando, setSalvando] = useState(false);

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
          <Button variant="secondary" onClick={() => setExpandido((v) => !v)} style={{ padding: "6px 10px", fontSize: 12 }}>
            {expandido ? "Cancelar" : "Gerar unidades"}
          </Button>
        </div>
      </div>

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
    </div>
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
