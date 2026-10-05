import type { Usuario } from "../api/client.js";

export type Pagina = "fluxo" | "cadastro" | "vendas" | "custos" | "cronograma" | "cenarios" | "sensibilidade" | "conciliacao" | "relatorios" | "usuarios";

const navIcon = {
  fluxo: "M3 17l5-5 4 4 8-8",
  cadastro: "M12 5v14M5 12h14",
  vendas: "rect",
  custos: "M4 20V10M12 20V4M20 20v-7",
  cronograma: "circle",
  cenarios: "M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01",
  usuarios: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
};

function NavItem({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const clicavel = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: active ? "var(--accent-text)" : "var(--ink-muted)",
        background: active ? "var(--accent-soft-bg)" : "transparent",
        cursor: clicavel ? "pointer" : "not-allowed",
      }}
      title={clicavel ? undefined : "Ainda não implementado nesta fatia da Fase 1"}
    >
      {children}
      {label}
    </div>
  );
}

export function Sidebar({
  pagina,
  onNavegar,
  usuario,
  onSair,
}: {
  pagina: Pagina;
  onNavegar: (p: Pagina) => void;
  usuario: Usuario;
  onSair: () => void;
}) {
  return (
    <div
      style={{
        width: 216,
        flex: "none",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "4px 8px 22px" }}>
        <img src="/brand/viabilidade-mark-light.png" alt="Viabilidade" className="brand-logo-light" style={{ height: 30, width: "auto" }} />
        <img src="/brand/viabilidade-mark-dark.png" alt="Viabilidade" className="brand-logo-dark" style={{ height: 30, width: "auto" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        <NavItem label="Fluxo de caixa" active={pagina === "fluxo"} onClick={() => onNavegar("fluxo")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={navIcon.fluxo} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavItem>
        <NavItem label="Cadastro" active={pagina === "cadastro"} onClick={() => onNavegar("cadastro")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={navIcon.cadastro} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavItem>
        <NavItem label="Vendas" active={pagina === "vendas"} onClick={() => onNavegar("vendas")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </NavItem>
        <NavItem label="Custos" active={pagina === "custos"} onClick={() => onNavegar("custos")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={navIcon.custos} strokeLinecap="round" />
          </svg>
        </NavItem>
        <NavItem label="Cronograma" active={pagina === "cronograma"} onClick={() => onNavegar("cronograma")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 2" />
          </svg>
        </NavItem>
        <NavItem label="Cenários" active={pagina === "cenarios"} onClick={() => onNavegar("cenarios")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={navIcon.cenarios} strokeLinecap="round" />
          </svg>
        </NavItem>
        <NavItem label="Sensibilidade" active={pagina === "sensibilidade"} onClick={() => onNavegar("sensibilidade")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19V5M4 19h16M7 15l4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavItem>
        <NavItem label="Conciliação" active={pagina === "conciliacao"} onClick={() => onNavegar("conciliacao")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 4h7l4 4v12H7zM14 4v4h4M10 13l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavItem>
        <NavItem label="Relatórios" active={pagina === "relatorios"} onClick={() => onNavegar("relatorios")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 13v4M12 11v6M15 15v2" strokeLinecap="round" />
          </svg>
        </NavItem>
        {usuario.papel === "admin" && (
          <NavItem label="Usuários" active={pagina === "usuarios"} onClick={() => onNavegar("usuarios")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={navIcon.usuarios} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </NavItem>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ padding: "0 8px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-primary)" }}>{usuario.nome}</div>
          <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>{usuario.email}</div>
        </div>
        <div
          onClick={onSair}
          style={{ padding: "7px 8px", fontSize: 12.5, fontWeight: 600, color: "var(--ink-muted)", cursor: "pointer", borderRadius: 8 }}
        >
          Sair
        </div>
      </div>
    </div>
  );
}
