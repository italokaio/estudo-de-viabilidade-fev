import { Decimal } from "decimal.js";
import { calcularPrecoPorAndar, validarCondicaoPagamento, validarCronograma } from "../core/index.js";
import type { RegraPrecificacaoAndar } from "../core/precificacaoAndar.js";
import type { CondicaoPagamento as CondicaoPagamentoCore } from "../core/types.js";
import { prisma } from "./client.js";

/**
 * Funcoes de cadastro — traduzem DTOs simples em linhas das tabelas
 * genericas definidas em prisma/schema.prisma. Nenhuma funcao aqui sabe
 * qual empreendimento esta sendo cadastrado: quem decide os valores e
 * quem chama estas funcoes (ver src/import/).
 */

export interface CriarEmpreendimentoInput {
  nome: string;
  incorporador?: string;
  endereco?: string;
  statusFase?: string;
  dataPrevistaConclusao?: Date;
}

export async function criarEmpreendimento(input: CriarEmpreendimentoInput) {
  return prisma.empreendimento.create({ data: input });
}

export interface AtualizarEmpreendimentoInput {
  nome?: string;
  incorporador?: string | null;
  endereco?: string | null;
}

export async function atualizarEmpreendimento(id: string, input: AtualizarEmpreendimentoInput) {
  return prisma.empreendimento.update({ where: { id }, data: input });
}

/**
 * Apaga um empreendimento e tudo o que depende dele, na ordem segura de
 * chaves estrangeiras (mesma ordem usada em tests/helpers/resetDatabase.ts,
 * agora escopada a um unico empreendimento em vez do banco inteiro).
 */
export async function excluirEmpreendimento(id: string) {
  const vendaIds = (await prisma.venda.findMany({ where: { empreendimentoId: id }, select: { id: true } })).map((v) => v.id);
  await prisma.recebimentoProjetado.deleteMany({ where: { vendaId: { in: vendaIds } } });
  await prisma.venda.deleteMany({ where: { empreendimentoId: id } });
  await prisma.premissaVelocidadeVendas.deleteMany({ where: { empreendimentoId: id } });
  await prisma.modalidadePagamento.deleteMany({ where: { condicaoPagamento: { empreendimentoId: id } } });
  await prisma.condicaoPagamento.deleteMany({ where: { empreendimentoId: id } });
  await prisma.unidade.deleteMany({ where: { empreendimentoId: id } });
  await prisma.cronogramaFisicoFinanceiro.deleteMany({ where: { empreendimentoId: id } });
  await prisma.custo.deleteMany({ where: { empreendimentoId: id } });
  await prisma.categoriaCusto.deleteMany({ where: { empreendimentoId: id } });
  await prisma.tipologia.deleteMany({ where: { empreendimentoId: id } });
  await prisma.terreno.deleteMany({ where: { empreendimentoId: id } });
  await prisma.cenario.deleteMany({ where: { empreendimentoId: id } });
  await prisma.empreendimento.delete({ where: { id } });
}

export interface CriarCenarioInput {
  empreendimentoId: string;
  tipo: "base" | "otimista" | "pessimista" | "personalizado";
  nome: string;
  horizonteProjecaoMeses: number;
  derivadoDeCenarioId?: string;
}

export async function criarCenario(input: CriarCenarioInput) {
  return prisma.cenario.create({ data: input });
}

export interface AtualizarCenarioInput {
  nome?: string;
  horizonteProjecaoMeses?: number;
}

export async function atualizarCenario(id: string, input: AtualizarCenarioInput) {
  return prisma.cenario.update({ where: { id }, data: input });
}

/**
 * Apaga um cenario e tudo o que depende dele. Diferente de excluir um
 * empreendimento inteiro: as Unidades vendidas neste cenario precisam
 * voltar para o estoque ('estoque'), senao ficam "presas" como vendidas
 * sem nenhuma Venda apontando para elas — quebraria a contagem de
 * estoque disponivel para outros cenarios do mesmo empreendimento.
 */
export async function excluirCenario(id: string) {
  const vendas = await prisma.venda.findMany({ where: { cenarioId: id }, select: { id: true, unidadeId: true } });
  const vendaIds = vendas.map((v) => v.id);
  const unidadeIds = vendas.map((v) => v.unidadeId);

  await prisma.recebimentoProjetado.deleteMany({ where: { vendaId: { in: vendaIds } } });
  await prisma.venda.deleteMany({ where: { cenarioId: id } });
  if (unidadeIds.length > 0) {
    await prisma.unidade.updateMany({ where: { id: { in: unidadeIds } }, data: { status: "estoque" } });
  }
  await prisma.premissaVelocidadeVendas.deleteMany({ where: { cenarioId: id } });
  await prisma.custo.deleteMany({ where: { cenarioId: id } });
  await prisma.cronogramaFisicoFinanceiro.deleteMany({ where: { cenarioId: id } });
  await prisma.cenario.delete({ where: { id } });
}

export interface CriarTerrenoInput {
  empreendimentoId: string;
  areaValor?: string;
  areaUnidade?: string;
  areaStatusValidacao?: "pendente" | "validado" | "conflitante";
  areaObservacao?: string;
  formaAquisicao?: "compra" | "permuta" | "misto";
}

export async function criarTerreno(input: CriarTerrenoInput) {
  return prisma.terreno.create({ data: { areaUnidade: "m2", areaStatusValidacao: "pendente", ...input } });
}

export interface CriarTipologiaInput {
  empreendimentoId: string;
  nome: string;
  areaPrivativaPadrao?: string;
  precoUnitarioPadrao?: string;
}

export async function criarTipologia(input: CriarTipologiaInput) {
  return prisma.tipologia.create({ data: input });
}

export interface AtualizarTipologiaInput {
  nome?: string;
  areaPrivativaPadrao?: string | null;
  precoUnitarioPadrao?: string | null;
}

export async function atualizarTipologia(id: string, input: AtualizarTipologiaInput) {
  return prisma.tipologia.update({ where: { id }, data: input });
}

/**
 * Apaga uma tipologia e suas unidades/condicoes de pagamento — mas apenas
 * se nenhuma unidade dela ja foi vendida ou reservada (regra: nunca apagar
 * dado que uma Venda referencia). Devolve null em caso de sucesso, ou uma
 * mensagem explicando por que nao foi possivel apagar.
 */
export async function excluirTipologia(id: string): Promise<string | null> {
  const unidadeNaoDisponivel = await prisma.unidade.count({ where: { tipologiaId: id, status: { not: "estoque" } } });
  if (unidadeNaoDisponivel > 0) {
    return `Esta tipologia tem ${unidadeNaoDisponivel} unidade(s) vendida(s) ou reservada(s) — não é possível excluí-la sem antes excluir o cenário que gerou essas vendas.`;
  }
  await prisma.modalidadePagamento.deleteMany({ where: { condicaoPagamento: { tipologiaId: id } } });
  await prisma.condicaoPagamento.deleteMany({ where: { tipologiaId: id } });
  await prisma.premissaVelocidadeVendas.deleteMany({ where: { tipologiaId: id } });
  await prisma.unidade.deleteMany({ where: { tipologiaId: id } });
  await prisma.tipologia.delete({ where: { id } });
  return null;
}

export interface CriarUnidadesEmLoteInput {
  empreendimentoId: string;
  tipologiaId: string;
  quantidade: number;
  precoVenda: string;
  areaPrivativa?: string;
  prefixoNumero: string;
}

/** Cria N unidades identicas em estoque para uma tipologia (Fase 0: sem posicao/andar). */
export async function criarUnidadesEmLote(input: CriarUnidadesEmLoteInput) {
  const dados = Array.from({ length: input.quantidade }, (_, i) => ({
    empreendimentoId: input.empreendimentoId,
    tipologiaId: input.tipologiaId,
    numero: `${input.prefixoNumero}-${i + 1}`,
    precoVenda: input.precoVenda,
    areaPrivativa: input.areaPrivativa,
    status: "estoque",
  }));
  await prisma.unidade.createMany({ data: dados });
  return prisma.unidade.findMany({
    where: { empreendimentoId: input.empreendimentoId, tipologiaId: input.tipologiaId, numero: { startsWith: `${input.prefixoNumero}-` } },
  });
}

export interface CriarUnidadesPorAndarInput {
  empreendimentoId: string;
  tipologiaId: string;
  prefixoNumero: string;
  areaPrivativa?: string;
  andares: { andar: number; quantidade: number }[];
  precificacao: {
    precoBase: string;
    andarBase: number;
    incremento: string;
    tipoIncremento: "fixo" | "percentual";
  };
}

/**
 * Segunda estrategia de precificacao (achado F2, docs/DECISOES.md): gera
 * unidades com preco derivado de uma cascata por andar (ver
 * src/core/precificacaoAndar.ts), em vez de um precoVenda direto identico
 * para todas — sem exigir alteracao de schema, como planejado na decisao.
 */
export async function criarUnidadesPorAndar(input: CriarUnidadesPorAndarInput) {
  const regra: RegraPrecificacaoAndar = {
    precoBase: new Decimal(input.precificacao.precoBase),
    andarBase: input.precificacao.andarBase,
    incremento: new Decimal(input.precificacao.incremento),
    tipoIncremento: input.precificacao.tipoIncremento,
  };

  const dados: {
    empreendimentoId: string;
    tipologiaId: string;
    numero: string;
    andar: number;
    precoVenda: string;
    areaPrivativa?: string;
    status: string;
  }[] = [];

  for (const { andar, quantidade } of input.andares) {
    const preco = calcularPrecoPorAndar(andar, regra);
    for (let i = 1; i <= quantidade; i++) {
      dados.push({
        empreendimentoId: input.empreendimentoId,
        tipologiaId: input.tipologiaId,
        numero: `${input.prefixoNumero}-${andar}${String(i).padStart(2, "0")}`,
        andar,
        precoVenda: preco.toFixed(2),
        areaPrivativa: input.areaPrivativa,
        status: "estoque",
      });
    }
  }

  await prisma.unidade.createMany({ data: dados });
  return prisma.unidade.findMany({
    where: { empreendimentoId: input.empreendimentoId, tipologiaId: input.tipologiaId, numero: { startsWith: `${input.prefixoNumero}-` } },
    orderBy: [{ andar: "asc" }, { numero: "asc" }],
  });
}

export interface ModalidadeInput {
  nome: string;
  percentual: string;
  tipoDistribuicao: "unica_na_venda" | "nivelada" | "periodica" | "mes_fixo";
  periodicidadeMeses?: number;
  mesFixo?: number;
  repeticoesSobreTotal?: number;
  geraEventoParcial?: boolean;
  ordem?: number;
}

export interface CriarCondicaoPagamentoInput {
  empreendimentoId: string;
  tipologiaId?: string;
  nome: string;
  modalidades: ModalidadeInput[];
}

/** Cria a condicao de pagamento e suas modalidades, validando soma = 100% antes de gravar (regra R2). */
export async function criarCondicaoPagamento(input: CriarCondicaoPagamentoInput) {
  const condicaoParaValidar: CondicaoPagamentoCore = {
    id: "pre-insercao",
    nome: input.nome,
    modalidades: input.modalidades.map((m, i) => ({
      id: `pre-${i}`,
      nome: m.nome,
      percentual: new Decimal(m.percentual),
      tipoDistribuicao: m.tipoDistribuicao,
      periodicidadeMeses: m.periodicidadeMeses,
      mesFixo: m.mesFixo,
      repeticoesSobreTotal: m.repeticoesSobreTotal ?? 1,
      geraEventoParcial: m.geraEventoParcial ?? false,
      ordem: m.ordem ?? i,
    })),
  };

  const validacao = validarCondicaoPagamento(condicaoParaValidar);
  if (!validacao.valida) {
    throw new Error(`Condicao de pagamento "${input.nome}" invalida: ${validacao.erros.join("; ")}`);
  }

  return prisma.condicaoPagamento.create({
    data: {
      empreendimentoId: input.empreendimentoId,
      tipologiaId: input.tipologiaId,
      nome: input.nome,
      modalidades: {
        create: input.modalidades.map((m, i) => ({
          nome: m.nome,
          percentual: m.percentual,
          tipoDistribuicao: m.tipoDistribuicao,
          periodicidadeMeses: m.periodicidadeMeses,
          mesFixo: m.mesFixo,
          repeticoesSobreTotal: m.repeticoesSobreTotal ?? 1,
          geraEventoParcial: m.geraEventoParcial ?? false,
          ordem: m.ordem ?? i,
        })),
      },
    },
    include: { modalidades: true },
  });
}

export interface CriarPremissaVelocidadeInput {
  empreendimentoId: string;
  cenarioId: string;
  tipologiaId: string;
  mes: number;
  unidadesPrevistas: string;
}

export async function criarPremissaVelocidade(inputs: CriarPremissaVelocidadeInput[]) {
  await prisma.premissaVelocidadeVendas.createMany({ data: inputs });
}

export interface CriarCategoriaCustoInput {
  empreendimentoId?: string;
  nome: string;
  tipoIncidencia: "fixo" | "pct_vgv_vendido_no_mes" | "pct_recebido_mes_anterior" | "pct_execucao";
}

export async function criarCategoriaCusto(input: CriarCategoriaCustoInput) {
  return prisma.categoriaCusto.create({ data: input });
}

export interface CriarCustoInput {
  empreendimentoId: string;
  cenarioId: string;
  categoriaId: string;
  valorPrevisto?: string;
  percentual?: string;
  competenciaMes?: number;
  vencimentoMes?: number;
  recorrencia?: "unico" | "mensal";
  participaFluxoCaixa?: boolean;
}

export async function criarCusto(input: CriarCustoInput) {
  return prisma.custo.create({
    data: { recorrencia: "unico", participaFluxoCaixa: true, ...input },
  });
}

export interface CriarCronogramaInput {
  empreendimentoId: string;
  cenarioId: string;
  pontos: { mes: number; percentualExecucaoMensal: string }[];
}

/** Cria o cronograma fisico-financeiro, validando que a soma dos percentuais fecha em 100% (regra R6). */
export async function criarCronograma(input: CriarCronogramaInput) {
  const validacao = validarCronograma(
    input.pontos.map((p) => ({ mes: p.mes, percentualExecucaoMensal: new Decimal(p.percentualExecucaoMensal) })),
  );
  if (!validacao.valido) {
    throw new Error(`Cronograma invalido: soma dos percentuais = ${validacao.soma.toString()}, esperado 1`);
  }

  await prisma.cronogramaFisicoFinanceiro.createMany({
    data: input.pontos.map((p) => ({
      empreendimentoId: input.empreendimentoId,
      cenarioId: input.cenarioId,
      mes: p.mes,
      percentualExecucaoMensal: p.percentualExecucaoMensal,
    })),
  });
}
