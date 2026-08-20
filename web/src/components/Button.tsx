import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

export function Button({
  variant = "primary",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
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
