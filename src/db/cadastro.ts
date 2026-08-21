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
  await prisma.distrato.deleteMany({ where: { vendaId: { in: vendaIds } } });
  await prisma.venda.deleteMany({ where: { empreendimentoId: id } });
  await prisma.premissaVelocidadeVendas.deleteMany({ where: { empreendimentoId: id } });
  await prisma.modalidadePagamento.deleteMany({ where: { condicaoPagamento: { empreendimentoId: id } } });
  await prisma.condicaoPagamento.deleteMany({ where: { empreendimentoId: id } });
  await prisma.permuta.deleteMany({ where: { empreendimentoId: id } });
  await prisma.unidade.deleteMany({ where: { empreendimentoId: id } });
  await prisma.cronogramaFisicoFinanceiro.deleteMany({ where: { empreendimentoId: id } });
  await prisma.indiceCorrecao.deleteMany({ where: { empreendimentoId: id } });
  await prisma.financiamentoProducao.deleteMany({ where: { empreendimentoId: id } });
  await prisma.custo.deleteMany({ where: { empreendimentoId: id } });
  await prisma.categoriaCusto.deleteMany({ where: { empreendimentoId: id } });
  await prisma.tipologia.deleteMany({ where: { empreendimentoId: id } });
  await prisma.terreno.deleteMany({ where: { empreendimentoId: id } });
  await prisma.cenario.deleteMany({ where: { empreendimentoId: id } });
  await prisma.empreendimentoUsuario.deleteMany({ where: { empreendimentoId: id } });
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
  await prisma.distrato.deleteMany({ where: { vendaId: { in: vendaIds } } });
  await prisma.venda.deleteMany({ where: { cenarioId: id } });
  if (unidadeIds.length > 0) {
    await prisma.unidade.updateMany({ where: { id: { in: unidadeIds } }, data: { status: "estoque" } });
  }
  await prisma.premissaVelocidadeVendas.deleteMany({ where: { cenarioId: id } });
  await prisma.custo.deleteMany({ where: { cenarioId: id } });
  await prisma.cronogramaFisicoFinanceiro.deleteMany({ where: { cenarioId: id } });
  await prisma.indiceCorrecao.deleteMany({ where: { cenarioId: id } });
  await prisma.financiamentoProducao.deleteMany({ where: { cenarioId: id } });
  // Um cenario duplicado (achado F10, docs/DECISOES.md) referencia o
  // original via derivadoDeCenarioId, sem cascade -- sem isso, excluir um
  // cenario que tem duplicatas falharia por violacao de chave estrangeira.
  // As duplicatas simplesmente perdem o vinculo historico, continuam
  // existindo normalmente.
  await prisma.cenario.updateMany({ where: { derivadoDeCenarioId: id }, data: { derivadoDeCenarioId: null } });
  await prisma.cenario.delete({ where: { id } });
}

/**
 * Duplica um cenario (achado F10, docs/DECISOES.md — "versao de cenario"):
 * copia premissas de velocidade, custos, cronograma, indice de correcao e
 * financiamento para um cenario novo, independente, com
 * derivadoDeCenarioId apontando para o original. Deliberadamente NAO
 * copia Venda: Unidade.status e compartilhado entre todos os cenarios do
 * mesmo empreendimento (ver excluirCenario), entao duplicar vendas
 * colocaria duas Venda em cenarios diferentes referenciando a mesma
 * unidade "vendida" ao mesmo tempo -- uma classe inteira de bug evitada
 * simplesmente nao copiando. O cenario duplicado pode gerar suas
 * proprias vendas a partir das premissas de velocidade clonadas, sujeito
 * ao estoque disponivel no momento (que pode ja estar parcialmente
 * consumido pelo cenario original).
 */
export async function duplicarCenario(cenarioId: string, novoNome: string) {
  const original = await prisma.cenario.findUniqueOrThrow({ where: { id: cenarioId } });

  const novo = await prisma.cenario.create({
    data: {
      empreendimentoId: original.empreendimentoId,
      tipo: original.tipo,
      nome: novoNome,
      horizonteProjecaoMeses: original.horizonteProjecaoMeses,
      derivadoDeCenarioId: original.id,
    },
  });

  const premissas = await prisma.premissaVelocidadeVendas.findMany({ where: { cenarioId } });
  if (premissas.length > 0) {
    await prisma.premissaVelocidadeVendas.createMany({
      data: premissas.map((p) => ({ empreendimentoId: p.empreendimentoId, cenarioId: novo.id, tipologiaId: p.tipologiaId, mes: p.mes, unidadesPrevistas: p.unidadesPrevistas })),
    });
  }

  const cronograma = await prisma.cronogramaFisicoFinanceiro.findMany({ where: { cenarioId } });
  if (cronograma.length > 0) {
    await prisma.cronogramaFisicoFinanceiro.createMany({
      data: cronograma.map((p) => ({ empreendimentoId: p.empreendimentoId, cenarioId: novo.id, mes: p.mes, percentualExecucaoMensal: p.percentualExecucaoMensal })),
    });
  }

  const indices = await prisma.indiceCorrecao.findMany({ where: { cenarioId } });
  if (indices.length > 0) {
    await prisma.indiceCorrecao.createMany({
      data: indices.map((i) => ({ empreendimentoId: i.empreendimentoId, cenarioId: novo.id, mes: i.mes, percentual: i.percentual })),
    });
  }

  const financiamento = await prisma.financiamentoProducao.findUnique({ where: { cenarioId } });
  if (financiamento) {
    await prisma.financiamentoProducao.create({
      data: {
        empreendimentoId: financiamento.empreendimentoId,
        cenarioId: novo.id,
        valorContratado: financiamento.valorContratado,
        taxaJurosMensal: financiamento.taxaJurosMensal,
        mesAmortizacao: financiamento.mesAmortizacao,
      },
    });
  }

  // valorRealizado/status NAO copiados -- o custo duplicado comeca "previsto", mesmo se o original ja tinha sido marcado como realizado.
  const custos = await prisma.custo.findMany({ where: { cenarioId } });
  if (custos.length > 0) {
    await prisma.custo.createMany({
      data: custos.map((c) => ({
        empreendimentoId: c.empreendimentoId,
        cenarioId: novo.id,
        categoriaId: c.categoriaId,
        valorPrevisto: c.valorPrevisto,
        percentual: c.percentual,
        competenciaMes: c.competenciaMes,
        vencimentoMes: c.vencimentoMes,
        recorrencia: c.recorrencia,
        participaFluxoCaixa: c.participaFluxoCaixa,
      })),
    });
  }

  return novo;
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

export interface DefinirTerrenoInput {
  areaValor?: string | null;
  areaUnidade?: string;
  areaStatusValidacao?: "pendente" | "validado" | "conflitante";
  areaObservacao?: string | null;
  formaAquisicao?: "compra" | "permuta" | "misto" | null;
}

/** Cria ou atualiza o terreno de um empreendimento pela interface — upsert, já que é 1:1 (no máximo um terreno por empreendimento). */
export async function definirTerreno(empreendimentoId: string, input: DefinirTerrenoInput) {
  return prisma.terreno.upsert({
    where: { empreendimentoId },
    update: input,
    create: { empreendimentoId, areaUnidade: "m2", areaStatusValidacao: "pendente", ...input },
  });
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

export interface RegistrarPermutaInput {
  unidadeId: string;
  nomeContraparte: string;
  documento?: string;
  valorAtribuido?: string;
  dataAcordo?: Date;
  observacao?: string;
}

/**
 * Cadastro nominal completo de uma permuta (achado F3, docs/DECISOES.md).
 * So permite permutar unidade em estoque — a mesma regra que ja vale para
 * venda (uma unidade so tem um destino). Ao registrar, marca a unidade
 * como 'permutada', que ja e o suficiente para o motor financeiro
 * (exclui do estoque disponivel e do VGV de venda, sem nenhuma mudanca
 * necessaria em src/core).
 */
export async function registrarPermuta(input: RegistrarPermutaInput): Promise<{ erro: string } | { permuta: Awaited<ReturnType<typeof prisma.permuta.create>> }> {
  const unidade = await prisma.unidade.findUnique({ where: { id: input.unidadeId } });
  if (!unidade) return { erro: "Unidade não encontrada" };
  if (unidade.status !== "estoque") {
    return { erro: `Esta unidade está com status "${unidade.status}" — só é possível registrar permuta de uma unidade em estoque` };
  }
  const permuta = await prisma.permuta.create({
    data: {
      empreendimentoId: unidade.empreendimentoId,
      unidadeId: unidade.id,
      nomeContraparte: input.nomeContraparte,
      documento: input.documento,
      valorAtribuido: input.valorAtribuido,
      dataAcordo: input.dataAcordo,
      observacao: input.observacao,
    },
  });
  await prisma.unidade.update({ where: { id: unidade.id }, data: { status: "permutada" } });
  return { permuta };
}

export interface AtualizarPermutaInput {
  nomeContraparte?: string;
  documento?: string | null;
  valorAtribuido?: string | null;
  dataAcordo?: Date | null;
  observacao?: string | null;
}

/** Atualiza os dados nominais de uma permuta já registrada — nunca muda o status da unidade (isso é papel de registrar/desfazer). */
export async function atualizarPermuta(unidadeId: string, input: AtualizarPermutaInput): Promise<{ erro: string } | { permuta: Awaited<ReturnType<typeof prisma.permuta.update>> }> {
  const existente = await prisma.permuta.findUnique({ where: { unidadeId } });
  if (!existente) return { erro: "Esta unidade não tem permuta registrada" };
  const permuta = await prisma.permuta.update({ where: { unidadeId }, data: input });
  return { permuta };
}

/** Desfaz uma permuta: apaga o registro e devolve a unidade ao estoque. */
export async function desfazerPermuta(unidadeId: string): Promise<string | null> {
  const permuta = await prisma.permuta.findUnique({ where: { unidadeId } });
  if (!permuta) return "Esta unidade não tem permuta registrada";
  await prisma.permuta.delete({ where: { unidadeId } });
  await prisma.unidade.update({ where: { id: unidadeId }, data: { status: "estoque" } });
  return null;
}

export interface RegistrarDistratoInput {
  vendaId: string;
  /** 0..1 — fração do valor já recebido que a incorporadora retém. Sem informar, assume 0 (reembolso integral). */
  percentualRetencao?: string;
  motivo?: string;
}

/**
 * Cancela uma venda (achado F7, docs/DECISOES.md). Marca a Venda como
 * "distratada" -- o motor ja filtra por status="ativa" ao ler vendas do
 * cenario (src/db/servicoMotor.ts), entao esta venda simplesmente some do
 * proximo fluxo de caixa recalculado, sem nenhuma mudanca necessaria no
 * motor. A unidade volta ao estoque, disponivel para uma nova venda. O
 * valor retido/a reembolsar e calculado sobre o que ja foi efetivamente
 * recebido (RecebimentoProjetado.valorRealizado, nao o previsto) ate o
 * momento do distrato -- e um registro historico, nunca recalculado depois.
 */
export async function registrarDistrato(input: RegistrarDistratoInput): Promise<{ erro: string } | { distrato: Awaited<ReturnType<typeof prisma.distrato.create>> }> {
  const venda = await prisma.venda.findUnique({ where: { id: input.vendaId } });
  if (!venda) return { erro: "Venda não encontrada" };
  if (venda.status === "distratada") return { erro: "Esta venda já foi distratada" };

  const recebidos = await prisma.recebimentoProjetado.findMany({ where: { vendaId: venda.id, status: "recebido" } });
  const valorRecebido = recebidos.reduce((acc, r) => acc.plus(new Decimal(r.valorRealizado ?? "0")), new Decimal(0));
  const percentualRetencao = input.percentualRetencao ?? "0";
  const valorRetido = valorRecebido.times(new Decimal(percentualRetencao));
  const valorReembolsar = valorRecebido.minus(valorRetido);

  const distrato = await prisma.distrato.create({
    data: {
      empreendimentoId: venda.empreendimentoId,
      vendaId: venda.id,
      valorRecebidoAteDistrato: valorRecebido.toFixed(2),
      percentualRetencao,
      valorRetido: valorRetido.toFixed(2),
      valorReembolsar: valorReembolsar.toFixed(2),
      motivo: input.motivo,
    },
  });
  await prisma.venda.update({ where: { id: venda.id }, data: { status: "distratada" } });
  await prisma.unidade.update({ where: { id: venda.unidadeId }, data: { status: "estoque" } });

  return { distrato };
}

/**
 * Desfaz um distrato: apaga o registro, reativa a venda e marca a unidade
 * como vendida de novo. Bloqueado se a unidade ja teve outro destino desde
 * o distrato (vendida de novo, permutada) -- mesma logica de
 * "uma unidade so tem um destino" usada em registrarPermuta.
 */
export async function desfazerDistrato(vendaId: string): Promise<string | null> {
  const distrato = await prisma.distrato.findUnique({ where: { vendaId } });
  if (!distrato) return "Esta venda não tem distrato registrado";
  const venda = await prisma.venda.findUniqueOrThrow({ where: { id: vendaId } });
  const unidade = await prisma.unidade.findUniqueOrThrow({ where: { id: venda.unidadeId } });
  if (unidade.status !== "estoque") {
    return `A unidade está com status "${unidade.status}" — não é possível desfazer o distrato sem antes desfazer o que foi feito com ela depois.`;
  }
  await prisma.distrato.delete({ where: { vendaId } });
  await prisma.venda.update({ where: { id: vendaId }, data: { status: "ativa" } });
  await prisma.unidade.update({ where: { id: venda.unidadeId }, data: { status: "vendida" } });
  return null;
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

export interface AtualizarCondicaoPagamentoInput {
  nome?: string;
  modalidades?: ModalidadeInput[];
}

/**
 * Atualiza uma condicao de pagamento — bloqueada se alguma Venda ja a usa
 * (mesma logica de excluirCondicaoPagamento: trocar as modalidades depois
 * que ja existem RecebimentoProjetado gerados a partir delas deixaria
 * recebimentos orfaos ou com um id de modalidade que deixou de existir).
 * Sem `modalidades` no input, atualiza so o nome.
 */
export async function atualizarCondicaoPagamento(id: string, input: AtualizarCondicaoPagamentoInput): Promise<{ erro: string } | { condicao: Awaited<ReturnType<typeof prisma.condicaoPagamento.update>> }> {
  const emUso = await prisma.venda.count({ where: { condicaoPagamentoId: id } });
  if (emUso > 0 && input.modalidades) {
    return { erro: `Esta condição de pagamento já foi usada em ${emUso} venda(s) — não é possível alterar as modalidades sem antes excluir o cenário que gerou essas vendas.` };
  }

  if (input.modalidades) {
    const condicaoAtual = await prisma.condicaoPagamento.findUnique({ where: { id } });
    if (!condicaoAtual) return { erro: "Condição de pagamento não encontrada" };
    const condicaoParaValidar: CondicaoPagamentoCore = {
      id: "pre-atualizacao",
      nome: input.nome ?? condicaoAtual.nome,
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
      return { erro: `Condição de pagamento inválida: ${validacao.erros.join("; ")}` };
    }
    await prisma.modalidadePagamento.deleteMany({ where: { condicaoPagamentoId: id } });
    await prisma.modalidadePagamento.createMany({
      data: input.modalidades.map((m, i) => ({
        condicaoPagamentoId: id,
        nome: m.nome,
        percentual: m.percentual,
        tipoDistribuicao: m.tipoDistribuicao,
        periodicidadeMeses: m.periodicidadeMeses,
        mesFixo: m.mesFixo,
        repeticoesSobreTotal: m.repeticoesSobreTotal ?? 1,
        geraEventoParcial: m.geraEventoParcial ?? false,
        ordem: m.ordem ?? i,
      })),
    });
  }

  const condicao = await prisma.condicaoPagamento.update({ where: { id }, data: { nome: input.nome } });
  return { condicao };
}

/** Apaga uma condicao de pagamento — bloqueada se alguma Venda ja a usa. */
export async function excluirCondicaoPagamento(id: string): Promise<string | null> {
  const emUso = await prisma.venda.count({ where: { condicaoPagamentoId: id } });
  if (emUso > 0) {
    return `Esta condição de pagamento já foi usada em ${emUso} venda(s) — não é possível excluí-la sem antes excluir o cenário que gerou essas vendas.`;
  }
  await prisma.modalidadePagamento.deleteMany({ where: { condicaoPagamentoId: id } });
  await prisma.condicaoPagamento.delete({ where: { id } });
  return null;
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

export interface AtualizarCategoriaCustoInput {
  nome?: string;
  tipoIncidencia?: "fixo" | "pct_vgv_vendido_no_mes" | "pct_recebido_mes_anterior" | "pct_execucao";
}

/**
 * Atualiza uma categoria de custo. Trocar o tipo de incidencia e bloqueado
 * se algum Custo ja usa esta categoria — os campos preenchidos num Custo
 * dependem do tipo (fixo pede valorPrevisto+competenciaMes, percentual
 * pede so percentual — ver /api/cenarios/:id/custos), trocar o tipo por
 * baixo quebraria essa suposicao sem re-cadastrar os custos existentes.
 * O nome pode ser alterado livremente, mesmo em uso.
 */
export async function atualizarCategoriaCusto(id: string, input: AtualizarCategoriaCustoInput): Promise<{ erro: string } | { categoria: Awaited<ReturnType<typeof prisma.categoriaCusto.update>> }> {
  if (input.tipoIncidencia) {
    const categoriaAtual = await prisma.categoriaCusto.findUnique({ where: { id } });
    if (!categoriaAtual) return { erro: "Categoria de custo não encontrada" };
    // so bloqueia se o tipo esta REALMENTE mudando — reenviar o mesmo valor
    // (ex.: um formulario que sempre manda tipoIncidencia junto do nome)
    // nao pode impedir renomear uma categoria ja em uso.
    if (input.tipoIncidencia !== categoriaAtual.tipoIncidencia) {
      const emUso = await prisma.custo.count({ where: { categoriaId: id } });
      if (emUso > 0) {
        return { erro: `Esta categoria já tem ${emUso} custo(s) cadastrado(s) — não é possível trocar o tipo de incidência sem antes excluir esses custos.` };
      }
    }
  }
  const categoria = await prisma.categoriaCusto.update({ where: { id }, data: input });
  return { categoria };
}

/** Apaga uma categoria de custo — bloqueada se algum Custo ja a usa. */
export async function excluirCategoriaCusto(id: string): Promise<string | null> {
  const emUso = await prisma.custo.count({ where: { categoriaId: id } });
  if (emUso > 0) {
    return `Esta categoria tem ${emUso} custo(s) cadastrado(s) — não é possível excluí-la sem antes excluir esses custos.`;
  }
  await prisma.categoriaCusto.delete({ where: { id } });
  return null;
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

export interface AtualizarCustoInput {
  valorPrevisto?: string | null;
  percentual?: string | null;
  competenciaMes?: number | null;
  recorrencia?: "unico" | "mensal";
}

/** Custo nao tem nada que dependa dele — atualizar e excluir sao diretos. */
export async function atualizarCusto(id: string, input: AtualizarCustoInput) {
  return prisma.custo.update({ where: { id }, data: input });
}

export async function excluirCusto(id: string) {
  await prisma.custo.delete({ where: { id } });
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

/**
 * Apaga o cronograma inteiro de um cenario — nao um ponto isolado. Editar
 * ou apagar um unico mes quebraria a regra de soma=100% (R6) sem uma tela
 * de edicao completa; a forma corrigida de "editar" um cronograma nesta
 * fase e excluir tudo e recriar (o formulario de criacao ja reaparece
 * assim que a tabela fica vazia — ver CronogramaSecao no web). Sem
 * bloqueio: nenhuma linha depende de CronogramaFisicoFinanceiro por FK —
 * um custo pct_execucao sem cronograma simplesmente nao gera desembolso
 * ate um novo cronograma ser cadastrado.
 */
export async function excluirCronograma(cenarioId: string) {
  await prisma.cronogramaFisicoFinanceiro.deleteMany({ where: { cenarioId } });
}

export interface DefinirPontoIndiceCorrecaoInput {
  empreendimentoId: string;
  cenarioId: string;
  mes: number;
  percentual: string;
}

/**
 * Cadastra ou atualiza a variacao do indice de correcao monetaria (achado
 * F6, docs/DECISOES.md) para um mes do cenario. Upsert por mes, ao
 * contrario do cronograma (R6): cada mes e independente, sem soma
 * obrigatoria, entao o usuario pode completar a serie aos poucos conforme
 * novos indices sao divulgados, sem precisar apagar e recriar tudo.
 */
export async function definirPontoIndiceCorrecao(input: DefinirPontoIndiceCorrecaoInput) {
  return prisma.indiceCorrecao.upsert({
    where: { cenarioId_mes: { cenarioId: input.cenarioId, mes: input.mes } },
    update: { percentual: input.percentual },
    create: input,
  });
}

/** Remove a variacao cadastrada para um mes -- aquele mes volta a nao corrigir (fator=1). */
export async function excluirPontoIndiceCorrecao(cenarioId: string, mes: number) {
  await prisma.indiceCorrecao.deleteMany({ where: { cenarioId, mes } });
}

export interface DefinirFinanciamentoInput {
  empreendimentoId: string;
  cenarioId: string;
  valorContratado: string;
  taxaJurosMensal: string;
  mesAmortizacao: number;
}

/** Cria ou atualiza o financiamento de producao de um cenario (achado F8, docs/DECISOES.md) -- upsert, um financiamento por cenario nesta fase. */
export async function definirFinanciamento(input: DefinirFinanciamentoInput) {
  const { cenarioId, ...dados } = input;
  return prisma.financiamentoProducao.upsert({
    where: { cenarioId },
    update: dados,
    create: { cenarioId, ...dados },
  });
}

/** Remove o financiamento do cenario -- o cenario volta a nao ter financiamento (comportamento identico a antes desta fatia). */
export async function excluirFinanciamento(cenarioId: string) {
  await prisma.financiamentoProducao.deleteMany({ where: { cenarioId } });
}
