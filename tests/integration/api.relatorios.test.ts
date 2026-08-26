import ExcelJS from "exceljs";
import { PDFParse } from "pdf-parse";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { importarTesteB } from "../../src/import/importadorTesteB.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fase 2.5 — módulo de Relatórios (PDF/Excel), fonte única de verdade
 * (docs/DECISOES.md, achado F34): PDF/Excel de viabilidade e comparativo,
 * gerados a partir do que o motor/banco já oficialmente produzem — nunca
 * um cálculo independente. O teste fundamental (seção 21 do pedido)
 * confirma isso lendo o Excel de volta e comparando com /fluxo-caixa e
 * /custos-resumo, não só checando "não vazio".
 */
describe("API — relatórios (Fase 2.5)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarEmpreendimentoComVendas(nome: string, quantidadeUnidades: number, unidadesVendidas: number) {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome, incorporador: "Incorporadora Teste Ltda" } });
    const empreendimentoId = emp.json().id as string;
    const tip = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/tipologias`,
      payload: { nome: "Studio", precoUnitarioPadrao: "200000" },
    });
    const tipologiaId = tip.json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/unidades`,
      payload: { quantidade: quantidadeUnidades, precoVenda: "200000", prefixoNumero: "ST" },
    });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    const cat = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`,
      payload: { nome: "Comissão", tipoIncidencia: "pct_vgv_vendido_no_mes" },
    });

    const cenarioRes = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cenarioId = cenarioRes.json().id as string;

    await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes: 1, unidadesPrevistas: String(unidadesVendidas) }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, percentual: "0.05" } });
    const gerar = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    if (gerar.statusCode !== 200) throw new Error(`gerar-vendas falhou no setup: ${gerar.payload}`);

    return { empreendimentoId, cenarioId };
  }

  it("PDF de viabilidade: 200, content-type correto, assinatura binária válida", async () => {
    const { cenarioId } = await cadastrarEmpreendimentoComVendas("Vila Relatório PDF", 4, 4);
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade.pdf` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="relatorio-viabilidade-.*\.pdf"/);
    const buf = res.rawPayload;
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it("Excel de viabilidade: 200, content-type correto, assinatura binária válida (zip/PK)", async () => {
    const { cenarioId } = await cadastrarEmpreendimentoComVendas("Vila Relatório Excel", 4, 4);
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade.xlsx` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const buf = res.rawPayload;
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });

  it("teste fundamental: números do Excel de viabilidade batem exatamente com /fluxo-caixa e /custos-resumo — nenhum cálculo independente", async () => {
    const { cenarioId } = await cadastrarEmpreendimentoComVendas("Vila Teste Fundamental Relatórios", 4, 4);
    // 4 unidades x 200.000 = 800.000 VGV; comissão 5% = 40.000

    const fluxoOficial = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` })).json();
    const custosOficial = (await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/custos-resumo` })).json();

    const resExcel = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade.xlsx` });
    expect(resExcel.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(resExcel.rawPayload as any);

    const resumo = wb.getWorksheet("Resumo")!;
    const necessidadeMaximaLinha = resumo.getRows(1, resumo.rowCount)!.find((r) => r.getCell(1).value === "Necessidade máxima de capital")!;
    expect(Number(necessidadeMaximaLinha.getCell(2).value)).toBeCloseTo(Number(fluxoOficial.indicadores.necessidadeMaximaCapital), 2);
    const vplLinha = resumo.getRows(1, resumo.rowCount)!.find((r) => r.getCell(1).value === "VPL")!;
    expect(Number(vplLinha.getCell(2).value)).toBeCloseTo(Number(fluxoOficial.indicadores.vpl), 2);

    const fluxoSheet = wb.getWorksheet("Fluxo de Caixa")!;
    for (let mes = 1; mes <= fluxoOficial.horizonteProjecaoMeses; mes++) {
      const linhaExcel = fluxoSheet.getRow(mes + 1); // +1 pelo cabeçalho
      const pontoOficial = fluxoOficial.fluxo.find((f: any) => f.mes === mes);
      expect(Number(linhaExcel.getCell(2).value)).toBeCloseTo(Number(pontoOficial.entradas), 2);
      expect(Number(linhaExcel.getCell(5).value)).toBeCloseTo(Number(pontoOficial.fluxoAcumulado), 2);
    }

    const custosSheet = wb.getWorksheet("Custos")!;
    const linhaCusto = custosSheet.getRow(2); // única categoria cadastrada
    expect(Number(linhaCusto.getCell(6).value)).toBeCloseTo(Number(custosOficial[0].totalPrevisto), 2);

    // não recalcula nada: o texto do PDF traz o mesmo valor oficial.
    const resPdf = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade.pdf` });
    const parser = new PDFParse({ data: resPdf.rawPayload });
    // normaliza NBSP ("R$ 123,45") -- a extracao de texto do PDF pode
    // devolver espaco comum onde o pdfkit desenhou um NBSP, mesmo sendo
    // visualmente identico.
    const texto = (await parser.getText()).text.replace(/ /g, " ");
    await parser.destroy();
    const necessidadeFormatada = Number(fluxoOficial.indicadores.necessidadeMaximaCapital)
      .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      .replace(/ /g, " ");
    expect(texto).toContain(necessidadeFormatada);
  });

  it("isolamento: comparativo de um empreendimento ignora cenário de outro", async () => {
    const { empreendimentoId: empA, cenarioId: cenarioA } = await cadastrarEmpreendimentoComVendas("Empreendimento A — isolamento relatório", 2, 2);
    const { cenarioId: cenarioB } = await cadastrarEmpreendimentoComVendas("Empreendimento B — isolamento relatório", 2, 2);

    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${empA}/relatorios/comparacao.xlsx?ids=${cenarioA},${cenarioB}` });
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as any);
    const resumo = wb.getWorksheet("Resumo")!;
    const cabecalho = resumo.getRow(1);
    // so a coluna do cenario de A -- nao ha coluna para o cenario de B
    expect(cabecalho.getCell(2).value).toBeTruthy();
    expect(cabecalho.getCell(3).value).toBeFalsy();

    const resPdf = await app.inject({ method: "GET", url: `/api/empreendimentos/${empA}/relatorios/comparacao.pdf?ids=${cenarioA},${cenarioB}` });
    const parser = new PDFParse({ data: resPdf.rawPayload });
    const texto = (await parser.getText()).text;
    await parser.destroy();
    expect(texto).not.toContain("Empreendimento B — isolamento relatório");
  });

  it("404 para cenário/empreendimento inexistente em qualquer rota de relatório", async () => {
    expect((await app.inject({ method: "GET", url: "/api/cenarios/id-inexistente/relatorios/viabilidade.pdf" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/cenarios/id-inexistente/relatorios/viabilidade.xlsx" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/empreendimentos/id-inexistente/relatorios/comparacao.pdf?ids=x" })).statusCode).toBe(404);
  });

  it("400 quando o relatório comparativo não recebe nenhum id", async () => {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Vila sem ids relatório" } });
    const res = await app.inject({ method: "GET", url: `/api/empreendimentos/${emp.json().id}/relatorios/comparacao.xlsx` });
    expect(res.statusCode).toBe(400);
  });

  it("permissão 'leitura' consegue gerar relatórios (rota de leitura)", async () => {
    const appAdmin = await buildApp();
    const { criarUsuario } = await import("../../src/db/auth.js");
    await criarUsuario({ email: "admin-relatorio@local.test", nome: "Admin", senha: "senha123", papel: "admin" });
    const loginAdmin = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin-relatorio@local.test", senha: "senha123" } });
    const cookieAdmin = loginAdmin.headers["set-cookie"] as string;

    const emp = await appAdmin.inject({ method: "POST", url: "/api/empreendimentos", headers: { cookie: cookieAdmin }, payload: { nome: "Vila Relatório Permissão" } });
    const empreendimentoId = emp.json().id as string;
    const cenarioRes = await appAdmin.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      headers: { cookie: cookieAdmin },
      payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 },
    });
    const cenarioId = cenarioRes.json().id as string;

    const usuarioComum = await criarUsuario({ email: "leitura-relatorio@local.test", nome: "Usuário", senha: "senha123", papel: "usuario" });
    await appAdmin.inject({
      method: "POST",
      url: `/api/usuarios/${usuarioComum.id}/empreendimentos`,
      headers: { cookie: cookieAdmin },
      payload: { empreendimentoId, papel: "leitura" },
    });
    const loginComum = await appAdmin.inject({ method: "POST", url: "/api/auth/login", payload: { email: "leitura-relatorio@local.test", senha: "senha123" } });
    const cookieComum = loginComum.headers["set-cookie"] as string;

    const res = await appAdmin.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade.pdf`, headers: { cookie: cookieComum } });
    expect(res.statusCode).toBe(200);
    await appAdmin.close();
  });

  it("genericidade/volume: relatório do empreendimento fictício B (300 unidades) gera sem erro", async () => {
    const { cenarioId } = await importarTesteB();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade.xlsx` });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.byteLength).toBeGreaterThan(1000);

    const resPdf = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/relatorios/viabilidade.pdf` });
    expect(resPdf.statusCode).toBe(200);
  }, 20000);
});
