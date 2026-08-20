import { useState } from "react";
import { Sidebar, type Pagina } from "./components/Sidebar.js";
import { CadastroPage } from "./pages/CadastroPage.js";
import { FluxoCaixaPage } from "./pages/FluxoCaixaPage.js";

export default function App() {
  const [pagina, setPagina] = useState<Pagina>("fluxo");

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)" }}>
      <Sidebar pagina={pagina} onNavegar={setPagina} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {pagina === "fluxo" ? <FluxoCaixaPage /> : <CadastroPage />}
      </div>
    </div>
  );
}
