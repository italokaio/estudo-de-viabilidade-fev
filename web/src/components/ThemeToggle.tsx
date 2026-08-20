import { useEffect, useState } from "react";

type Tema = "light" | "dark";

function temaInicial(): Tema {
  const salvo = localStorage.getItem("tema");
  if (salvo === "light" || salvo === "dark") return salvo;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    localStorage.setItem("tema", tema);
  }, [tema]);

  return (
    <button
      onClick={() => setTema((t) => (t === "light" ? "dark" : "light"))}
      title={tema === "light" ? "Mudar para tema escuro" : "Mudar para tema claro"}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {tema === "light" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-secondary)" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-secondary)" strokeWidth="2">
          <path d="M20.4 14.9A9 9 0 118.6 3.6a7 7 0 0011.8 11.3z" />
        </svg>
      )}
    </button>
  );
}
