/**
 * Segundo empreendimento, inteiramente fictício, usado no teste de
 * isolamento multiempreendimento (principio H da fundacao arquitetural).
 * Numeros deliberadamente diferentes dos do Splendido: menos unidades,
 * preco menor, horizonte mais curto, condicao de pagamento com numero
 * diferente de modalidades e parcelas.
 */

export const ficticioEmpreendimento = {
  nome: "Recanto das Aroeiras",
  incorporador: "Aroeiras Empreendimentos Ltda",
  endereco: "Quadra 12, Lote 4 — Valparaíso de Goiás/GO",
  dataPrevistaConclusao: new Date("2027-03-31"),
};

export const ficticioCenarioBase = {
  tipo: "base" as const,
  nome: "Base",
  horizonteProjecaoMeses: 18,
  taxaDescontoMensalVpl: "0.008",
};

export const ficticioTerreno = {
  areaValor: "1200",
  areaStatusValidacao: "validado" as const,
  formaAquisicao: "compra" as const,
};

export const ficticioTipologias = [
  { chave: "STUDIO", nome: "Studio Compacto", areaPrivativaPadrao: "22", precoUnitarioPadrao: "180000" },
] as const;

export const ficticioUnidadesEmEstoque: Record<string, number> = { STUDIO: 24 };

export const ficticioCondicoesPagamento: Record<
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
  STUDIO: {
    nome: "Studio — condição única",
    modalidades: [
      { nome: "Sinal", percentual: "0.15", tipoDistribuicao: "unica_na_venda" },
      { nome: "Parcelas mensais", percentual: "0.85", tipoDistribuicao: "nivelada" },
    ],
  },
};

export const ficticioVelocidadeVendas: { tipologia: string; mes: number; unidades: number }[] = [
  { tipologia: "STUDIO", mes: 1, unidades: 4 },
  { tipologia: "STUDIO", mes: 2, unidades: 6 },
  { tipologia: "STUDIO", mes: 3, unidades: 8 },
  { tipologia: "STUDIO", mes: 4, unidades: 6 },
];

export const ficticioCronogramaExecucaoMensal: string[] = [
  "0.1", "0.15", "0.2", "0.2", "0.15", "0.1", "0.05", "0.05",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
];

export const ficticioCustoObraTotal = "1500000";
export const ficticioPercentualComissao = "0.03";
export const ficticioPercentualEncargoSobreRecebido = "0";
