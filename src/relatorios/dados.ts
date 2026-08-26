import { Decimal } from "decimal.js";
import { prisma } from "../db/client.js";
import { listarRecebimentosDoCenario, listarVendasDoCenario, resumoEstoque } from "../db/cadastro.js";
import {
  montarComparacaoCenarios,
  montarCurvaCronogramaDoCenario,
  montarCustosResumoDoCenario,
  montarPremissasResumoCenario,
  rodarMotorParaCenario,
  type ComparacaoCenario,
  type CustoResumoGerencial,
  type PremissasResumoCenario,
} from "../db/servicoMotor.js";

/**
 * Fase 2.5 — módulo de relatórios: esta camada só agrega dados já oficiais
 * (motor + banco), nunca calcula nada. Toda "regra financeira" usada aqui
 * já existe em src/core/src/db, chamada sem nenhuma mudança — ver
 * docs/DECISOES.md, achado F34.
 */

export interface DadosRelatorioViabilidade {
  geradoEm: string;
  empreendimento: {
    id: string;
    nome: string;
    incorporador: string | null;
    endereco: string | null;
    terrenos: { numeroMatricula: string | null; areaValor: string | null; areaUnidade: string; formaAquisicao: string | null }[];
  };
  cenario: {
    id: string;
    nome: string;
    tipo: string;
    horizonteProjecaoMeses: number;
    derivadoDeNome: string | null;
  };
  resumoExecutivo: {
    vgv: string;
    quantidadeUnidades: number;
    unidadesVendidas: number;
    totalRecebimentosPrevisto: string;
    totalCustosPrevisto: string;
    saldoFinal: string;
    necessidadeMaximaCapital: string;
    mesPico: number | null;
    mesRecuperacao: number | null;
    vpl: string;
  };
  premissas: PremissasResumoCenario;
  produto: {
    tipologias: { id: string; nome: string; areaPrivativaPadrao: string | null; precoUnitarioPadrao: string | null; quantidadeUnidades: number }[];
    estoque: { total: number; porStatus: Record<string, number> };
  };
  vendas: {
    unidadeNumero: string;
    tipologiaNome: string;
    comprador: string | null;
    mesOrigem: number;
    valorVenda: string;
    condicaoPagamentoNome: string;
    status: string;
  }[];
  recebimentos: { unidadeNumero: string; modalidadeNome: string; mesCompetencia: number; valorPrevisto: string; valorRealizado: string | null; status: string }[];
  custos: CustoResumoGerencial[];
  /** vazio = nenhum cronograma cadastrado neste cenário (Fase 2.3). */
  cronograma: { mes: number; percentualExecucaoMensal: string; percentualAcumulado: string; desembolsoMensal: string; desembolsoAcumulado: string }[];
  fluxoCaixa: { mes: number; entradas: string; saidas: string; fluxoMensal: string; fluxoAcumulado: string }[];
  financiamento: { mes: number; liberacao: string; jurosDoMes: string; amortizacao: string; saldoDevedor: string }[];
  alertas: { tipo: string; severidade: string; mensagem: string }[];
}

export async function montarDadosRelatorioViabilidade(cenarioId: string): Promise<DadosRelatorioViabilidade> {
  const cenario = await prisma.cenario.findUniqueOrThrow({
    where: { id: cenarioId },
    include: { derivadoDe: { select: { nome: true } } },
  });
  const empreendimento = await prisma.empreendimento.findUniqueOrThrow({
    where: { id: cenario.empreendimentoId },
    include: { terrenos: true, tipologias: { include: { _count: { select: { unidades: true } } } } },
  });

  // rodarMotorParaCenario persiste RecebimentoProjetado/DesembolsoCusto por
  // upsert-diff (mesmo cenarioId) -- montarCustosResumoDoCenario e
  // montarCurvaCronogramaDoCenario chamam essa mesma funcao por dentro.
  // Rodar as tres em paralelo (Promise.all) faz duas gravacoes concorrentes
  // colidirem na mesma chave unica (custoId, mes). Por isso sequencial aqui,
  // nunca em paralelo -- so as leituras puras abaixo (sem nenhum efeito
  // colateral de persistencia) podem rodar juntas com segurança.
  //
  // taxaDescontoMensal="0.005" (0,5% a.m.) e a mesma taxa hardcoded ja
  // usada por GET /fluxo-caixa e por montarComparacaoCenarios (Fase 2.4) --
  // sem isso o VPL do relatorio divergiria do VPL oficial exibido no
  // sistema, violando a fonte unica da verdade (docs/DECISOES.md, F34).
  const resultado = await rodarMotorParaCenario(cenarioId, { taxaDescontoMensal: "0.005" });
  const custos = await montarCustosResumoDoCenario(cenarioId);
  const cronograma = await montarCurvaCronogramaDoCenario(cenarioId);
  const [premissas, vendasDb, recebimentosDb, estoque] = await Promise.all([
    montarPremissasResumoCenario(cenario),
    listarVendasDoCenario(cenarioId),
    listarRecebimentosDoCenario(cenarioId),
    resumoEstoque(empreendimento.id),
  ]);

  const vendasAtivas = vendasDb.filter((v) => v.status === "ativa");
  const vgv = vendasAtivas.reduce((acc, v) => acc.plus(v.valorVenda), new Decimal(0));
  const totalRecebimentosPrevisto = resultado.recebimentos.reduce((acc, r) => acc.plus(r.valorPrevisto), new Decimal(0));
  const totalCustosPrevisto = resultado.desembolsos.reduce((acc, d) => acc.plus(d.valor), new Decimal(0));

  return {
    geradoEm: new Date().toISOString(),
    empreendimento: {
      id: empreendimento.id,
      nome: empreendimento.nome,
      incorporador: empreendimento.incorporador,
      endereco: empreendimento.endereco,
      terrenos: empreendimento.terrenos.map((t) => ({
        numeroMatricula: t.numeroMatricula,
        areaValor: t.areaValor,
        areaUnidade: t.areaUnidade,
        formaAquisicao: t.formaAquisicao,
      })),
    },
    cenario: {
      id: cenario.id,
      nome: cenario.nome,
      tipo: cenario.tipo,
      horizonteProjecaoMeses: cenario.horizonteProjecaoMeses,
      derivadoDeNome: cenario.derivadoDe?.nome ?? null,
    },
    resumoExecutivo: {
      vgv: vgv.toFixed(2),
      quantidadeUnidades: estoque.total,
      unidadesVendidas: vendasAtivas.length,
      totalRecebimentosPrevisto: totalRecebimentosPrevisto.toFixed(2),
      totalCustosPrevisto: totalCustosPrevisto.toFixed(2),
      saldoFinal: resultado.indicadores.saldoFinal.toFixed(2),
      necessidadeMaximaCapital: resultado.indicadores.necessidadeMaximaCapital.toFixed(2),
      mesPico: resultado.indicadores.mesPico,
      mesRecuperacao: resultado.indicadores.mesRecuperacao,
      vpl: resultado.indicadores.vpl.toFixed(2),
    },
    premissas,
    produto: {
      tipologias: empreendimento.tipologias.map((t) => ({
        id: t.id,
        nome: t.nome,
        areaPrivativaPadrao: t.areaPrivativaPadrao,
        precoUnitarioPadrao: t.precoUnitarioPadrao,
        quantidadeUnidades: t._count.unidades,
      })),
      estoque,
    },
    vendas: vendasDb.map((v) => ({
      unidadeNumero: v.unidade.numero,
      tipologiaNome: v.unidade.tipologia.nome,
      comprador: v.comprador,
      mesOrigem: v.mesOrigem,
      valorVenda: new Decimal(v.valorVenda).toFixed(2),
      condicaoPagamentoNome: v.condicaoPagamento.nome,
      status: v.status,
    })),
    recebimentos: recebimentosDb.map((r) => ({
      unidadeNumero: r.venda.unidade.numero,
      modalidadeNome: r.modalidade.nome,
      mesCompetencia: r.mesCompetencia,
      valorPrevisto: new Decimal(r.valorPrevisto).toFixed(2),
      valorRealizado: r.valorRealizado,
      status: r.status,
    })),
    custos,
    cronograma: cronograma.map((p) => ({
      mes: p.mes,
      percentualExecucaoMensal: p.percentualExecucaoMensal.toString(),
      percentualAcumulado: p.percentualAcumulado.toString(),
      desembolsoMensal: p.desembolsoMensal.toFixed(2),
      desembolsoAcumulado: p.desembolsoAcumulado.toFixed(2),
    })),
    fluxoCaixa: resultado.fluxo.map((f) => ({
      mes: f.mes,
      entradas: f.entradas.toFixed(2),
      saidas: f.saidas.toFixed(2),
      fluxoMensal: f.fluxoMensal.toFixed(2),
      fluxoAcumulado: f.fluxoAcumulado.toFixed(2),
    })),
    financiamento: resultado.financiamento.map((f) => ({
      mes: f.mes,
      liberacao: f.liberacao.toFixed(2),
      jurosDoMes: f.jurosDoMes.toFixed(2),
      amortizacao: f.amortizacao.toFixed(2),
      saldoDevedor: f.saldoDevedor.toFixed(2),
    })),
    alertas: resultado.alertas,
  };
}

export interface DadosRelatorioComparativo {
  geradoEm: string;
  empreendimento: { id: string; nome: string };
  cenarios: ComparacaoCenario[];
}

export async function montarDadosRelatorioComparativo(empreendimentoId: string, cenarioIds: string[]): Promise<DadosRelatorioComparativo> {
  const empreendimento = await prisma.empreendimento.findUniqueOrThrow({ where: { id: empreendimentoId }, select: { id: true, nome: true } });
  const cenarios = await montarComparacaoCenarios(empreendimentoId, cenarioIds);
  return { geradoEm: new Date().toISOString(), empreendimento, cenarios };
}
