import { useContext, type ButtonHTMLAttributes } from "react";
import { PermissoesContext, UsuarioContext } from "../permissoes";

type Variant = "primary" | "secondary";

/**
 * `requer` esconde o botão quando a API negaria a ação para o usuário atual.
 * Sem `requer`, o botão é de leitura ou de navegação e fica sempre visível.
 */
type Requer = "editar" | "excluir" | "criarEmpreendimento";

export function Button({
  variant = "primary",
  style,
  requer,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; requer?: Requer }) {
  const permissoes = useContext(PermissoesContext);
  const usuario = useContext(UsuarioContext);
  if (requer === "editar" && !permissoes.podeEditar) return null;
  if (requer === "excluir" && !permissoes.podeExcluir) return null;
  if (requer === "criarEmpreendimento" && usuario?.papel === "stakeholder") return null;

  const base: React.CSSProperties = {
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 8,
    padding: "9px 16px",
    cursor: props.disabled ? "not-allowed" : "pointer",
    opacity: props.disabled ? 0.55 : 1,
    transition: `background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)`,
  };

  const variantStyle: React.CSSProperties =
    variant === "primary"
      ? { background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--ink-on-accent)" }
      : { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-primary)" };

  return <button {...props} style={{ ...base, ...variantStyle, ...style }} />;
}
