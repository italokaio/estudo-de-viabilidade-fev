/**
 * Premissas do empreendimento Splendido, extraidas da planilha
 * VIABILIDADE.xlsx durante a engenharia reversa (Fase 1). Este arquivo NAO
 * contem nenhuma logica de calculo — apenas os numeros brutos, cada um
 * com a celula de origem documentada. E consumido uma unica vez pelo
 * importador (src/import/importadorSplendido.ts); depois da carga inicial,
 * a planilha deixa de ser consultada (principio E — Excel nao e o banco
 * do sistema).
 *
 * Onde a planilha divergia de si mesma ou usava uma referencia quebrada,
 * a decisao tomada esta documentada em docs/DIVERGENCIAS_PLANILHA.md — este
 * arquivo so contem o valor final decidido, com a referencia ao achado.
 */

export const splendidoEmpreendimento = {
  nome: "Splendido",
  incorporador: "Splendido Incorporações e Investimentos Ltda",
  endereco: "QNM 33 Área Especial C - Ceilândia Sul, Ceilândia/DF",
  dataPrevistaConclusao: new Date("2024-06-30"),
};

/**
 * Horizonte de projecao: a planilha original (aba FLUXO CAIXA) vai ate o
 * mes 40 para acomodar o repasse do financiamento bancario em 3 parcelas
 * finais (meses 37-39), alem dos 36 meses de obra. Nao e um limite do
 * motor — e o valor configurado para ESTE cenario.
 */
export const splendidoCenarioBase = {
  tipo: "base" as const,
  nome: "Base",
  horizonteProjecaoMeses: 40,
  taxaDescontoMensalVpl: "0.005", // FLUXO CAIXA!K44 = NPV(0.5%, ...)
};

/**
 * Achado C1 (Fase 1): SINTESE!C3 (=50*100) registra 5.000 m²; LEGAL!B4
 * registra 3.000 m². Nenhuma das duas abas referencia a outra. Mantido
 * como conflito nao resolvido — nao escolhido arbitrariamente.
 */
export const splendidoTerreno = {
  areaValor: undefined as string | undefined,
  areaStatusValidacao: "conflitante" as const,
  areaObservacao:
    "SINTESE!C3 (formula =50*100) registra 5.000 m²; LEGAL!B4 registra 3.000 m² (texto). " +
    "Nenhuma fórmula liga as duas abas. Conflito C1 da Fase 1 — não resolvido automaticamente.",
  formaAquisicao: "misto" as const, // permuta parcial (aba PERMUTA) + escritura propria (aba LEGAL)
};

/**
 * Tipologias e preco medio por unidade (nao por m² — apesar do rotulo
 * "Média m²" nas células de origem, o valor é o preço médio TOTAL da
 * unidade; confirmado batendo com SÍNTESE!E9 = B9 * 'TABELA APS'!P12).
 * Preço direto por decisão F2 (Fase 0): sem cascata de preço por andar
 * nesta fase.
 */
export const splendidoTipologias = [
  {
    chave: "1Q",
    nome: "1 Quarto",
    areaPrivativaPadrao: "32", // SINTESE!C9
    precoUnitarioPadrao: "198078.516023047", // TABELA APS!P12
  },
  {
    chave: "2Q",
    nome: "2 Quartos",
    areaPrivativaPadrao: "58.3", // SINTESE!C11
    precoUnitarioPadrao: "305793.67269007524", // TABELA APS!P13
  },
  {
    chave: "LOJA",
    nome: "Loja",
    areaPrivativaPadrao: "28", // SINTESE!C13
    precoUnitarioPadrao: "726187.5", // TABELA LOJAS!N9
  },
  {
    chave: "VAGA",
    nome: "Vaga de Garagem",
    areaPrivativaPadrao: "12", // SINTESE!C15
    precoUnitarioPadrao: "25627.118644067796", // TABELA GAR!P14
  },
] as const;

/**
 * Quantidade de unidades cadastradas em estoque, por tipologia. Fase 0
 * (achado F3): modela apenas as unidades efetivamente transacionadas no
 * cenario (vendidas na simulacao de velocidade) mais um pequeno excedente
 * para tipologias sem venda no periodo (Loja), para nao deixar a
 * tipologia sem nenhum registro. Nao replica o estoque total do edificio
 * (535 unidades) — ver limitacao registrada no relatorio de conclusao.
 */
export const splendidoUnidadesEmEstoque: Record<string, number> = {
  "1Q": 237, // = total vendido nas premissas de velocidade (VELOCIDADE!B46)
  "2Q": 35, // = VELOCIDADE!C46
  LOJA: 8, // = SINTESE!B13 (nunca vendida nesta curva de velocidade)
  VAGA: 137, // = VELOCIDADE!E46
};

/**
 * Condicoes de pagamento, uma por tipologia (mesmo quando os percentuais
 * coincidem entre tipologias — cada uma e configuravel independentemente).
 * Fonte: %APTS, %GAR, %LOJAS.
 *
 * A modalidade "Intermediarias" usa periodicidadeMeses=9 (=36 meses / 4
 * intermediarias), uma regra universal e explicita (R4) no lugar da
 * tabela de divisores manuais G2/M2/S2/Y2 encontrada na aba REC PROJETADA
 * da planilha, que nao e uma formula recalculada por coorte — e uma
 * aproximacao digitada a mao por faixas de colunas. Ver achado de
 * divergencia tipo B em docs/DIVERGENCIAS_PLANILHA.md.
 */
export const splendidoCondicoesPagamento: Record<
  string,
  {
    nome: string;
    modalidades: {
      nome: string;
      percentual: string;
      tipoDistribuicao: "unica_na_venda" | "nivelada" | "periodica" | "mes_fixo";
      periodicidadeMeses?: number;
      mesFixo?: number;
      repeticoesSobreTotal?: number;
    }[];
  }
> = {
  "1Q": {
    nome: "Apartamento — condição padrão",
    modalidades: [
      { nome: "Entrada", percentual: "0.07", tipoDistribuicao: "unica_na_venda" }, // %APTS!D4
      { nome: "Parcelas mensais", percentual: "0.21", tipoDistribuicao: "nivelada" }, // %APTS!D6
      { nome: "Intermediárias", percentual: "0.05", tipoDistribuicao: "periodica", periodicidadeMeses: 9 }, // %APTS!D7
      { nome: "Única (chaves)", percentual: "0.05", tipoDistribuicao: "mes_fixo", mesFixo: 31, repeticoesSobreTotal: 1 }, // %APTS!D5
      { nome: "Financiamento bancário", percentual: "0.62", tipoDistribuicao: "mes_fixo", mesFixo: 37, repeticoesSobreTotal: 3 }, // %APTS!D8
    ],
  },
  "2Q": {
    nome: "Apartamento — condição padrão", // mesma tabela %APTS que 1Q
    modalidades: [
      { nome: "Entrada", percentual: "0.07", tipoDistribuicao: "unica_na_venda" },
      { nome: "Parcelas mensais", percentual: "0.21", tipoDistribuicao: "nivelada" },
      { nome: "Intermediárias", percentual: "0.05", tipoDistribuicao: "periodica", periodicidadeMeses: 9 },
      { nome: "Única (chaves)", percentual: "0.05", tipoDistribuicao: "mes_fixo", mesFixo: 31, repeticoesSobreTotal: 1 },
      { nome: "Financiamento bancário", percentual: "0.62", tipoDistribuicao: "mes_fixo", mesFixo: 37, repeticoesSobreTotal: 3 },
    ],
  },
  LOJA: {
    nome: "Loja — condição padrão", // %LOJAS: identica a %APTS neste empreendimento
    modalidades: [
      { nome: "Entrada", percentual: "0.07", tipoDistribuicao: "unica_na_venda" },
      { nome: "Parcelas mensais", percentual: "0.21", tipoDistribuicao: "nivelada" },
      { nome: "Intermediárias", percentual: "0.05", tipoDistribuicao: "periodica", periodicidadeMeses: 9 },
      { nome: "Única (chaves)", percentual: "0.05", tipoDistribuicao: "mes_fixo", mesFixo: 31, repeticoesSobreTotal: 1 },
      { nome: "Financiamento bancário", percentual: "0.62", tipoDistribuicao: "mes_fixo", mesFixo: 37, repeticoesSobreTotal: 3 },
    ],
  },
  VAGA: {
    nome: "Garagem — condição padrão", // %GAR
    modalidades: [
      { nome: "Entrada", percentual: "0.10", tipoDistribuicao: "unica_na_venda" }, // %GAR!D4
      { nome: "Parcelas mensais", percentual: "0.70", tipoDistribuicao: "nivelada" }, // %GAR!D6
      { nome: "Intermediárias", percentual: "0.10", tipoDistribuicao: "periodica", periodicidadeMeses: 9 }, // %GAR!D7
      { nome: "Única (chaves)", percentual: "0.10", tipoDistribuicao: "mes_fixo", mesFixo: 31, repeticoesSobreTotal: 1 }, // %GAR!D5
      { nome: "Financiamento bancário", percentual: "0.00", tipoDistribuicao: "mes_fixo", mesFixo: 37, repeticoesSobreTotal: 3 }, // %GAR!D8 = 0%
    ],
  },
};

/**
 * Velocidade de vendas — unidades vendidas por mes, por tipologia
 * (VELOCIDADE!B5:E14). Meses 11-40 nao aparecem porque a curva original
 * so tem vendas ate o mes 10 (empreendimento "vendido no lançamento").
 */
export const splendidoVelocidadeVendas: { tipologia: string; mes: number; unidades: number }[] = [
  { tipologia: "1Q", mes: 1, unidades: 10 },
  { tipologia: "1Q", mes: 2, unidades: 10 },
  { tipologia: "1Q", mes: 3, unidades: 20 },
  { tipologia: "1Q", mes: 4, unidades: 30 },
  { tipologia: "1Q", mes: 5, unidades: 30 },
  { tipologia: "1Q", mes: 6, unidades: 30 },
  { tipologia: "1Q", mes: 7, unidades: 30 },
  { tipologia: "1Q", mes: 8, unidades: 30 },
  { tipologia: "1Q", mes: 9, unidades: 30 },
  { tipologia: "1Q", mes: 10, unidades: 17 },
  { tipologia: "2Q", mes: 1, unidades: 2 },
  { tipologia: "2Q", mes: 2, unidades: 3 },
  { tipologia: "2Q", mes: 3, unidades: 3 },
  { tipologia: "2Q", mes: 4, unidades: 3 },
  { tipologia: "2Q", mes: 5, unidades: 4 },
  { tipologia: "2Q", mes: 6, unidades: 4 },
  { tipologia: "2Q", mes: 7, unidades: 4 },
  { tipologia: "2Q", mes: 8, unidades: 4 },
  { tipologia: "2Q", mes: 9, unidades: 4 },
  { tipologia: "2Q", mes: 10, unidades: 4 },
  { tipologia: "VAGA", mes: 1, unidades: 5 },
  { tipologia: "VAGA", mes: 2, unidades: 5 },
  { tipologia: "VAGA", mes: 3, unidades: 5 },
  { tipologia: "VAGA", mes: 4, unidades: 15 },
  { tipologia: "VAGA", mes: 5, unidades: 15 },
  { tipologia: "VAGA", mes: 6, unidades: 15 },
  { tipologia: "VAGA", mes: 7, unidades: 20 },
  { tipologia: "VAGA", mes: 8, unidades: 20 },
  { tipologia: "VAGA", mes: 9, unidades: 20 },
  { tipologia: "VAGA", mes: 10, unidades: 17 },
];

/**
 * Cronograma fisico-financeiro da obra (CRONOGRAMA!B9:B44, % de execucao
 * mensal). 36 meses, curva digitada manualmente na planilha original.
 */
export const splendidoCronogramaExecucaoMensal: string[] = [
  "0", "0", "0.002", "0.002", "0.002", "0.005", "0.005", "0.005", "0.01", "0.03",
  "0.03", "0.04", "0.05", "0.05", "0.05", "0.05", "0.05", "0.05", "0.05", "0.05",
  "0.05", "0.05", "0.05", "0.05", "0.05", "0.05", "0.05", "0.04", "0.02", "0.02",
  "0.02", "0.019", "0", "0", "0", "0",
];

/**
 * Custo total de obra. Achado C2/F1 (Fase 1 e 2): CRONOGRAMA!B4 referencia
 * ANALISE!E31, que esta vazio — o valor efetivamente usado (e o que a
 * cadeia inteira do FLUXO CAIXA carrega em cache) e o de ANALISE!E33 =
 * C34 * D33 = 22.916 m² * R$1.600/m². O ERP usa este valor como um campo
 * nomeado (custo_obra_total), nunca uma referencia de celula.
 */
export const splendidoCustoObraTotal = "36665600"; // ANALISE!E33

export const splendidoPercentualComissao = "0.05"; // ANALISE!C46, base: valor vendido no mes
export const splendidoPercentualEncargoSobreRecebido = "0.04"; // ANALISE!C47 ("RET"), base: recebido no mes anterior

/**
 * Custos calculados na planilha mas NAO incluidos no FLUXO CAIXA original
 * (achado C3/F na Fase 1/2). Cadastrados aqui com participaFluxoCaixa=false
 * para reproduzir exatamente o fluxo da planilha ("modo replicacao"); o
 * teste de integracao alterna esse flag para "modo completo".
 */
export const splendidoCustosForaDoFluxoOriginal = {
  escrituracaoEItbi: "51247.70", // LEGAL!B12
  incorporacaoLegalizacaoCondominial: "223068.90", // LEGAL!D21
  publicidade: "393567.37", // ANALISE!E45 = 0.5% * VGV (78.713.474)
};

/** VGV bruto total, para referencia/validacao (ANALISE!F22). */
export const splendidoVgvBrutoReferencia = "78713474";
