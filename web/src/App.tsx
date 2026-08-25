import { useEffect, useState } from "react";
import { EVENTO_SESSAO_EXPIRADA, fetchUsuarioAtual, logout, type Usuario } from "./api/client.js";
import { Sidebar, type Pagina } from "./components/Sidebar.js";
import { CadastroPage } from "./pages/CadastroPage.js";
import { CustosPage } from "./pages/CustosPage.js";
import { FluxoCaixaPage } from "./pages/FluxoCaixaPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UsuariosPage } from "./pages/UsuariosPage.js";
import { VendasPage } from "./pages/VendasPage.js";

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [pagina, setPagina] = useState<Pagina>("fluxo");
  const [sessaoExpirada, setSessaoExpirada] = useState(false);

  useEffect(() => {
    fetchUsuarioAtual()
      .then(setUsuario)
      .catch(() => setUsuario(null));
  }, []);

  // Achado F14 (docs/DECISOES.md — "segurança de sessão"): antes desta
  // fatia, uma sessão expirada no meio do uso só aparecia como um erro
  // genérico na tela que chamou a API, sem levar o usuário de volta ao
  // login. apiFetch (src/api/client.ts) dispara este evento em qualquer
  // 401 fora do fluxo de login/verificação inicial.
  useEffect(() => {
    function aoExpirar() {
      setUsuario(null);
      setSessaoExpirada(true);
    }
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, []);

  async function sair() {
    await logout();
    setUsuario(null);
    setPagina("fluxo");
  }

  if (usuario === undefined) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--ink-muted)", fontSize: 13 }}>Carregando…</div>;
  }

  if (usuario === null) {
    return (
      <LoginPage
        onEntrar={(u) => {
          setSessaoExpirada(false);
          setUsuario(u);
        }}
        avisoSessaoExpirada={sessaoExpirada}
      />
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)" }}>
      <Sidebar pagina={pagina} onNavegar={setPagina} usuario={usuario} onSair={sair} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {pagina === "fluxo" && <FluxoCaixaPage />}
        {pagina === "cadastro" && <CadastroPage />}
        {pagina === "vendas" && <VendasPage />}
        {pagina === "custos" && <CustosPage />}
        {pagina === "usuarios" && usuario.papel === "admin" && <UsuariosPage usuarioAtual={usuario} />}
      </div>
    </div>
  );
}
