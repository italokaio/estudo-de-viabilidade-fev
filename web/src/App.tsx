import { Sidebar } from "./components/Sidebar.js";
import { FluxoCaixaPage } from "./pages/FluxoCaixaPage.js";

export default function App() {
  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <FluxoCaixaPage />
      </div>
    </div>
  );
}
