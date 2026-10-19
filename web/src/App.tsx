import { UsuarioContext } from "./permissoes";
import { useEffect, useState } from "react";
import { EVENTO_SESSAO_EXPIRADA, fetchUsuarioAtual, logout, type Usuario } from "./api/client.js";
import { Sidebar, type Pagina } from "./components/Sidebar.js";
import { CadastroPage } from "./pages/CadastroPage.js";
import { CenariosPage } from "./pages/CenariosPage.js";
import { CronogramaPage } from "./pages/CronogramaPage.js";
import { CustosPage } from "./pages/CustosPage.js";
import { FluxoCaixaPage } from "./pages/FluxoCaixaPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RelatoriosPage } from "./pages/RelatoriosPage.js";
import { SensibilidadePage } from "./pages/SensibilidadePage.js";
import { ConciliacaoPage } from "./pages/ConciliacaoPage.js";
import { UsuariosPage } from "./pages/UsuariosPage.js";
import { VendasPage } from "./pages/VendasPage.js";

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [pagina, setPagina] = useState<Pagina>("fluxo");
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

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

  return <UsuarioContext.Provider value={usuario}>(
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)" }}>
      {menuAberto && <div className="sidebar-backdrop" onClick={() => setMenuAberto(false)} />}
      <Sidebar
        pagina={pagina}
        onNavegar={(p) => {
          setPagina(p);
          setMenuAberto(false);
        }}
        usuario={usuario}
        onSair={sair}
        aberta={menuAberto}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="topo-mobile">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            style={{ background: "transparent", border: "none", padding: 8, cursor: "pointer", color: "var(--ink-primary)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {pagina === "fluxo" && <FluxoCaixaPage />}
        {pagina === "cadastro" && <CadastroPage />}
        {pagina === "vendas" && <VendasPage />}
        {pagina === "custos" && <CustosPage />}
        {pagina === "cronograma" && <CronogramaPage />}
        {pagina === "cenarios" && <CenariosPage />}
        {pagina === "sensibilidade" && <SensibilidadePage />}
        {pagina === "conciliacao" && <ConciliacaoPage />}
        {pagina === "relatorios" && <RelatoriosPage />}
        {pagina === "usuarios" && usuario.papel === "admin" && <UsuariosPage usuarioAtual={usuario} />}
      </div>
    </div>
  )</UsuarioContext.Provider>;
}
