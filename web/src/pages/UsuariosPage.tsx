import { useEffect, useState } from "react";
import {
  atualizarUsuario,
  criarUsuario,
  desvincularEmpreendimento,
  excluirUsuario,
  fetchEmpreendimentos,
  fetchEmpreendimentosDoUsuario,
  fetchUsuarios,
  redefinirSenhaUsuario,
  vincularEmpreendimentos,
  type EmpreendimentoResumo,
  type EmpreendimentoVinculado,
  type Papel,
  type PapelVinculo,
  type Usuario,
  type UsuarioResumo,
} from "../api/client.js";
import { Button } from "../components/Button.js";
import { TextField } from "../components/TextField.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

export function UsuariosPage({ usuarioAtual }: { usuarioAtual: Usuario }) {
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  function recarregar() {
    fetchUsuarios()
      .then(setUsuarios)
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    recarregar();
  }, []);

  async function excluir(id: string) {
    if (!window.confirm("Excluir este usuário?")) return;
    try {
      await excluirUsuario(id);
      recarregar();
    } catch (e: any) {
      setErro(String(e.message ?? e));
    }
  }

  return (
    <div className="pagina" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }} onClickCapture={() => setErro(null)} onSubmitCapture={() => setErro(null)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>Admin</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: "var(--ink-primary)", marginTop: 2 }}>Usuários</div>
        </div>
        <ThemeToggle />
      </div>

      {erro && (
        <div style={{ background: "var(--status-critical-soft-bg)", border: "1px solid var(--status-critical)", borderRadius: 10, padding: "12px 16px", color: "var(--status-critical-text)", fontSize: 13 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 4 }}>Todos os usuários</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 12 }}>
            "Admin" vê todos os empreendimentos sempre. "Usuário" e "Stakeholder" só veem os que forem vinculados abaixo, em "Acesso" — Stakeholder nunca pode ter acesso de edição.
          </div>
          {carregando ? (
            <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Carregando…</div>
          ) : (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                  <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em" }}>Nome</th>
                  <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em" }}>Email</th>
                  <th style={{ fontWeight: 600, paddingBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em" }}>Papel</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <LinhaUsuario
                    key={u.id}
                    usuario={u}
                    ehVoceMesmo={u.id === usuarioAtual.id}
                    expandido={expandidoId === u.id}
                    onToggleExpandir={() => setExpandidoId((v) => (v === u.id ? null : u.id))}
                    onExcluir={() => excluir(u.id)}
                    onErro={setErro}
                    onAtualizado={recarregar}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <NovoUsuarioForm onCriado={recarregar} onErro={setErro} />
      </div>
    </div>
  );
}

function LinhaUsuario({
  usuario,
  ehVoceMesmo,
  expandido,
  onToggleExpandir,
  onExcluir,
  onErro,
  onAtualizado,
}: {
  usuario: UsuarioResumo;
  ehVoceMesmo: boolean;
  expandido: boolean;
  onToggleExpandir: () => void;
  onExcluir: () => void;
  onErro: (msg: string) => void;
  onAtualizado: () => void;
}) {
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState(usuario.nome);
  const [papelEdicao, setPapelEdicao] = useState<Papel>(usuario.papel);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoEdicao(true);
    try {
      await atualizarUsuario(usuario.id, { nome: nomeEdicao, papel: papelEdicao });
      setEditando(false);
      onAtualizado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvandoEdicao(false);
    }
  }

  return (
    <>
      <tr>
        <td style={{ padding: "6px 0", color: "var(--ink-primary)", fontWeight: 600 }}>{usuario.nome}</td>
        <td style={{ color: "var(--ink-secondary)" }}>{usuario.email}</td>
        <td>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: usuario.papel === "admin" ? "var(--accent-text)" : "var(--ink-muted)",
              background: usuario.papel === "admin" ? "var(--accent-soft-bg)" : "var(--surface-2)",
              borderRadius: 999,
              padding: "3px 9px",
            }}
          >
            {usuario.papel}
          </span>
        </td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          {(usuario.papel === "usuario" || usuario.papel === "stakeholder") && (
            <Button variant="secondary" onClick={onToggleExpandir} style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>
              {expandido ? "Fechar" : "Acesso"}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setNomeEdicao(usuario.nome);
              setPapelEdicao(usuario.papel);
              setEditando((v) => !v);
            }}
            style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}
          >
            {editando ? "Fechar" : "Editar"}
          </Button>
          <Button variant="secondary" onClick={() => setMostrarSenha((v) => !v)} style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>
            {mostrarSenha ? "Fechar" : "Senha"}
          </Button>
          {!ehVoceMesmo && (
            <Button variant="secondary" onClick={onExcluir} style={{ padding: "4px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
              Excluir
            </Button>
          )}
        </td>
      </tr>
      {editando && (
        <tr>
          <td colSpan={4} style={{ paddingBottom: 12 }}>
            <form onSubmit={salvarEdicao} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 220 }}>
                <TextField label="Nome" value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} required />
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 160 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Papel</span>
                <select
                  value={papelEdicao}
                  onChange={(e) => setPapelEdicao(e.target.value as Papel)}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
                >
                  <option value="admin">Admin</option>
                  <option value="usuario">Usuário</option>
                  <option value="stakeholder">Stakeholder</option>
                </select>
              </label>
              <span style={{ fontSize: 11, color: "var(--ink-muted)", flexBasis: "100%" }}>
                O e-mail não é editável. Não é possível rebaixar o último administrador, nem tornar stakeholder quem ainda tem vínculo de edição.
              </span>
              <Button type="submit" disabled={salvandoEdicao || !nomeEdicao.trim()} style={{ padding: "6px 10px", fontSize: 12 }}>
                {salvandoEdicao ? "Salvando…" : "Salvar"}
              </Button>
            </form>
          </td>
        </tr>
      )}
      {expandido && (
        <tr>
          <td colSpan={4} style={{ paddingBottom: 12 }}>
            <AcessoEmpreendimentos usuarioId={usuario.id} papelUsuario={usuario.papel} onErro={onErro} />
          </td>
        </tr>
      )}
      {mostrarSenha && (
        <tr>
          <td colSpan={4} style={{ paddingBottom: 12 }}>
            <RedefinirSenhaForm usuarioId={usuario.id} onErro={onErro} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Redefinicao de senha assistida por admin (achado F14, docs/DECISOES.md
 * — "seguranca de sessao"): sem infraestrutura de email neste projeto, a
 * recuperacao real e um admin definindo a nova senha e comunicando ao
 * usuario por fora do sistema — encerra as sessoes ativas dele.
 */
function RedefinirSenhaForm({ usuarioId, onErro }: { usuarioId: string; onErro: (msg: string) => void }) {
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await redefinirSenhaUsuario(usuarioId, senha);
      setSenha("");
      setSucesso(true);
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
        Define uma nova senha para este usuário e encerra as sessões ativas dele — comunique a senha por fora do sistema.
      </div>
      {sucesso && <div style={{ fontSize: 12.5, color: "var(--status-good-text)" }}>Senha redefinida.</div>}
      <form onSubmit={submeter} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ width: 220 }}>
          <TextField
            label="Nova senha"
            type="password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setSucesso(false);
            }}
            placeholder="mínimo 6 caracteres"
            required
          />
        </div>
        <Button type="submit" disabled={salvando || senha.length < 6} style={{ padding: "6px 10px", fontSize: 12 }}>
          {salvando ? "Salvando…" : "Redefinir"}
        </Button>
      </form>
    </div>
  );
}

function AcessoEmpreendimentos({ usuarioId, papelUsuario, onErro }: { usuarioId: string; papelUsuario: Papel; onErro: (msg: string) => void }) {
  const ehStakeholder = papelUsuario === "stakeholder";
  const [vinculados, setVinculados] = useState<EmpreendimentoVinculado[]>([]);
  const [todos, setTodos] = useState<EmpreendimentoResumo[]>([]);
  const [novosIds, setNovosIds] = useState<string[]>([]);
  // Stakeholder nunca pode ter vínculo "edicao" -- o backend já recusa
  // (POST /api/usuarios/:id/empreendimentos), este default só evita o
  // usuário escolher uma opção que sabe que vai ser rejeitada.
  const [novoPapel, setNovoPapel] = useState<PapelVinculo>(ehStakeholder ? "leitura" : "edicao");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [trocandoPapel, setTrocandoPapel] = useState<string | null>(null);

  function recarregar() {
    Promise.all([fetchEmpreendimentosDoUsuario(usuarioId), fetchEmpreendimentos()])
      .then(([v, t]) => {
        setVinculados(v);
        setTodos(t);
      })
      .catch((e) => onErro(String(e.message ?? e)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    recarregar();
  }, [usuarioId]);

  const disponiveis = todos.filter((e) => !vinculados.some((v) => v.id === e.id));

  // Vínculo em lote (achado F22, docs/DECISOES.md): selecao multipla
  // (Ctrl/Cmd + clique) manda varios empreendimentoIds numa unica
  // requisicao, em vez de repetir "Adicionar" um por um.
  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (novosIds.length === 0) return;
    setSalvando(true);
    try {
      await vincularEmpreendimentos(usuarioId, novosIds, novoPapel);
      setNovosIds([]);
      recarregar();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(empreendimentoId: string) {
    try {
      await desvincularEmpreendimento(usuarioId, empreendimentoId);
      recarregar();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    }
  }

  // Papel por vínculo (achado F23, docs/DECISOES.md — "permissão por
  // empreendimento com papel próprio"): alternar reenvia o mesmo id com o
  // papel oposto -- vincularUsuarioEmpreendimento e um upsert, entao isso
  // atualiza o vinculo existente em vez de criar um segundo.
  async function alternarPapel(v: EmpreendimentoVinculado) {
    if (ehStakeholder) return; // Stakeholder so tem "leitura" -- nada para alternar.
    setTrocandoPapel(v.id);
    try {
      await vincularEmpreendimentos(usuarioId, [v.id], v.papel === "edicao" ? "leitura" : "edicao");
      recarregar();
    } catch (err: any) {
      onErro(String(err.message ?? err));
    } finally {
      setTrocandoPapel(null);
    }
  }

  if (carregando) return <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Carregando…</div>;

  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      {vinculados.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>Nenhum empreendimento vinculado — este usuário não vê nenhum ainda.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {vinculados.map((v) => (
            <span
              key={v.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-primary)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "4px 6px 4px 10px",
              }}
            >
              {v.nome}
              <button
                type="button"
                onClick={() => alternarPapel(v)}
                disabled={trocandoPapel === v.id || ehStakeholder}
                title={ehStakeholder ? "Stakeholder só tem acesso de leitura" : v.papel === "edicao" ? "Edição — clique para tornar somente leitura" : "Leitura — clique para permitir edição"}
                style={{
                  border: "none",
                  background: v.papel === "leitura" ? "var(--status-warning-soft-bg)" : "transparent",
                  color: v.papel === "leitura" ? "var(--status-warning-text)" : "var(--ink-muted)",
                  cursor: ehStakeholder ? "default" : "pointer",
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".02em",
                  borderRadius: 999,
                  padding: "2px 6px",
                }}
              >
                {v.papel === "edicao" ? "edição" : "leitura"}
              </button>
              <button
                type="button"
                onClick={() => remover(v.id)}
                title="Remover acesso"
                style={{ border: "none", background: "transparent", color: "var(--status-critical-text)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {disponiveis.length > 0 && (
        <form onSubmit={adicionar} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 220 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
              Dar acesso a (Ctrl/Cmd + clique para vários)
            </span>
            <select
              multiple
              value={novosIds}
              onChange={(e) => setNovosIds(Array.from(e.target.selectedOptions, (o) => o.value))}
              size={Math.min(disponiveis.length, 5)}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
            >
              {disponiveis.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 120 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Papel</span>
            <select
              value={novoPapel}
              onChange={(e) => setNovoPapel(e.target.value as PapelVinculo)}
              disabled={ehStakeholder}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
            >
              {!ehStakeholder && <option value="edicao">Edição</option>}
              <option value="leitura">Leitura</option>
            </select>
          </label>
          <Button type="submit" disabled={salvando || novosIds.length === 0} style={{ padding: "6px 10px", fontSize: 12 }}>
            {salvando ? "Salvando…" : novosIds.length > 1 ? `Adicionar (${novosIds.length})` : "Adicionar"}
          </Button>
        </form>
      )}
    </div>
  );
}

function NovoUsuarioForm({ onCriado, onErro }: { onCriado: () => void; onErro: (msg: string) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Papel>("usuario");
  const [salvando, setSalvando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criarUsuario({ nome, email, senha, papel });
      setNome("");
      setEmail("");
      setSenha("");
      setPapel("usuario");
      onCriado();
    } catch (e: any) {
      onErro(String(e.message ?? e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Novo usuário</div>
      <form onSubmit={submeter} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" required />
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Papel</span>
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value as Papel)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--ink-primary)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          >
            <option value="usuario">Usuário</option>
            <option value="stakeholder">Stakeholder</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <Button type="submit" disabled={salvando || !nome.trim() || !email.trim() || senha.length < 6}>
          {salvando ? "Salvando…" : "Criar usuário"}
        </Button>
      </form>
    </div>
  );
}
