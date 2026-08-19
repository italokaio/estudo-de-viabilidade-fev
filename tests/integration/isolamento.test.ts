import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { gerarVendasDePremissaVelocidade } from "../../src/db/gerarVendas.js";
import { rodarMotorParaCenario } from "../../src/db/servicoMotor.js";
import { importarFicticio } from "../../src/import/importadorFicticio.js";
import { importarSplendido } from "../../src/import/importadorSplendido.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

/**
 * Principio H: dois empreendimentos no mesmo banco, com dados totalmente
 * diferentes, nao podem interferir um no outro em nenhuma direcao.
 */
describe("isolamento multiempreendimento (Splendido + Recanto das Aroeiras)", () => {
  let splendidoCenarioId: string;
  let ficticioCenarioId: string;

  beforeAll(async () => {
    await resetDatabase();
    const splendido = await importarSplendido();
    splendidoCenarioId = splendido.cenarioId;
    await gerarVendasDePremissaVelocidade(splendidoCenarioId);

    const ficticio = await importarFicticio();
    ficticioCenarioId = ficticio.cenarioId;
    await gerarVendasDePremissaVelocidade(ficticioCenarioId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("os dois empreendimentos coexistem com contagens de venda diferentes", async () => {
    const totalSplendido = await prisma.venda.count({ where: { cenarioId: splendidoCenarioId } });
    const totalFicticio = await prisma.venda.count({ where: { cenarioId: ficticioCenarioId } });
    expect(totalSplendido).toBe(409);
    expect(totalFicticio).toBe(24);
    expect(totalSplendido).not.toBe(totalFicticio);
  });

  it("rodar o motor do fictício não altera nenhuma venda ou recebimento do Splendido", async () => {
    const vendasSplendidoAntes = await prisma.venda.findMany({ where: { cenarioId: splendidoCenarioId }, orderBy: { id: "asc" } });
    const resultadoSplendidoAntes = await rodarMotorParaCenario(splendidoCenarioId);
    const recebimentosSplendidoAntes = [...resultadoSplendidoAntes.recebimentos].sort((a, b) => a.vendaId.localeCompare(b.vendaId));

    await rodarMotorParaCenario(ficticioCenarioId);

    const vendasSplendidoDepois = await prisma.venda.findMany({ where: { cenarioId: splendidoCenarioId }, orderBy: { id: "asc" } });
    const resultadoSplendidoDepois = await rodarMotorParaCenario(splendidoCenarioId);
    const recebimentosSplendidoDepois = [...resultadoSplendidoDepois.recebimentos].sort((a, b) => a.vendaId.localeCompare(b.vendaId));

    expect(vendasSplendidoDepois.map((v) => v.valorVenda)).toEqual(vendasSplendidoAntes.map((v) => v.valorVenda));
    expect(recebimentosSplendidoDepois.map((r) => r.valorPrevisto.toString())).toEqual(
      recebimentosSplendidoAntes.map((r) => r.valorPrevisto.toString()),
    );
  });

  it("alterar uma premissa do fictício não muda a necessidade de capital do Splendido", async () => {
    const resultadoSplendidoAntes = await rodarMotorParaCenario(splendidoCenarioId);
    const necessidadeAntes = resultadoSplendidoAntes.indicadores.necessidadeMaximaCapital.toString();

    const custoObraFicticio = await prisma.custo.findFirstOrThrow({
      where: { cenarioId: ficticioCenarioId, categoria: { nome: "Obra" } },
    });
    await prisma.custo.update({ where: { id: custoObraFicticio.id }, data: { valorPrevisto: "999999999" } });
    await rodarMotorParaCenario(ficticioCenarioId);

    const resultadoSplendidoDepois = await rodarMotorParaCenario(splendidoCenarioId);
    const necessidadeDepois = resultadoSplendidoDepois.indicadores.necessidadeMaximaCapital.toString();

    expect(necessidadeDepois).toBe(necessidadeAntes);
  });

  it("nenhuma unidade de um empreendimento pertence ao outro", async () => {
    const unidadesSplendido = await prisma.unidade.count({ where: { empreendimentoId: { equals: (await prisma.empreendimento.findFirstOrThrow({ where: { nome: "Splendido" } })).id } } });
    const unidadesFicticio = await prisma.unidade.count({ where: { empreendimentoId: { equals: (await prisma.empreendimento.findFirstOrThrow({ where: { nome: "Recanto das Aroeiras" } })).id } } });
    expect(unidadesSplendido).toBe(237 + 35 + 8 + 137);
    expect(unidadesFicticio).toBe(24);
  });
});
