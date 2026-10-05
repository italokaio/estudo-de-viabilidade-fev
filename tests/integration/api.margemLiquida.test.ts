import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";
import { montarDadosRelatorioViabilidade } from "../../src/relatorios/dados.js";

describe("Resultado (margem líquida) no relatório", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cenarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Margem" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Apto", precoUnitarioPadrao: "300000", areaPrivativaPadrao: "60" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "AP" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "Padrão", modalidades: [{ nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" }, { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" }] },
    });
    const cen = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    cenarioId = cen.json().id as string;
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("margem líquida × VGV bate com o fluxo líquido (saldo final)", async () => {
    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    const margem = dados.resumoExecutivo.margemLiquida;
    expect(margem).not.toBeNull();
    const reconstruido = Number(margem) * Number(dados.resumoExecutivo.vgv);
    expect(Math.abs(reconstruido - Number(dados.resumoExecutivo.saldoFinal))).toBeLessThan(0.01 * Number(dados.resumoExecutivo.vgv) / 100);
  });
});
