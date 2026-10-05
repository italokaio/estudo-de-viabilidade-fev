import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";
import { montarDadosRelatorioViabilidade } from "../../src/relatorios/dados.js";
import { resumirRecebimentosPorMes, resumirVendasPorTipologia } from "../../src/relatorios/resumo.js";

describe("Relatório Viabilidade Resumido", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cenarioId: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Resumo Teste" } });
    const empreendimentoId = emp.json().id as string;
    const apto = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Apto", precoUnitarioPadrao: "300000", areaPrivativaPadrao: "60" },
    });
    const tipologiaId = apto.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "AP" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: {
        nome: "Padrão",
        modalidades: [
          { nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" },
          { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" },
        ],
      },
    });
    const cen = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 12 },
    });
    cenarioId = cen.json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: "2" }, { tipologiaId, mes: 2, unidadesPrevistas: "2" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("gera PDF e Excel resumidos pelas rotas próprias", async () => {
    const pdf = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade-resumido.pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain("relatorio-viabilidade-resumido-");

    const xlsx = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade-resumido.xlsx` });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml");
  });

  it("VGV vendido por tipologia bate com o VGV do Resumo Executivo", async () => {
    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    const resumo = resumirVendasPorTipologia(dados.vendas);
    expect(resumo.total.vgvVendido).toBe(dados.resumoExecutivo.vgv);
    expect(resumo.total.unidadesVendidas).toBe(dados.resumoExecutivo.unidadesVendidas);
    expect(resumo.linhas).toHaveLength(1);
    expect(resumo.linhas[0]?.ticketMedio).toBe("300000.00");
  });

  it("recebimento previsto somado por mês bate com o Resumo Executivo e tem uma linha por mês do horizonte", async () => {
    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    const resumo = resumirRecebimentosPorMes(dados.recebimentos, dados.cenario.horizonteProjecaoMeses);
    expect(resumo.linhas).toHaveLength(dados.cenario.horizonteProjecaoMeses);
    expect(resumo.total.totalPrevisto).toBe(dados.resumoExecutivo.totalRecebimentosPrevisto);
  });

  it("o relatório completo continua com as seções de vendas e recebimentos unidade por unidade", async () => {
    const dados = await montarDadosRelatorioViabilidade(cenarioId);
    expect(dados.vendas.length).toBeGreaterThan(0);
    expect(dados.recebimentos.length).toBeGreaterThan(0);
    const completo = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade.pdf` });
    expect(completo.statusCode).toBe(200);
  });
});
