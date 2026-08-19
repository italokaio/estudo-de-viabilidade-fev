import { Decimal } from "decimal.js";
import { validarCondicaoPagamento, validarCronograma } from "../core/index.js";
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
