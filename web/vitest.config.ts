import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Fase 2.1 — primeira infraestrutura de teste do frontend (achado F30,
 * docs/DECISOES.md). Separada do vitest.config.ts da raiz de propósito:
 * a suíte de backend roda em ambiente "node" contra um SQLite real
 * compartilhado (fileParallelism: false); esta aqui roda em "jsdom",
 * sem nenhum estado compartilhado entre arquivos — os dois nunca deveriam
 * usar a mesma configuração.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
  },
});
