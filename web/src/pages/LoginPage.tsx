import { useState } from "react";
import { login, type Usuario } from "../api/client.js";
import { Button } from "../components/Button.js";
import { TextField } from "../components/TextField.js";

export function LoginPage({ onEntrar }: { onEntrar: (usuario: Usuario) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const usuario = await login(email, senha);
      onEntrar(usuario);
    } catch (e: any) {
      setErro(String(e.message ?? e));
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
      <div style={{ width: 340, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "28px 26px", boxShadow: "var(--shadow-md)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 22 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 18L10 9L14 14L20 5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: 16, color: "var(--ink-primary)" }}>Viabilidade</span>
        </div>

        <form onSubmit={submeter} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          <TextField label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />

          {erro && (
            <div style={{ fontSize: 12.5, color: "var(--status-critical-text)", background: "var(--status-critical-soft-bg)", borderRadius: 8, padding: "8px 10px" }}>
              {erro}
            </div>
          )}

          <Button type="submit" disabled={entrando || !email.trim() || !senha}>
            {entrando ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
