import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Testa alertas de risco pela API: camada de interpretação sobre o
 * resultado que o motor já calcula (indicadores, recebimentos,
 * financiamento) — nunca muda fluxo/indicadores, só sinaliza.
 */
describe("API — alertas de risco", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function cadastrarEmpreendimentoVazio() {
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Alertas Teste" } });
    const empreendimentoId = emp.json().id as string;
    const cenarioRes = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/cenarios`, payload: { tipo: "base", nome: "Base", horizonteProjecaoMeses: 6 } });
    return { empreendimentoId, cenarioId: cenarioRes.json().id as string };
  }

  it("cenário vazio não gera nenhum alerta", async () => {
    const { cenarioId } = await cadastrarEmpreendimentoVazio();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(res.json().alertas).toEqual([]);
  });

  it("custo pct_execucao sem cronograma gera alerta de aviso", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarEmpreendimentoVazio();
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "pct_execucao" } });
    const custo = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, valorPrevisto: "100000" } });
    expect(custo.statusCode).toBe(201);

    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const alertas = res.json().alertas;
    expect(alertas).toHaveLength(1);
    expect(alertas[0].tipo).toBe("custo_execucao_sem_cronograma");
    expect(alertas[0].severidade).toBe("aviso");
  });

  it("cadastrar o cronograma remove o alerta de custo sem cronograma", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarEmpreendimentoVazio();
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "pct_execucao" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, valorPrevisto: "100000" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] } });

    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(res.json().alertas.map((a: any) => a.tipo)).not.toContain("custo_execucao_sem_cronograma");
  });

  it("necessidade máxima muito alta em relação ao VGV gera alerta crítico", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarEmpreendimentoVazio();
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Studio", precoUnitarioPadrao: "10000" } });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "10000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 6, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });

    // custo grande no mês 1, VGV pequeno (10000) só entra no mês 6 -> necessidade máxima bem acima de 30% do VGV
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "fixo" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, valorPrevisto: "8000", competenciaMes: 1 } });

    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const alertas = res.json().alertas;
    expect(alertas.map((a: any) => a.tipo)).toContain("necessidade_maxima_alta");
  });

  it("financiamento cuja amortização não é coberta por receita de vendas gera alerta crítico", async () => {
    const { empreendimentoId, cenarioId } = await cadastrarEmpreendimentoVazio();
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "fixo" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, valorPrevisto: "100000", competenciaMes: 1 } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/cronograma`, payload: { pontos: [{ mes: 1, percentualExecucaoMensal: "1" }] } });
    // sem nenhuma venda cadastrada -- a amortizacao nunca sera coberta por receita
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/financiamento`, payload: { valorContratado: "100000", taxaJurosMensal: "0", mesAmortizacao: 3 } });

    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    const alertas = res.json().alertas;
    expect(alertas.map((a: any) => a.tipo)).toContain("financiamento_amortizacao_sem_receita");
  });

  /**
   * Limite de risco configurável por cenário (achado F15, docs/DECISOES.md
   * — "alertas de risco configuráveis"): PATCH /api/cenarios/:id aceita
   * limiteNecessidadeMaximaCapital; nulo explícito volta ao padrão de 30%.
   */
  async function cadastrarCenarioComNecessidadeAlta() {
    const { empreendimentoId, cenarioId } = await cadastrarEmpreendimentoVazio();
    const tip = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Studio", precoUnitarioPadrao: "10000" } });
    const tipologiaId = tip.json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaId}/unidades`, payload: { quantidade: 1, precoVenda: "10000", prefixoNumero: "ST" } });
    await app.inject({
      method: "POST",
      url: `/api/tipologias/${tipologiaId}/condicoes-pagamento`,
      payload: { nome: "À vista", modalidades: [{ nome: "Ato", percentual: "1", tipoDistribuicao: "unica_na_venda" }] },
    });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/premissas-velocidade`, payload: { itens: [{ tipologiaId, mes: 6, unidadesPrevistas: "1" }] } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/gerar-vendas` });
    // necessidade maxima ~40% do VGV (10000)
    const cat = await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/categorias-custo`, payload: { nome: "Obra", tipoIncidencia: "fixo" } });
    await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/custos`, payload: { categoriaId: cat.json().id, valorPrevisto: "4000", competenciaMes: 1 } });
    return cenarioId;
  }

  it("GET /api/cenarios/:id expõe limiteNecessidadeMaximaCapital (nulo por padrão)", async () => {
    const { cenarioId } = await cadastrarEmpreendimentoVazio();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(res.json().limiteNecessidadeMaximaCapital).toBeNull();
  });

  it("um limite customizado mais alto suprime o alerta que o padrão de 30% dispararia", async () => {
    const cenarioId = await cadastrarCenarioComNecessidadeAlta();
    const semLimite = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(semLimite.json().alertas.map((a: any) => a.tipo)).toContain("necessidade_maxima_alta");

    const patch = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { limiteNecessidadeMaximaCapital: "0.5" } });
    expect(patch.statusCode).toBe(200);

    const comLimite = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(comLimite.json().alertas.map((a: any) => a.tipo)).not.toContain("necessidade_maxima_alta");
  });

  it("um limite customizado mais baixo dispara o alerta antes do padrão de 30%", async () => {
    const { cenarioId } = await cadastrarEmpreendimentoVazio();
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(res.json().alertas).toEqual([]); // cenario vazio, sem custo/venda -- sem alerta mesmo

    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { limiteNecessidadeMaximaCapital: "0" } });
    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().limiteNecessidadeMaximaCapital).toBe("0");
  });

  it("null explícito restaura o padrão de 30%", async () => {
    const cenarioId = await cadastrarCenarioComNecessidadeAlta();
    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { limiteNecessidadeMaximaCapital: "0.5" } });
    const suprimido = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(suprimido.json().alertas.map((a: any) => a.tipo)).not.toContain("necessidade_maxima_alta");

    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { limiteNecessidadeMaximaCapital: null } });
    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}` });
    expect(detalhe.json().limiteNecessidadeMaximaCapital).toBeNull();

    const restaurado = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    expect(restaurado.json().alertas.map((a: any) => a.tipo)).toContain("necessidade_maxima_alta");
  });

  it("rejeita um limite negativo ou inválido", async () => {
    const { cenarioId } = await cadastrarEmpreendimentoVazio();
    const negativo = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { limiteNecessidadeMaximaCapital: "-0.1" } });
    expect(negativo.statusCode).toBe(400);
    const invalido = await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { limiteNecessidadeMaximaCapital: "abc" } });
    expect(invalido.statusCode).toBe(400);
  });

  it("duplicar um cenário preserva o limite de risco configurado", async () => {
    const cenarioId = await cadastrarCenarioComNecessidadeAlta();
    await app.inject({ method: "PATCH", url: `/api/cenarios/${cenarioId}`, payload: { limiteNecessidadeMaximaCapital: "0.5" } });

    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${cenarioId}/duplicar`, payload: { nome: "Base v2" } });
    const novoId = dup.json().id as string;

    const detalhe = await app.inject({ method: "GET", url: `/api/cenarios/${novoId}` });
    expect(detalhe.json().limiteNecessidadeMaximaCapital).toBe("0.5");
  });
});
