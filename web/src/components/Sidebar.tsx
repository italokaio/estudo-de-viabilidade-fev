export type Pagina = "fluxo" | "cadastro";

const navIcon = {
  fluxo: "M3 17l5-5 4 4 8-8",
  cadastro: "M12 5v14M5 12h14",
  vendas: "rect",
  custos: "M4 20V10M12 20V4M20 20v-7",
  cronograma: "circle",
  cenarios: "M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01",
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

export function Sidebar({ pagina, onNavegar }: { pagina: Pagina; onNavegar: (p: Pagina) => void }) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px 22px" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M4 18L10 9L14 14L20 5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontWeight: 800, fontSize: 14, color: "var(--ink-primary)" }}>Viabilidade</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
        <NavItem label="Vendas">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </NavItem>
        <NavItem label="Custos">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={navIcon.custos} strokeLinecap="round" />
          </svg>
        </NavItem>
        <NavItem label="Cronograma">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 2" />
          </svg>
        </NavItem>
        <NavItem label="Cenários">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={navIcon.cenarios} strokeLinecap="round" />
          </svg>
        </NavItem>
      </div>
    </div>
  );
}
