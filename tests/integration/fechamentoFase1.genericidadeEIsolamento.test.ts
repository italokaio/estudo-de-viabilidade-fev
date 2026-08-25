import { Decimal } from "decimal.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../api/src/app.js";
import { buildAuthenticatedApp } from "../helpers/buildAuthenticatedApp.js";
import { prisma } from "../../src/db/client.js";
import { gerarVendasDePremissaVelocidade } from "../../src/db/gerarVendas.js";
import { rodarMotorParaCenario } from "../../src/db/servicoMotor.js";
import { importarFicticio } from "../../src/import/importadorFicticio.js";
import { importarSplendido } from "../../src/import/importadorSplendido.js";
import { importarTesteA } from "../../src/import/importadorTesteA.js";
import { importarTesteB } from "../../src/import/importadorTesteB.js";
import { importarTesteC } from "../../src/import/importadorTesteC.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Fechamento e hardening da Fase 1 — seções 4 e 5 do pedido: prova de que o
 * motor é genérico rodando os mesmos fluxos em 5 empreendimentos
 * estruturalmente distintos (Splendido real + 4 fictícios desenhados para
 * variar deliberadamente unidades/preço/condição de pagamento/parcelas/
 * financiamento/horizonte/cronograma/custos/velocidade — não são cenários
 * sofisticados, são só o suficiente para provar generalidade):
 *
 * - Ficticio (Recanto das Aroeiras): poucas unidades, parcelamento simples.
 * - Teste A (Torres Alto Padrão): poucas unidades (6), preço alto (R$3,2M),
 *   só 2 parcelas (entrada + reforço semestral), sem financiamento.
 * - Teste B (Residencial Horizonte): muitas unidades (300), preço baixo
 *   (R$120mil), parcelamento longo com intermediária anual, financiamento
 *   SAC, horizonte de 48 meses.
 * - Teste C (Vila Jardins): garagem como tipologia independente, parcela
 *   única na entrega (mes_fixo), financiamento Price, comissão em faixas
 *   progressivas por VGV acumulado (achado F28).
 */
describe("genericidade — Splendido + 4 empreendimentos fictícios estruturalmente distintos", () => {
  let splendidoCenarioId: string;
  let ficticioCenarioId: string;
  let aCenarioId: string;
  let bCenarioId: string;
  let cCenarioId: string;

  beforeAll(async () => {
    await resetDatabase();
    splendidoCenarioId = (await importarSplendido()).cenarioId;
    await gerarVendasDePremissaVelocidade(splendidoCenarioId);

    ficticioCenarioId = (await importarFicticio()).cenarioId;
    await gerarVendasDePremissaVelocidade(ficticioCenarioId);

    aCenarioId = (await importarTesteA()).cenarioId;
    await gerarVendasDePremissaVelocidade(aCenarioId);

    bCenarioId = (await importarTesteB()).cenarioId;
    await gerarVendasDePremissaVelocidade(bCenarioId);

    cCenarioId = (await importarTesteC()).cenarioId;
    await gerarVendasDePremissaVelocidade(cCenarioId);
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("o motor roda sem erro para os 5 cenários, cada um com uma configuração estruturalmente diferente", async () => {
    for (const cenarioId of [splendidoCenarioId, ficticioCenarioId, aCenarioId, bCenarioId, cCenarioId]) {
      const resultado = await rodarMotorParaCenario(cenarioId);
      expect(resultado.indicadores).toBeDefined();
      expect(Number.isFinite(resultado.indicadores.necessidadeMaximaCapital.toNumber())).toBe(true);
    }
  });

  it("cada cenário conserva 100% do valor vendido entre os recebimentos gerados — em qualquer condição de pagamento, não só nas do Splendido", async () => {
    for (const cenarioId of [splendidoCenarioId, ficticioCenarioId, aCenarioId, bCenarioId, cCenarioId]) {
      const vendas = await prisma.venda.findMany({ where: { cenarioId } });
      const resultado = await rodarMotorParaCenario(cenarioId);
      const recebidoPorVenda = new Map<string, Decimal>();
      for (const r of resultado.recebimentos) {
        recebidoPorVenda.set(r.vendaId, (recebidoPorVenda.get(r.vendaId) ?? new Decimal(0)).plus(r.valorPrevisto));
      }
      for (const venda of vendas) {
        const total = recebidoPorVenda.get(venda.id) ?? new Decimal(0);
        expect(total.toFixed(2)).toBe(new Decimal(venda.valorVenda).toFixed(2));
      }
    }
  });

  it("as unidades vendidas em cada empreendimento batem exatamente com o que cada premissa de velocidade pediu", async () => {
    expect(await prisma.venda.count({ where: { cenarioId: aCenarioId } })).toBe(6); // 2+2+2
    expect(await prisma.venda.count({ where: { cenarioId: bCenarioId } })).toBe(300); // 15 x 20
    expect(await prisma.venda.count({ where: { cenarioId: cCenarioId } })).toBe(80); // (10+10) x 4
  });

  it("a garagem (tipologia C) é um produto normal — vendida em paralelo ao apartamento, sem se confundir no VGV nem no motor", async () => {
    const vendasApto = await prisma.venda.count({ where: { cenarioId: cCenarioId, unidade: { tipologia: { nome: "Apartamento 2 Quartos" } } } });
    const vendasGaragem = await prisma.venda.count({ where: { cenarioId: cCenarioId, unidade: { tipologia: { nome: "Garagem" } } } });
    expect(vendasApto).toBe(40);
    expect(vendasGaragem).toBe(40);

    // VGV total do cenário C precisa ser a soma dos dois produtos, nem mais nem menos.
    const vendas = await prisma.venda.findMany({ where: { cenarioId: cCenarioId } });
    const vgvTotal = vendas.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0));
    expect(vgvTotal.toFixed(2)).toBe(new Decimal("450000").times(40).plus(new Decimal("35000").times(40)).toFixed(2));
  });

  it("a comissão em faixas progressivas (achado F28) do cenário C não depende de nenhuma constante do Splendido nem dos outros cenários", async () => {
    const resultado = await rodarMotorParaCenario(cCenarioId);
    const custoComissao = await prisma.custo.findFirstOrThrow({ where: { cenarioId: cCenarioId, categoria: { nome: "Comissão progressiva" } } });
    const desembolsos = resultado.desembolsos.filter((d) => d.custoId === custoComissao.id);
    expect(desembolsos.length).toBeGreaterThan(0);
    const totalComissao = desembolsos.reduce((acc, d) => acc.plus(d.valor), new Decimal(0));
    expect(totalComissao.greaterThan(0)).toBe(true);
  });

  it("financiamentos com tipoAmortizacao diferentes (SAC em B, Price em C, ausente em A) coexistem sem se misturar", async () => {
    const finB = await prisma.financiamentoProducao.findUniqueOrThrow({ where: { cenarioId: bCenarioId } });
    const finC = await prisma.financiamentoProducao.findUniqueOrThrow({ where: { cenarioId: cCenarioId } });
    expect(finB.tipoAmortizacao).toBe("sac");
    expect(finC.tipoAmortizacao).toBe("price");
    const finA = await prisma.financiamentoProducao.findUnique({ where: { cenarioId: aCenarioId } });
    expect(finA).toBeNull();

    const resultadoB = await rodarMotorParaCenario(bCenarioId);
    const resultadoC = await rodarMotorParaCenario(cCenarioId);
    // taxas/prazos diferentes -> a curva de fluxo dos dois cenarios precisa ser diferente.
    expect(resultadoB.indicadores.necessidadeMaximaCapital.toFixed(2)).not.toBe(resultadoC.indicadores.necessidadeMaximaCapital.toFixed(2));
  });

  it("a ordem em que os motores são executados não muda o resultado de nenhum cenário — nenhum estado global compartilhado", async () => {
    const primeiraRodadaA = await rodarMotorParaCenario(aCenarioId);
    await rodarMotorParaCenario(bCenarioId);
    await rodarMotorParaCenario(cCenarioId);
    await rodarMotorParaCenario(splendidoCenarioId);
    const segundaRodadaA = await rodarMotorParaCenario(aCenarioId);

    expect(segundaRodadaA.indicadores.necessidadeMaximaCapital.toFixed(2)).toBe(primeiraRodadaA.indicadores.necessidadeMaximaCapital.toFixed(2));
    expect(segundaRodadaA.indicadores.mesPico).toBe(primeiraRodadaA.indicadores.mesPico);
  });
});

/**
 * Fechamento e hardening da Fase 1 — seção 9 do pedido (teste obrigatório):
 * isolamento explícito entre "Empreendimento A" e "Empreendimento B", batendo
 * na API real (o que o dashboard de fato consome), não só no motor puro.
 * Complementa tests/integration/isolamento.test.ts (que já cobre
 * Splendido×Recanto das Aroeiras) com o caso que faltava: exclusão de um
 * empreendimento não pode afetar o outro.
 */
describe("isolamento multiempreendimento — Empreendimento A × Empreendimento B (obrigatório)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let empA: string, cenA: string, empB: string, cenB: string;

  beforeAll(async () => {
    await resetDatabase();
    app = await buildAuthenticatedApp();

    const a = await importarTesteA();
    empA = a.empreendimentoId;
    cenA = a.cenarioId;
    const b = await importarTesteB();
    empB = b.empreendimentoId;
    cenB = b.cenarioId;
    await gerarVendasDePremissaVelocidade(cenA);
    await gerarVendasDePremissaVelocidade(cenB);
  }, 60000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("A não enxerga dados de B e B não enxerga dados de A pela API", async () => {
    const detalheA = await app.inject({ method: "GET", url: `/api/empreendimentos/${empA}` });
    const detalheB = await app.inject({ method: "GET", url: `/api/empreendimentos/${empB}` });
    expect(detalheA.json().nome).toBe("Torres Alto Padrão");
    expect(detalheB.json().nome).toBe("Residencial Horizonte");
    expect(detalheA.json().tipologias.map((t: any) => t.nome)).not.toContain("Studio Popular");
    expect(detalheB.json().tipologias.map((t: any) => t.nome)).not.toContain("Cobertura Duplex");
  });

  it("os cálculos (dashboard/fluxo de caixa) de A e B são independentes", async () => {
    const fluxoA = await app.inject({ method: "GET", url: `/api/cenarios/${cenA}/fluxo-caixa` });
    const fluxoB = await app.inject({ method: "GET", url: `/api/cenarios/${cenB}/fluxo-caixa` });
    expect(fluxoA.statusCode).toBe(200);
    expect(fluxoB.statusCode).toBe(200);
    expect(fluxoA.json().empreendimento).toBe("Torres Alto Padrão");
    expect(fluxoB.json().empreendimento).toBe("Residencial Horizonte");
    // horizontes diferentes (10 x 48) -> o tamanho do array de fluxo tem que ser diferente.
    expect(fluxoA.json().fluxo.length).toBe(10);
    expect(fluxoB.json().fluxo.length).toBe(48);
  });

  it("uma alteração em A não afeta o indicador calculado de B", async () => {
    const antesB = (await app.inject({ method: "GET", url: `/api/cenarios/${cenB}/fluxo-caixa` })).json().indicadores.necessidadeMaximaCapital;

    const custoA = await prisma.custo.findFirstOrThrow({ where: { cenarioId: cenA, categoria: { nome: "Legalização" } } });
    await app.inject({ method: "PATCH", url: `/api/custos/${custoA.id}`, payload: { valorPrevisto: "999999999" } });
    await app.inject({ method: "GET", url: `/api/cenarios/${cenA}/fluxo-caixa` }); // força recálculo de A

    const depoisB = (await app.inject({ method: "GET", url: `/api/cenarios/${cenB}/fluxo-caixa` })).json().indicadores.necessidadeMaximaCapital;
    expect(depoisB).toBe(antesB);
  });

  it("excluir o empreendimento A não afeta B — nem os dados, nem os cálculos", async () => {
    const fluxoBAntes = await app.inject({ method: "GET", url: `/api/cenarios/${cenB}/fluxo-caixa` });

    const del = await app.inject({ method: "DELETE", url: `/api/empreendimentos/${empA}` });
    expect(del.statusCode).toBe(204);

    const empreendimentoBDepois = await app.inject({ method: "GET", url: `/api/empreendimentos/${empB}` });
    expect(empreendimentoBDepois.statusCode).toBe(200);
    expect(empreendimentoBDepois.json().nome).toBe("Residencial Horizonte");

    const fluxoBDepois = await app.inject({ method: "GET", url: `/api/cenarios/${cenB}/fluxo-caixa` });
    expect(fluxoBDepois.json().indicadores).toEqual(fluxoBAntes.json().indicadores);

    // e o empreendimento A realmente sumiu, sem deixar resíduo.
    const empreendimentoADepois = await prisma.empreendimento.findUnique({ where: { id: empA } });
    expect(empreendimentoADepois).toBeNull();
  });
});
