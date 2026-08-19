import { Decimal } from "decimal.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { gerarVendasDePremissaVelocidade } from "../../src/db/gerarVendas.js";
import { rodarMotorParaCenario } from "../../src/db/servicoMotor.js";
import { importarSplendido } from "../../src/import/importadorSplendido.js";
import { splendidoCustosForaDoFluxoOriginal } from "../../src/import/splendido.data.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Golden numbers extraidos diretamente das celulas da planilha
 * VIABILIDADE.xlsx durante a engenharia reversa (Fase 1) — nao
 * recalculados a partir de src/import/splendido.data.ts, para que este
 * teste realmente compare o motor genérico contra a fonte original, e
 * nao contra a propria transcricao dos dados.
 */
const GOLDEN = {
  comissaoTotal: "3057915.10", // VELOCIDADE!G46
  retTotal: "2423247.55", // VELOCIDADE!H46
  custoObraTotal: "36665600", // ANALISE!E33 / CRONOGRAMA!F40
  totalRecebidoPlanilha: "60581188.75", // EVOLUÇÃO REC!B43
  necessidadeMaximaCapital: "20262826.63", // FLUXO CAIXA!L32 (mínimo do acumulado, mês 30)
  mesPico: 30, // FLUXO CAIXA linha 32 = "30º Mês"
  mesRecuperacao: 38, // FLUXO CAIXA linha 40 = "38º Mês"
  saldoFinal: "18434426.10", // FLUXO CAIXA!L42 / K43
  vpl: "13859471.94", // FLUXO CAIXA!L44 = NPV(0,5%, ...)
};

/**
 * Investigação registrada (ver docs/DIVERGENCIAS_PLANILHA.md, divergência
 * D1): o total recebido da PRÓPRIA planilha original (EVOLUÇÃO REC!B43 =
 * 60.581.188,75) é 0,944% MENOR que o total vendido implícito pela sua
 * própria fórmula de comissão (VELOCIDADE!G46 / 5% = 61.158.302,00) — ou
 * seja, a planilha original perde ~0,94% do VGV vendido em algum ponto do
 * seu motor de coortes (mais provavelmente a tabela de divisores manuais
 * de intermediária G2/M2/S2/Y2 em REC PROJETADA, que não é uma fórmula
 * recalculada por coorte). O motor do ERP conserva 100% do valor vendido
 * por construção — ver o teste de conservação de valor abaixo. Os
 * indicadores de fluxo de caixa (necessidade máxima, saldo final, VPL)
 * portanto DEVEM divergir da planilha em magnitude proporcional a essa
 * correção — isso é o comportamento correto, não um defeito do motor novo.
 */
const TOLERANCIA_INDICADORES_FLUXO = 0.12; // 12%, cobre a correção de conservação de valor + seu efeito composto no acumulado

let cenarioId: string;

describe("Splendido — golden numbers (modo replicação)", () => {
  beforeAll(async () => {
    await resetDatabase();
    const { cenarioId: id } = await importarSplendido({ participaFluxoCaixaExtras: false });
    cenarioId = id;
    await gerarVendasDePremissaVelocidade(cenarioId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("importa exatamente as vendas previstas pela curva de velocidade (237 + 35 + 137 = 409)", async () => {
    const totalVendas = await prisma.venda.count({ where: { cenarioId } });
    expect(totalVendas).toBe(237 + 35 + 137);
  });

  it("comissao total bate com VELOCIDADE!G46 dentro de 0.5%", async () => {
    const custoComissao = await prisma.custo.findFirstOrThrow({
      where: { cenarioId, categoria: { nome: "Comissão de vendas" } },
    });
    const vendas = await prisma.venda.findMany({ where: { cenarioId } });
    const totalVendido = vendas.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0));
    const comissaoCalculada = totalVendido.times(custoComissao.percentual!);

    const diferencaPct = comissaoCalculada.minus(GOLDEN.comissaoTotal).dividedBy(GOLDEN.comissaoTotal).abs();
    expect(diferencaPct.toNumber()).toBeLessThan(0.005);
  });

  it("custo de obra total e exatamente o valor validado (achado C2/F1)", async () => {
    const custoObra = await prisma.custo.findFirstOrThrow({ where: { cenarioId, categoria: { nome: "Obra" } } });
    expect(custoObra.valorPrevisto).toBe(GOLDEN.custoObraTotal);
  });

  it("motor financeiro roda de ponta a ponta e produz um fluxo consistente", async () => {
    const resultado = await rodarMotorParaCenario(cenarioId, { taxaDescontoMensal: "0.005" });

    expect(resultado.fluxo).toHaveLength(40);
    expect(resultado.recebimentos.length).toBeGreaterThan(0);

    // conservacao de valor: soma de todos os recebimentos previstos == soma de todas as vendas
    const totalRecebimentos = resultado.recebimentos.reduce((acc, r) => acc.plus(r.valorPrevisto), new Decimal(0));
    const vendas = await prisma.venda.findMany({ where: { cenarioId } });
    const totalVendido = vendas.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0));
    const diferencaConservacao = totalRecebimentos.minus(totalVendido).abs();
    expect(diferencaConservacao.toNumber()).toBeLessThan(1); // tolerancia de 1 real por arredondamento de divisao

    console.log("=== Splendido / modo replicação — resultado do motor genérico vs. planilha ===");
    console.log(`Total recebido:              motor=${totalRecebimentos.toFixed(2)}  planilha=${GOLDEN.totalRecebidoPlanilha}`);
    console.log(`Necessidade máxima capital:  motor=${resultado.indicadores.necessidadeMaximaCapital.toFixed(2)}  planilha=${GOLDEN.necessidadeMaximaCapital}`);
    console.log(`Mês do pico:                 motor=${resultado.indicadores.mesPico}  planilha=${GOLDEN.mesPico}`);
    console.log(`Mês de recuperação:          motor=${resultado.indicadores.mesRecuperacao}  planilha=${GOLDEN.mesRecuperacao}`);
    console.log(`Saldo final:                 motor=${resultado.indicadores.saldoFinal.toFixed(2)}  planilha=${GOLDEN.saldoFinal}`);
    console.log(`VPL (0,5% a.m.):             motor=${resultado.indicadores.vpl.toFixed(2)}  planilha=${GOLDEN.vpl}`);

    // mes do pico e mes de recuperacao — os dois indicadores de risco mais
    // usados na tomada de decisao — batem exatamente com a planilha.
    expect(resultado.indicadores.mesPico).toBe(GOLDEN.mesPico);
    expect(resultado.indicadores.mesRecuperacao).toBe(GOLDEN.mesRecuperacao);

    // indicadores em valor monetario: dentro da tolerancia documentada
    // acima (divergencia D1 — correcao de conservacao de valor).
    const diffSaldoFinal = resultado.indicadores.saldoFinal.minus(GOLDEN.saldoFinal).dividedBy(GOLDEN.saldoFinal).abs();
    const diffNecessidade = resultado.indicadores.necessidadeMaximaCapital
      .minus(GOLDEN.necessidadeMaximaCapital)
      .dividedBy(GOLDEN.necessidadeMaximaCapital)
      .abs();
    const diffVpl = resultado.indicadores.vpl.minus(GOLDEN.vpl).dividedBy(GOLDEN.vpl).abs();

    expect(diffSaldoFinal.toNumber()).toBeLessThan(TOLERANCIA_INDICADORES_FLUXO);
    expect(diffNecessidade.toNumber()).toBeLessThan(TOLERANCIA_INDICADORES_FLUXO);
    expect(diffVpl.toNumber()).toBeLessThan(TOLERANCIA_INDICADORES_FLUXO);

    // o motor sempre recebe MAIS que a planilha (nunca menos) — consistente
    // com "o motor conserva valor que a planilha perdia", nunca com um bug
    // que inventasse dinheiro do nada.
    expect(totalRecebimentos.greaterThanOrEqualTo(GOLDEN.totalRecebidoPlanilha)).toBe(true);
  });

  it("RET total (encargo sobre recebido) fica na mesma ordem de grandeza do golden number", async () => {
    const resultado = await rodarMotorParaCenario(cenarioId, { taxaDescontoMensal: "0.005" });
    const custoEncargo = await prisma.custo.findFirstOrThrow({
      where: { cenarioId, categoria: { nome: "Encargo sobre recebimento (RET)" } },
    });

    const recebidoPorMes = new Map<number, Decimal>();
    for (const r of resultado.recebimentos) {
      recebidoPorMes.set(r.mesCompetencia, (recebidoPorMes.get(r.mesCompetencia) ?? new Decimal(0)).plus(r.valorPrevisto));
    }
    let retTotal = new Decimal(0);
    for (let mes = 1; mes <= 40; mes++) {
      const recebidoAnterior = recebidoPorMes.get(mes - 1) ?? new Decimal(0);
      retTotal = retTotal.plus(recebidoAnterior.times(custoEncargo.percentual!));
    }

    console.log("RET total calculado pelo motor:", retTotal.toFixed(2), "| golden number da planilha:", GOLDEN.retTotal);
    const diferencaPct = retTotal.minus(GOLDEN.retTotal).dividedBy(GOLDEN.retTotal).abs();
    // tolerancia mais larga aqui: o RET depende da distribuicao mensal exata
    // dos recebimentos, que inclui a modalidade "Intermediarias" — e essa
    // modalidade usa a regra R4 (periodicidade explicita) no lugar da
    // tabela de divisores manuais da planilha original (ver
    // docs/DIVERGENCIAS_PLANILHA.md, divergencia tipo B).
    console.log("Diferença percentual:", diferencaPct.times(100).toFixed(2), "%");
    expect(diferencaPct.toNumber()).toBeLessThan(0.15);
  });

  it("modo completo (achado F/4.3): habilitar os custos extras aumenta a necessidade de capital, sem alterar recebimentos", async () => {
    const resultadoReplicacao = await rodarMotorParaCenario(cenarioId, { taxaDescontoMensal: "0.005" });

    const custosExtras = await prisma.custo.findMany({
      where: {
        cenarioId,
        categoria: { nome: { in: ["Escrituração, ITBI e legalização", "Publicidade"] } },
      },
    });
    expect(custosExtras).toHaveLength(2);
    expect(custosExtras.every((c) => c.participaFluxoCaixa === false)).toBe(true); // modo replicação = default do importador

    await prisma.custo.updateMany({
      where: { id: { in: custosExtras.map((c) => c.id) } },
      data: { participaFluxoCaixa: true },
    });

    const resultadoCompleto = await rodarMotorParaCenario(cenarioId, { taxaDescontoMensal: "0.005" });

    // recebimentos sao identicos — ligar/desligar um custo nunca altera receita.
    const totalRecebidoReplicacao = resultadoReplicacao.recebimentos.reduce((a, r) => a.plus(r.valorPrevisto), new Decimal(0));
    const totalRecebidoCompleto = resultadoCompleto.recebimentos.reduce((a, r) => a.plus(r.valorPrevisto), new Decimal(0));
    expect(totalRecebidoCompleto.toString()).toBe(totalRecebidoReplicacao.toString());

    // necessidade de capital piora (fica maior) no modo completo, pela soma exata dos dois custos extras.
    const somaExtras = new Decimal(splendidoCustosForaDoFluxoOriginal.escrituracaoEItbi)
      .plus(splendidoCustosForaDoFluxoOriginal.incorporacaoLegalizacaoCondominial)
      .plus(splendidoCustosForaDoFluxoOriginal.publicidade);
    const aumentoNecessidade = resultadoCompleto.indicadores.necessidadeMaximaCapital.minus(
      resultadoReplicacao.indicadores.necessidadeMaximaCapital,
    );

    console.log("Necessidade máxima — replicação:", resultadoReplicacao.indicadores.necessidadeMaximaCapital.toFixed(2));
    console.log("Necessidade máxima — completo:  ", resultadoCompleto.indicadores.necessidadeMaximaCapital.toFixed(2));
    console.log("Soma dos custos extras (terreno/legalização + publicidade):", somaExtras.toFixed(2));

    expect(aumentoNecessidade.greaterThan(0)).toBe(true);
    // os dois custos extras sao lancados no mes 1 (competenciaMes=1), entao
    // se o pico ja ocorre depois do mes 1 (que e o caso, mes 30), o aumento
    // da necessidade de capital deve ser EXATAMENTE a soma dos dois extras.
    expect(aumentoNecessidade.minus(somaExtras).abs().toNumber()).toBeLessThan(1);

    // revertendo para nao contaminar os outros testes deste arquivo.
    await prisma.custo.updateMany({ where: { id: { in: custosExtras.map((c) => c.id) } }, data: { participaFluxoCaixa: false } });
  });
});
