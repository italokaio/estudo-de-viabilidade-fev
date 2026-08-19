import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Os testes de integracao compartilham um unico arquivo SQLite (Fase 0
    // nao usa banco isolado por arquivo de teste). Rodar arquivos de teste
    // em paralelo faz um arquivo apagar dados que outro esta inserindo no
    // mesmo instante — os arquivos de teste rodam em sequencia.
    fileParallelism: false,
  },
});
