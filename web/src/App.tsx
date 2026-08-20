import { useEffect, useState } from "react";
import { fetchUsuarioAtual, logout, type Usuario } from "./api/client.js";
import { Sidebar, type Pagina } from "./components/Sidebar.js";
import { CadastroPage } from "./pages/CadastroPage.js";
import { FluxoCaixaPage } from "./pages/FluxoCaixaPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UsuariosPage } from "./pages/UsuariosPage.js";

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [pagina, setPagina] = useState<Pagina>("fluxo");

  useEffect(() => {
    fetchUsuarioAtual()
      .then(setUsuario)
      .catch(() => setUsuario(null));
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
    return <LoginPage onEntrar={setUsuario} />;
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)" }}>
      <Sidebar pagina={pagina} onNavegar={setPagina} usuario={usuario} onSair={sair} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {pagina === "fluxo" && <FluxoCaixaPage />}
        {pagina === "cadastro" && <CadastroPage />}
        {pagina === "usuarios" && usuario.papel === "admin" && <UsuariosPage usuarioAtual={usuario} />}
      </div>
    </div>
  );
}
