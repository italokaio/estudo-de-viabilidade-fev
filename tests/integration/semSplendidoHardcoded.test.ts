import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Item 10.7 da aprovacao da Fase 0: garantia concreta de que nao existe
 * `if empreendimento == "Splendido"` ou equivalente. Varre estaticamente
 * o motor financeiro puro (src/core) e a camada de banco (src/db) — as
 * duas camadas que processam QUALQUER empreendimento — procurando a
 * palavra "splendido" (case-insensitive). Os unicos lugares onde esse
 * nome pode legitimamente aparecer sao os arquivos de importacao
 * (src/import/splendido.data.ts e importadorSplendido.ts), que existem
 * exatamente para isolar o dado do motor.
 */
const PASTAS_QUE_DEVEM_SER_GENERICAS = ["src/core", "src/db"];

function listarArquivosTs(pasta: string): string[] {
  const resultado: string[] = [];
  for (const entrada of readdirSync(pasta)) {
    const caminho = join(pasta, entrada);
    if (statSync(caminho).isDirectory()) {
      resultado.push(...listarArquivosTs(caminho));
    } else if (caminho.endsWith(".ts")) {
      resultado.push(caminho);
    }
  }
  return resultado;
}

describe("motor financeiro e camada de banco nunca mencionam Splendido", () => {
  for (const pasta of PASTAS_QUE_DEVEM_SER_GENERICAS) {
    it(`nenhum arquivo em ${pasta} contem a palavra "splendido"`, () => {
      const arquivos = listarArquivosTs(pasta);
      expect(arquivos.length).toBeGreaterThan(0);

      const ofensores: string[] = [];
      for (const arquivo of arquivos) {
        const conteudo = readFileSync(arquivo, "utf-8");
        if (conteudo.toLowerCase().includes("splendido")) {
          ofensores.push(arquivo);
        }
      }
      expect(ofensores).toEqual([]);
    });
  }
});
