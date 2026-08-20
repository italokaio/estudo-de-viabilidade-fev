import { useEffect, useState } from "react";
import { criarUsuario, excluirUsuario, fetchUsuarios, type Papel, type Usuario, type UsuarioResumo } from "../api/client.js";
import { Button } from "../components/Button.js";
import { TextField } from "../components/TextField.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

export function UsuariosPage({ usuarioAtual }: { usuarioAtual: Usuario }) {
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

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
    <div style={{ flex: 1, padding: "26px 32px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
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
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-primary)", marginBottom: 12 }}>Todos os usuários</div>
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
                  <tr key={u.id}>
                    <td style={{ padding: "6px 0", color: "var(--ink-primary)", fontWeight: 600 }}>{u.nome}</td>
                    <td style={{ color: "var(--ink-secondary)" }}>{u.email}</td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: u.papel === "admin" ? "var(--accent-text)" : "var(--ink-muted)",
                          background: u.papel === "admin" ? "var(--accent-soft-bg)" : "var(--surface-2)",
                          borderRadius: 999,
                          padding: "3px 9px",
                        }}
                      >
                        {u.papel}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {u.id !== usuarioAtual.id && (
                        <Button variant="secondary" onClick={() => excluir(u.id)} style={{ padding: "4px 8px", fontSize: 11, color: "var(--status-critical-text)" }}>
                          Excluir
                        </Button>
                      )}
                    </td>
                  </tr>
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
