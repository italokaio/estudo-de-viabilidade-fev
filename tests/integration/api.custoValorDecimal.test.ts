import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

describe("API — valores decimais de custo", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cenarioId: string;
  let categoriaId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Decimal" } });
    const empreendimentoId = emp.json().id as string;
    const cen = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    cenarioId = cen.json().id as string;
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });
    categoriaId = cat.json().id as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("aceita percentual com espaço no fim e grava sem o espaço", async () => {
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, percentual: "0.04 " } });
    expect(res.statusCode).toBe(201);
    expect(res.json().percentual).toBe("0.04");
  });

  it("recusa percentual com vírgula decimal com mensagem clara", async () => {
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, percentual: "0,04" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toContain("ponto decimal");
  });

  it("aceita percentual acima de 1 sem alterar o comportamento do motor", async () => {
    const res = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId, percentual: "2" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().percentual).toBe("2");
  });
});
