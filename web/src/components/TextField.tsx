import type { InputHTMLAttributes } from "react";

export function TextField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
        {label}
      </span>
      <input
        {...props}
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13.5,
          color: "var(--ink-primary)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 10px",
          outline: "none",
          ...props.style,
        }}
      />
    </label>
  );
}
