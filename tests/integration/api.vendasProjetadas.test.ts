import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { resetDatabase } from "../helpers/resetDatabase.js";
import { montarDadosRelatorioViabilidade } from "../../src/relatorios/dados.js";
import { montarPremissasResumoCenario } from "../../src/db/servicoMotor.js";

describe("Vendas projetadas por premissa de velocidade", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empreendimentoId: string;
  let tipologiaA: string;
  let tipologiaB: string;
  let condicaoA: string;
  let condicaoB: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();
    const emp = await app.inject({ method: "POST", url: "/api/empreendimentos", payload: { nome: "Projeção" } });
    empreendimentoId = emp.json().id as string;
    tipologiaA = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto A", precoUnitarioPadrao: "300000" } })).json().id as string;
    tipologiaB = (await app.inject({ method: "POST", url: `/api/empreendimentos/${empreendimentoId}/tipologias`, payload: { nome: "Apto B", precoUnitarioPadrao: "200000" } })).json().id as string;
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaA}/unidades`, payload: { quantidade: 4, precoVenda: "300000", prefixoNumero: "A" } });
    await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaB}/unidades`, payload: { quantidade: 3, precoVenda: "200000", prefixoNumero: "B" } });
    const modalidades = [
      { nome: "Entrada", percentual: "0.2", tipoDistribuicao: "unica_na_venda" },
      { nome: "Parcelas", percentual: "0.8", tipoDistribuicao: "nivelada" },
    ];
    condicaoA = (await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaA}/condicoes-pagamento`, payload: { nome: "Padrão A", modalidades } })).json().id as string;
    condicaoB = (await app.inject({ method: "POST", url: `/api/tipologias/${tipologiaB}/condicoes-pagamento`, payload: { nome: "Padrão B", modalidades } })).json().id as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function criarCenario(nome: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: `/api/empreendimentos/${empreendimentoId}/cenarios`,
      payload: { tipo: "base", nome, horizonteProjecaoMeses: 12 },
    });
    return res.json().id as string;
  }

  async function premissa(cenarioId: string, tipologiaId: string, mes: number, unidadesPrevistas: string) {
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId, mes, unidadesPrevistas }] },
    });
    expect(res.statusCode).toBe(201);
  }

  async function fluxo(cenarioId: string) {
    const res = await app.inject({ method: "GET", url: `/api/cenarios/${cenarioId}/fluxo-caixa` });
    return res.json() as { fluxo: { mes: number; entradas: string; saidas: string }[]; indicadores: { vpl: string; tir: string | null; margemLiquida: string | null } };
  }

  async function venderUmaReal(cenarioId: string, tipologiaId: string, condicaoId: string, mesOrigem: number) {
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId, status: "estoque" } });
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenarioId}/vendas`,
      payload: { unidadeId: unidade.id, condicaoPagamentoId: condicaoId, mesOrigem, comprador: "Comprador real" },
    });
    expect(res.statusCode).toBe(201);
  }

  it("cenário com venda real na tipologia não muda quando se adiciona premissa dela", async () => {
    const cenario = await criarCenario("Vendido");
    await venderUmaReal(cenario, tipologiaA, condicaoA, 1);
    const antes = await fluxo(cenario);
    const dadosAntes = await montarDadosRelatorioViabilidade(cenario);

    await premissa(cenario, tipologiaA, 2, "2");

    expect((await fluxo(cenario)).fluxo).toEqual(antes.fluxo);
    const dadosDepois = await montarDadosRelatorioViabilidade(cenario);
    expect(dadosDepois.resumoExecutivo.vgv).toBe(dadosAntes.resumoExecutivo.vgv);
    expect(dadosDepois.resumoExecutivo.vgv).toBe("300000.00");
  });

  it("cenário sem vendas reais projeta a receita pela premissa, sem criar Venda nem consumir estoque", async () => {
    const cenario = await criarCenario("Projetado");
    await premissa(cenario, tipologiaA, 2, "2");
    await premissa(cenario, tipologiaB, 3, "1");

    const dados = await montarDadosRelatorioViabilidade(cenario);
    expect(dados.resumoExecutivo.vgv).toBe("800000.00");
    expect(dados.resumoExecutivo.totalRecebimentosPrevisto).toBe("800000.00");
    const somaDetalhe = dados.recebimentos.reduce((acc, r) => acc + Number(r.valorPrevisto), 0);
    expect(somaDetalhe).toBeCloseTo(800000, 2);

    const fluxoCenario = await fluxo(cenario);
    const entradas = fluxoCenario.fluxo.reduce((acc, p) => acc + Number(p.entradas), 0);
    expect(entradas).toBeCloseTo(800000, 0);

    expect(await prisma.venda.count({ where: { cenarioId: cenario } })).toBe(0);
    expect(await prisma.unidade.count({ where: { empreendimentoId, status: "estoque" } })).toBe(7);
  });

  it("tipologia sem venda real é projetada e a com venda real fica só com a venda real", async () => {
    const cenario = await criarCenario("Parcial");
    await venderUmaReal(cenario, tipologiaA, condicaoA, 1);
    await premissa(cenario, tipologiaA, 2, "3");
    await premissa(cenario, tipologiaB, 2, "2");

    const dados = await montarDadosRelatorioViabilidade(cenario);
    expect(dados.resumoExecutivo.vgv).toBe("700000.00");
    expect(await prisma.venda.count({ where: { cenarioId: cenario } })).toBe(1);
    const linhasProjetadas = dados.recebimentos.filter((r) => r.unidadeNumero.startsWith("Projetada"));
    expect(linhasProjetadas.every((r) => r.unidadeNumero === "Projetada (Apto B)")).toBe(true);
  });

  it("preço da projeção é a média das vendas reais da tipologia no empreendimento, e o preço padrão só sem nenhuma venda real", async () => {
    const outro = await criarCenario("Com venda real");
    const unidade = await prisma.unidade.findFirstOrThrow({ where: { tipologiaId: tipologiaA, status: "estoque" } });
    await app.inject({
      method: "POST",
      url: `/api/cenarios/${outro}/vendas`,
      payload: { unidadeId: unidade.id, condicaoPagamentoId: condicaoA, mesOrigem: 1, valorVenda: "330000", comprador: "Comprador" },
    });

    const cenario = await criarCenario("Projetado com média");
    await premissa(cenario, tipologiaA, 2, "2");
    const dados = await montarDadosRelatorioViabilidade(cenario);
    expect(dados.resumoExecutivo.vgv).toBe("660000.00");
  });

  it("resumo de premissas separa unidades reais e projetadas por cenário", async () => {
    const cenario = await criarCenario("Contagem");
    await venderUmaReal(cenario, tipologiaA, condicaoA, 1);
    await premissa(cenario, tipologiaB, 2, "2");
    const resumo = await montarPremissasResumoCenario({ id: cenario, horizonteProjecaoMeses: 12, limiteNecessidadeMaximaCapital: null });
    expect(resumo.vendas.reais).toBe(1);
    expect(resumo.vendas.projetadas).toBe(2);
    expect(resumo.vendas.projetadasPorTipologia).toEqual([
      { tipologiaId: tipologiaB, tipologiaNome: "Apto B", unidades: 2, vgv: "400000.00", ticketMedio: "200000.00" },
    ]);
  });

  it("avisa, sem bloquear, quando a premissa soma mais unidades do que a tipologia tem", async () => {
    const cenario = await criarCenario("Acima do total");
    const res = await app.inject({
      method: "POST",
      url: `/api/cenarios/${cenario}/premissas-velocidade`,
      payload: { itens: [{ tipologiaId: tipologiaB, mes: 1, unidadesPrevistas: "5" }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().criadas).toBe(1);
    expect(res.json().avisos).toHaveLength(1);
    expect(res.json().avisos[0]).toMatch(/Apto B.*soma 5 unidades, mas a tipologia tem 3/);
    const dados = await montarDadosRelatorioViabilidade(cenario);
    expect(dados.premissas.avisos).toHaveLength(1);
    expect(dados.resumoExecutivo.vgv).toBe("1000000.00");
  });

  it("duplicar um cenário copia a taxa de desconto (TMA)", async () => {
    const original = await criarCenario("Com TMA");
    await app.inject({ method: "PATCH", url: `/api/cenarios/${original}`, payload: { taxaDescontoMensal: "0.007" } });
    const dup = await app.inject({ method: "POST", url: `/api/cenarios/${original}/duplicar`, payload: { nome: "Cópia" } });
    expect(dup.statusCode).toBe(201);
    const copia = await prisma.cenario.findUniqueOrThrow({ where: { id: dup.json().id as string } });
    expect(copia.taxaDescontoMensal).toBe("0.007");
  });
});
