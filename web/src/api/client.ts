/**
 * Nome do evento global disparado quando qualquer chamada à API devolve
 * 401 fora do fluxo de login/verificação inicial (achado F14,
 * docs/DECISOES.md — "segurança de sessão"). Antes desta fatia, uma sessão
 * expirada no meio do uso só aparecia como um erro genérico na tela — o
 * usuário nunca era levado de volta ao login. App.tsx escuta este evento e
 * reseta o usuário logado, o que troca a tela para LoginPage.
 */
export const EVENTO_SESSAO_EXPIRADA = "sessao-expirada";

/**
 * Substitui o fetch global em toda chamada à API -- ponto único onde um
 * 401 é reconhecido como "sessão expirada" e não apenas "erro desta
 * chamada". As duas exceções são esperadas fora de uma sessão ativa:
 * /api/auth/me (verificação inicial, 401 aqui só significa "não logado
 * ainda") e /api/auth/login (credenciais erradas, já tratado inline pela
 * LoginPage).
 */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401 && url !== "/api/auth/me" && url !== "/api/auth/login") {
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
  }
  return res;
}

export interface EmpreendimentoResumo {
  id: string;
  nome: string;
  cenarios: { id: string; nome: string; tipo: string; horizonteProjecaoMeses: number }[];
}

export interface PontoFluxo {
  mes: number;
  entradas: string;
  saidas: string;
  fluxoMensal: string;
  fluxoAcumulado: string;
  entradasRealizadas: string | null;
  saidasRealizadas: string | null;
  entradasCorrigidas: string;
  saidasCorrigidas: string;
}

export interface PontoFinanciamentoFluxo {
  mes: number;
  liberacao: string;
  amortizacao: string;
  saldoDevedor: string;
}

export type SeveridadeAlerta = "aviso" | "critico";

export interface Alerta {
  tipo: string;
  severidade: SeveridadeAlerta;
  mensagem: string;
}

export interface FluxoCaixaResposta {
  empreendimento: string;
  cenario: string;
  horizonteProjecaoMeses: number;
  fluxo: PontoFluxo[];
  indicadores: {
    necessidadeMaximaCapital: string;
    mesPico: number | null;
    mesRecuperacao: number | null;
    saldoFinal: string;
    vpl: string;
  };
  financiamento: PontoFinanciamentoFluxo[];
  alertas: Alerta[];
}

export async function fetchEmpreendimentos(): Promise<EmpreendimentoResumo[]> {
  const res = await apiFetch("/api/empreendimentos");
  if (!res.ok) throw new Error(`Falha ao carregar empreendimentos (${res.status})`);
  return res.json();
}

export async function fetchFluxoCaixa(cenarioId: string): Promise<FluxoCaixaResposta> {
  const res = await apiFetch(`/api/cenarios/${cenarioId}/fluxo-caixa`);
  if (!res.ok) throw new Error(`Falha ao carregar fluxo de caixa (${res.status})`);
  return res.json();
}

export type EixoSensibilidade = "custo" | "vgv" | "velocidadeVendas";

export interface PontoSensibilidade {
  variacao: string;
  vpl: string;
  necessidadeMaximaCapital: string;
  mesPico: number | null;
}

export async function fetchSensibilidade(cenarioId: string, eixo: EixoSensibilidade): Promise<PontoSensibilidade[]> {
  const res = await apiFetch(`/api/cenarios/${cenarioId}/sensibilidade?eixo=${eixo}`);
  if (!res.ok) throw new Error(`Falha ao calcular sensibilidade (${res.status})`);
  return res.json();
}

export interface VersaoComparada {
  id: string;
  nome: string;
  tipo: string;
  relacao: "atual" | "original" | "derivado";
  necessidadeMaximaCapital: string;
  mesPico: number | null;
  mesRecuperacao: number | null;
  vpl: string;
}

export async function fetchComparacaoCenarios(cenarioId: string): Promise<{ versoes: VersaoComparada[] }> {
  const res = await apiFetch(`/api/cenarios/${cenarioId}/comparacao`);
  if (!res.ok) throw new Error(`Falha ao comparar versões (${res.status})`);
  return res.json();
}

/**
 * Comparação de N cenários do mesmo empreendimento, escolhidos livremente
 * (Fase 2.4) — diferente de `fetchComparacaoCenarios` acima (achado F18),
 * que só compara pai/filhos diretos por derivação. Todo indicador aqui vem
 * pronto do backend (`montarComparacaoCenarios`, src/db/servicoMotor.ts) —
 * a tela nunca soma valores sozinha.
 */
export interface PremissasResumoCenario {
  horizonteProjecaoMeses: number;
  limiteNecessidadeMaximaCapital: string | null;
  velocidadeVendas: {
    totalUnidadesPrevistas: string;
    porTipologia: { tipologiaId: string; tipologiaNome: string; totalUnidadesPrevistas: string }[];
  };
  custos: {
    categoriaId: string;
    categoriaNome: string;
    tipoIncidencia: TipoIncidenciaCusto;
    tipologiaNome: string | null;
    valorPrevisto: string | null;
    percentual: string | null;
  }[];
  cronograma: { quantidadeMeses: number; mesInicio: number | null; mesFim: number | null } | null;
  financiamento: { valorContratado: string; taxaJurosMensal: string; tipoAmortizacao: string; mesAmortizacao: number } | null;
}

export interface IndicadoresComparacaoCenario {
  vgv: string;
  totalRecebimentosPrevisto: string;
  totalCustosPrevisto: string;
  saldoFinal: string;
  necessidadeMaximaCapital: string;
  mesPico: number | null;
  mesRecuperacao: number | null;
  vpl: string;
}

export interface PontoFluxoComparacao {
  mes: number;
  entradas: string;
  saidas: string;
  fluxoMensal: string;
  fluxoAcumulado: string;
}

export interface ComparacaoCenario {
  id: string;
  nome: string;
  tipo: string;
  derivadoDeNome: string | null;
  indicadores: IndicadoresComparacaoCenario;
  fluxoMensal: PontoFluxoComparacao[];
  premissas: PremissasResumoCenario;
}

export async function fetchComparacaoCenariosMultiplos(empreendimentoId: string, cenarioIds: string[]): Promise<{ cenarios: ComparacaoCenario[] }> {
  const res = await apiFetch(`/api/empreendimentos/${empreendimentoId}/cenarios/comparacao?ids=${cenarioIds.map(encodeURIComponent).join(",")}`);
  if (!res.ok) throw new Error(`Falha ao comparar cenários (${res.status})`);
  return res.json();
}

export type TipoDistribuicao = "unica_na_venda" | "nivelada" | "periodica" | "mes_fixo";

export interface ModalidadeInput {
  nome: string;
  percentual: string;
  tipoDistribuicao: TipoDistribuicao;
  periodicidadeMeses?: number;
  mesFixo?: number;
}

export interface CondicaoPagamentoResumo {
  id: string;
  nome: string;
  modalidades: {
    nome: string;
    percentual: string;
    tipoDistribuicao: TipoDistribuicao;
    periodicidadeMeses: number | null;
    mesFixo: number | null;
    repeticoesSobreTotal: number;
    geraEventoParcial: boolean;
  }[];
}

export interface TipologiaResumo {
  id: string;
  nome: string;
  areaPrivativaPadrao: string | null;
  precoUnitarioPadrao: string | null;
  quantidadeUnidades: number;
  condicoesPagamento: CondicaoPagamentoResumo[];
}

export interface CenarioResumo {
  id: string;
  nome: string;
  tipo: string;
  horizonteProjecaoMeses: number;
  derivadoDeNome: string | null;
}

export type TipoIncidenciaCusto =
  | "fixo"
  | "pct_vgv_vendido_no_mes"
  | "pct_recebido_mes_anterior"
  | "pct_execucao"
  | "pct_recebido_no_mes"
  | "faixas_vgv_acumulado";

export interface CategoriaCustoResumo {
  id: string;
  nome: string;
  tipoIncidencia: TipoIncidenciaCusto;
}

export type StatusValidacaoArea = "pendente" | "validado" | "conflitante";
export type FormaAquisicaoTerreno = "compra" | "permuta" | "misto";

export interface TerrenoResumo {
  id: string;
  numeroMatricula: string | null;
  areaValor: string | null;
  areaUnidade: string;
  areaStatusValidacao: StatusValidacaoArea;
  areaObservacao: string | null;
  formaAquisicao: FormaAquisicaoTerreno | null;
}

export interface EmpreendimentoDetalhe {
  id: string;
  nome: string;
  incorporador: string | null;
  endereco: string | null;
  terrenos: TerrenoResumo[];
  cenarios: CenarioResumo[];
  tipologias: TipologiaResumo[];
  categoriasCusto: CategoriaCustoResumo[];
}

export interface DestinatarioComissaoResumo {
  id: string;
  nome: string;
  percentualSplit: string;
}

/** Uma faixa de uma tabela de comissão progressiva por VGV acumulado (achado F28, docs/DECISOES.md). volumeAte null = faixa aberta, sem limite. */
export interface FaixaComissaoResumo {
  id: string;
  volumeAte: string | null;
  percentual: string;
}

export interface CustoResumo {
  id: string;
  categoriaNome: string;
  tipoIncidencia: TipoIncidenciaCusto;
  tipologiaId: string | null;
  tipologiaNome: string | null;
  valorPrevisto: string | null;
  percentual: string | null;
  competenciaMes: number | null;
  recorrencia: string;
  valorRealizado: string | null;
  status: string;
  grupoIndiceCorrecao: string;
  destinatariosComissao: DestinatarioComissaoResumo[];
  faixasComissao: FaixaComissaoResumo[];
}

export type TipoAmortizacao = "unico" | "sac" | "price";

export interface FinanciamentoResumo {
  valorContratado: string;
  taxaJurosMensal: string;
  mesAmortizacao: number;
  tipoAmortizacao: TipoAmortizacao;
  numeroParcelas: number | null;
}

export interface CenarioDetalhe {
  id: string;
  nome: string;
  tipo: string;
  horizonteProjecaoMeses: number;
  limiteNecessidadeMaximaCapital: string | null;
  dataMesUm: string | null;
  empreendimento: { id: string; nome: string };
  tipologiasDisponiveis: { id: string; nome: string }[];
  categoriasCustoDisponiveis: CategoriaCustoResumo[];
  premissasVelocidade: { id: string; tipologiaId: string; tipologiaNome: string; mes: number; unidadesPrevistas: string }[];
  custos: CustoResumo[];
  cronograma: { mes: number; percentualExecucaoMensal: string }[];
  indicesCorrecao: { grupo: string; mes: number; percentual: string }[];
  financiamento: FinanciamentoResumo | null;
  totalVendasGeradas: number;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha (${res.status})` }));
    throw new Error(erro.erro ?? `Falha (${res.status})`);
  }
  return res.json();
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha (${res.status})` }));
    throw new Error(erro.erro ?? `Falha (${res.status})`);
  }
  return res.json();
}

async function del(url: string): Promise<void> {
  const res = await apiFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha (${res.status})` }));
    throw new Error(erro.erro ?? `Falha (${res.status})`);
  }
}

export async function fetchEmpreendimentoDetalhe(id: string): Promise<EmpreendimentoDetalhe> {
  const res = await apiFetch(`/api/empreendimentos/${id}`);
  if (!res.ok) throw new Error(`Falha ao carregar empreendimento (${res.status})`);
  return res.json();
}

export function criarEmpreendimento(input: { nome: string; incorporador?: string; endereco?: string }) {
  return postJson<{ id: string; nome: string }>("/api/empreendimentos", input);
}

export function criarTipologia(empreendimentoId: string, input: { nome: string; areaPrivativaPadrao?: string; precoUnitarioPadrao?: string }) {
  return postJson<TipologiaResumo>(`/api/empreendimentos/${empreendimentoId}/tipologias`, input);
}

export function criarUnidadesEmLote(
  tipologiaId: string,
  input: { quantidade: number; precoVenda: string; areaPrivativa?: string; prefixoNumero: string },
) {
  return postJson<unknown[]>(`/api/tipologias/${tipologiaId}/unidades`, input);
}

export type TipoIncrementoAndar = "fixo" | "percentual";

export function criarUnidadesPorAndar(
  tipologiaId: string,
  input: {
    prefixoNumero: string;
    areaPrivativa?: string;
    andares: { andar: number; quantidade: number }[];
    precificacao: { precoBase: string; andarBase: number; incremento: string; tipoIncremento: TipoIncrementoAndar };
  },
) {
  return postJson<{ andar: number; numero: string; precoVenda: string }[]>(`/api/tipologias/${tipologiaId}/unidades-por-andar`, input);
}

export function criarCenario(
  empreendimentoId: string,
  input: { tipo: string; nome: string; horizonteProjecaoMeses: number },
) {
  return postJson<CenarioResumo>(`/api/empreendimentos/${empreendimentoId}/cenarios`, input);
}

export function criarCondicaoPagamento(tipologiaId: string, input: { nome: string; modalidades: ModalidadeInput[] }) {
  return postJson<CondicaoPagamentoResumo>(`/api/tipologias/${tipologiaId}/condicoes-pagamento`, input);
}

export async function fetchCenarioDetalhe(id: string): Promise<CenarioDetalhe> {
  const res = await apiFetch(`/api/cenarios/${id}`);
  if (!res.ok) throw new Error(`Falha ao carregar cenário (${res.status})`);
  return res.json();
}

export function criarPremissasVelocidade(
  cenarioId: string,
  itens: { tipologiaId: string; mes: number; unidadesPrevistas: string }[],
) {
  return postJson<{ criadas: number }>(`/api/cenarios/${cenarioId}/premissas-velocidade`, { itens });
}

export function gerarVendas(cenarioId: string) {
  return postJson<{ totalVendasCriadas: number }>(`/api/cenarios/${cenarioId}/gerar-vendas`, {});
}

export function criarCategoriaCusto(empreendimentoId: string, input: { nome: string; tipoIncidencia: TipoIncidenciaCusto }) {
  return postJson<CategoriaCustoResumo>(`/api/empreendimentos/${empreendimentoId}/categorias-custo`, input);
}

export function criarCusto(
  cenarioId: string,
  input: {
    categoriaId: string;
    tipologiaId?: string;
    valorPrevisto?: string;
    percentual?: string;
    competenciaMes?: number;
    recorrencia?: "unico" | "mensal";
    grupoIndiceCorrecao?: string;
  },
) {
  return postJson<CustoResumo>(`/api/cenarios/${cenarioId}/custos`, input);
}

export function criarCronograma(cenarioId: string, pontos: { mes: number; percentualExecucaoMensal: string }[]) {
  return postJson<{ criados: number }>(`/api/cenarios/${cenarioId}/cronograma`, { pontos });
}

/**
 * Curva combinada do cronograma físico-financeiro (Fase 2.3): para cada mês,
 * o percentual de execução física (e seu acumulado) lado a lado com o
 * desembolso financeiro que aquele percentual gerou nos custos de obra (e
 * seu acumulado) -- tudo calculado no backend (montarCurvaCronogramaDoCenario
 * / calcularCurvaCronograma), a tela nunca soma valores sozinha.
 */
export interface PontoCurvaCronograma {
  mes: number;
  percentualExecucaoMensal: string;
  percentualAcumulado: string;
  desembolsoMensal: string;
  desembolsoAcumulado: string;
}

export async function fetchCronogramaCurva(cenarioId: string): Promise<{ pontos: PontoCurvaCronograma[] }> {
  const res = await apiFetch(`/api/cenarios/${cenarioId}/cronograma-curva`);
  if (!res.ok) throw new Error(`Falha ao carregar curva do cronograma (${res.status})`);
  return res.json();
}

export interface RecebimentoResumo {
  id: string;
  /** Fase 2.1 — tela de Vendas: filtra "os recebimentos desta venda" sem rota nova. */
  vendaId: string;
  unidadeNumero: string;
  modalidadeNome: string;
  mesCompetencia: number;
  valorPrevisto: string;
  valorRealizado: string | null;
  status: string;
}

export async function fetchRecebimentos(cenarioId: string): Promise<RecebimentoResumo[]> {
  const res = await apiFetch(`/api/cenarios/${cenarioId}/recebimentos`);
  if (!res.ok) throw new Error(`Falha ao carregar recebimentos (${res.status})`);
  return res.json();
}

export function registrarRecebimentoRealizado(id: string, input: { valorRealizado: string; status?: "recebido" | "atrasado" }) {
  return patchJson<RecebimentoResumo>(`/api/recebimentos/${id}`, input);
}

export function estornarRecebimentoRealizado(id: string) {
  return patchJson<RecebimentoResumo>(`/api/recebimentos/${id}`, { estornar: true });
}

/** Fase 2.1 — tela de Vendas. */
export interface VendaCenarioResumo {
  id: string;
  status: string;
  mesOrigem: number;
  valorVenda: string;
  comprador: string | null;
  documentoComprador: string | null;
  unidade: { id: string; numero: string; andar: number | null };
  tipologia: { id: string; nome: string };
  condicaoPagamento: { id: string; nome: string };
  distrato: DistratoResumo | null;
  renegociacoes: RenegociacaoResumo[];
}

export async function fetchVendasDoCenario(cenarioId: string): Promise<VendaCenarioResumo[]> {
  const res = await apiFetch(`/api/cenarios/${cenarioId}/vendas`);
  if (!res.ok) throw new Error(`Falha ao carregar vendas (${res.status})`);
  return res.json();
}

export function criarVenda(
  cenarioId: string,
  input: { unidadeId: string; condicaoPagamentoId: string; mesOrigem: number; valorVenda?: string; comprador?: string; documentoComprador?: string },
) {
  return postJson<VendaCenarioResumo>(`/api/cenarios/${cenarioId}/vendas`, input);
}

export function atualizarVenda(
  id: string,
  input: { comprador?: string | null; documentoComprador?: string | null; valorVenda?: string; mesOrigem?: number },
) {
  return patchJson<VendaCenarioResumo>(`/api/vendas/${id}`, input);
}

export interface EstoqueResumo {
  total: number;
  porStatus: Record<string, number>;
}

export async function fetchEstoque(empreendimentoId: string): Promise<EstoqueResumo> {
  const res = await apiFetch(`/api/empreendimentos/${empreendimentoId}/estoque`);
  if (!res.ok) throw new Error(`Falha ao carregar estoque (${res.status})`);
  return res.json();
}

export function registrarCustoRealizado(id: string, input: { valorRealizado: string }) {
  return patchJson<CustoResumo>(`/api/custos/${id}`, input);
}

export function estornarCustoRealizado(id: string) {
  return patchJson<CustoResumo>(`/api/custos/${id}`, { estornar: true });
}

export interface DesembolsoCustoResumo {
  id: string;
  custoId: string;
  categoriaNome: string;
  mes: number;
  valorPrevisto: string;
  valorRealizado: string | null;
  status: string;
}

export async function fetchDesembolsosCustos(cenarioId: string): Promise<DesembolsoCustoResumo[]> {
  const res = await apiFetch(`/api/cenarios/${cenarioId}/desembolsos-custos`);
  if (!res.ok) throw new Error(`Falha ao carregar desembolsos de custo (${res.status})`);
  return res.json();
}

export function registrarDesembolsoCustoRealizado(id: string, input: { valorRealizado: string }) {
  return patchJson<DesembolsoCustoResumo>(`/api/desembolsos-custos/${id}`, input);
}

export function estornarDesembolsoCustoRealizado(id: string) {
  return patchJson<DesembolsoCustoResumo>(`/api/desembolsos-custos/${id}`, { estornar: true });
}

/**
 * Visão gerencial de custos (Fase 2.2, docs/DECISOES.md — achado F31):
 * previsto/realizado/saldo/desvio por custo, calculados no backend a
 * partir do que o motor já projeta -- a tela de Custos nunca soma valores
 * sozinha.
 */
export interface CustoResumoGerencial {
  id: string;
  categoriaId: string;
  categoriaNome: string;
  tipoIncidencia: TipoIncidenciaCusto;
  tipologiaId: string | null;
  tipologiaNome: string | null;
  recorrencia: string;
  competenciaMes: number | null;
  status: string;
  totalPrevisto: string;
  totalRealizado: string;
  saldoARealizar: string;
  desvio: string;
  desvioPercentual: string | null;
}

export async function fetchCustosResumo(cenarioId: string): Promise<CustoResumoGerencial[]> {
  const res = await apiFetch(`/api/cenarios/${cenarioId}/custos-resumo`);
  if (!res.ok) throw new Error(`Falha ao carregar resumo de custos (${res.status})`);
  return res.json();
}

/**
 * Distribuição mensal do previsto de um custo, reaproveitando exatamente
 * o que rodarMotorParaCenario já calcula (resultado.desembolsos) -- nenhum
 * cálculo novo. `granular` indica se há realizado por mês (custos
 * percentuais, DesembolsoCusto) ou só um valor agregado (custos fixos —
 * limitação real do modelo atual, não uma escolha da tela).
 */
export interface DistribuicaoMensalCusto {
  custoId: string;
  tipoIncidencia: TipoIncidenciaCusto;
  recorrencia: string;
  granular: boolean;
  meses: { mes: number; valorPrevisto: string }[];
  realizadoPorMes: { mes: number; valorRealizado: string | null; status: string; desembolsoId: string }[];
}

export async function fetchDistribuicaoMensalCusto(custoId: string): Promise<DistribuicaoMensalCusto> {
  const res = await apiFetch(`/api/custos/${custoId}/distribuicao-mensal`);
  if (!res.ok) throw new Error(`Falha ao carregar distribuição mensal do custo (${res.status})`);
  return res.json();
}

/** Importação em lote de extrato bancário (achado F27, docs/DECISOES.md) — "sugerir e confirmar", nunca marcar sozinho. */
export type TipoCandidatoConciliacao = "recebimento" | "custo_fixo" | "desembolso_custo";

export interface CandidatoConciliacaoResumo {
  tipo: TipoCandidatoConciliacao;
  id: string;
  descricao: string;
  valorPrevisto: string;
  mes: number;
}

export interface SugestaoLinhaExtrato {
  linha: { data: string | null; descricao: string; valor: string };
  candidatos: CandidatoConciliacaoResumo[];
}

export function sugerirConciliacaoExtrato(cenarioId: string, csv: string) {
  return postJson<{ sugestoes: SugestaoLinhaExtrato[] }>(`/api/cenarios/${cenarioId}/extrato/sugestoes`, { csv });
}

export function confirmarConciliacaoExtrato(cenarioId: string, confirmacoes: { tipo: TipoCandidatoConciliacao; id: string; valorRealizado: string }[]) {
  return postJson<{ confirmados: number }>(`/api/cenarios/${cenarioId}/extrato/confirmar`, { confirmacoes });
}

export function atualizarEmpreendimento(id: string, input: { nome?: string; incorporador?: string | null; endereco?: string | null }) {
  return patchJson<{ id: string; nome: string }>(`/api/empreendimentos/${id}`, input);
}

export function excluirEmpreendimento(id: string) {
  return del(`/api/empreendimentos/${id}`);
}

/** Múltiplas matrículas/áreas por empreendimento (achado F26, docs/DECISOES.md) — cada chamada cria uma matrícula nova. */
export function criarTerreno(
  empreendimentoId: string,
  input: { numeroMatricula?: string; areaValor?: string; areaUnidade?: string; areaStatusValidacao?: StatusValidacaoArea; areaObservacao?: string; formaAquisicao?: FormaAquisicaoTerreno },
) {
  return postJson<TerrenoResumo>(`/api/empreendimentos/${empreendimentoId}/terrenos`, input);
}

export function atualizarTerreno(
  id: string,
  input: {
    numeroMatricula?: string | null;
    areaValor?: string | null;
    areaUnidade?: string;
    areaStatusValidacao?: StatusValidacaoArea;
    areaObservacao?: string | null;
    formaAquisicao?: FormaAquisicaoTerreno | null;
  },
) {
  return patchJson<TerrenoResumo>(`/api/terrenos/${id}`, input);
}

export function excluirTerreno(id: string) {
  return del(`/api/terrenos/${id}`);
}

export function atualizarTipologia(
  id: string,
  input: { nome?: string; areaPrivativaPadrao?: string | null; precoUnitarioPadrao?: string | null },
) {
  return patchJson<TipologiaResumo>(`/api/tipologias/${id}`, input);
}

export function excluirTipologia(id: string) {
  return del(`/api/tipologias/${id}`);
}

export function atualizarCenario(
  id: string,
  input: { nome?: string; horizonteProjecaoMeses?: number; limiteNecessidadeMaximaCapital?: string | null; dataMesUm?: string | null },
) {
  return patchJson<CenarioResumo>(`/api/cenarios/${id}`, input);
}

export function excluirCenario(id: string) {
  return del(`/api/cenarios/${id}`);
}

export function duplicarCenario(id: string, nome: string) {
  return postJson<CenarioResumo>(`/api/cenarios/${id}/duplicar`, { nome });
}

export interface DistratoResumo {
  valorRecebidoAteDistrato: string;
  percentualRetencao: string;
  valorRetido: string;
  valorReembolsar: string;
}

export interface RenegociacaoResumo {
  id: string;
  valorVendaAnterior: string;
  novoValorVenda: string;
  motivo: string | null;
}

export interface VendaResumo {
  id: string;
  status: string;
  mesOrigem: number;
  valorVenda: string;
  distrato: DistratoResumo | null;
  renegociacoes: RenegociacaoResumo[];
}

export interface ContrapartePermutaResumo {
  id: string;
  nome: string;
  documento: string | null;
  percentualSplit: string;
  valorAtribuido: string | null;
}

export interface UnidadeResumo {
  id: string;
  numero: string;
  andar: number | null;
  areaPrivativa: string | null;
  precoVenda: string | null;
  status: string;
  permuta:
    | { id: string; nomeContraparte: string; documento: string | null; valorAtribuido: string | null; contrapartes: ContrapartePermutaResumo[] }
    | null;
  venda: VendaResumo | null;
}

export async function fetchUnidades(tipologiaId: string): Promise<UnidadeResumo[]> {
  const res = await apiFetch(`/api/tipologias/${tipologiaId}/unidades`);
  if (!res.ok) throw new Error(`Falha ao carregar unidades (${res.status})`);
  return res.json();
}

export function registrarPermuta(
  unidadeId: string,
  input: { nomeContraparte: string; documento?: string; valorAtribuido?: string; observacao?: string },
) {
  return postJson<{ id: string }>(`/api/unidades/${unidadeId}/permuta`, input);
}

export function atualizarPermuta(
  unidadeId: string,
  input: { nomeContraparte?: string; documento?: string; valorAtribuido?: string; observacao?: string },
) {
  return patchJson<{ id: string }>(`/api/unidades/${unidadeId}/permuta`, input);
}

export function desfazerPermuta(unidadeId: string) {
  return del(`/api/unidades/${unidadeId}/permuta`);
}

/** Permuta parcial (achado F24, docs/DECISOES.md) — contraparte adicional que divide a mesma permuta. */
export function criarContrapartePermuta(permutaId: string, input: { nome: string; documento?: string; percentualSplit: string; valorAtribuido?: string }) {
  return postJson<ContrapartePermutaResumo>(`/api/permutas/${permutaId}/contrapartes`, input);
}

export function atualizarContrapartePermuta(id: string, input: { nome?: string; documento?: string; percentualSplit?: string; valorAtribuido?: string }) {
  return patchJson<ContrapartePermutaResumo>(`/api/contrapartes-permuta/${id}`, input);
}

export function excluirContrapartePermuta(id: string) {
  return del(`/api/contrapartes-permuta/${id}`);
}

export function registrarDistrato(vendaId: string, input: { percentualRetencao?: string; motivo?: string }) {
  return postJson<DistratoResumo>(`/api/vendas/${vendaId}/distrato`, input);
}

export function desfazerDistrato(vendaId: string) {
  return del(`/api/vendas/${vendaId}/distrato`);
}

export function registrarRenegociacao(vendaId: string, input: { novoValorVenda: string; motivo?: string }) {
  return postJson<RenegociacaoResumo>(`/api/vendas/${vendaId}/renegociacoes`, input);
}

export function atualizarCondicaoPagamento(id: string, input: { nome?: string; modalidades?: ModalidadeInput[] }) {
  return patchJson<CondicaoPagamentoResumo>(`/api/condicoes-pagamento/${id}`, input);
}

export function excluirCondicaoPagamento(id: string) {
  return del(`/api/condicoes-pagamento/${id}`);
}

export function atualizarCategoriaCusto(id: string, input: { nome?: string; tipoIncidencia?: TipoIncidenciaCusto }) {
  return patchJson<CategoriaCustoResumo>(`/api/categorias-custo/${id}`, input);
}

export function excluirCategoriaCusto(id: string) {
  return del(`/api/categorias-custo/${id}`);
}

export function atualizarCusto(
  id: string,
  input: {
    valorPrevisto?: string | null;
    percentual?: string | null;
    competenciaMes?: number | null;
    recorrencia?: "unico" | "mensal";
    grupoIndiceCorrecao?: string;
  },
) {
  return patchJson<CustoResumo>(`/api/custos/${id}`, input);
}

export function excluirCusto(id: string) {
  return del(`/api/custos/${id}`);
}

export function criarDestinatarioComissao(custoId: string, nome: string, percentualSplit: string) {
  return postJson<DestinatarioComissaoResumo>(`/api/custos/${custoId}/destinatarios-comissao`, { nome, percentualSplit });
}

export function atualizarDestinatarioComissao(id: string, input: { nome?: string; percentualSplit?: string }) {
  return patchJson<DestinatarioComissaoResumo>(`/api/destinatarios-comissao/${id}`, input);
}

export function excluirDestinatarioComissao(id: string) {
  return del(`/api/destinatarios-comissao/${id}`);
}

export function criarFaixaComissao(custoId: string, volumeAte: string | null, percentual: string) {
  return postJson<FaixaComissaoResumo>(`/api/custos/${custoId}/faixas-comissao`, { volumeAte, percentual });
}

export function atualizarFaixaComissao(id: string, input: { volumeAte?: string | null; percentual?: string }) {
  return patchJson<FaixaComissaoResumo>(`/api/faixas-comissao/${id}`, input);
}

export function excluirFaixaComissao(id: string) {
  return del(`/api/faixas-comissao/${id}`);
}

export function excluirCronograma(cenarioId: string) {
  return del(`/api/cenarios/${cenarioId}/cronograma`);
}

export function definirPontoIndiceCorrecao(cenarioId: string, input: { grupo?: string; mes: number; percentual: string }) {
  return postJson<{ grupo: string; mes: number; percentual: string }>(`/api/cenarios/${cenarioId}/indices-correcao`, input);
}

export function excluirPontoIndiceCorrecao(cenarioId: string, grupo: string, mes: number) {
  return del(`/api/cenarios/${cenarioId}/indices-correcao/${mes}?grupo=${encodeURIComponent(grupo)}`);
}

export function definirFinanciamento(
  cenarioId: string,
  input: { valorContratado: string; taxaJurosMensal: string; mesAmortizacao: number; tipoAmortizacao?: TipoAmortizacao; numeroParcelas?: number },
) {
  return postJson<FinanciamentoResumo>(`/api/cenarios/${cenarioId}/financiamento`, input);
}

export function excluirFinanciamento(cenarioId: string) {
  return del(`/api/cenarios/${cenarioId}/financiamento`);
}

/** "stakeholder" (Fase 2.5, docs/DECISOES.md): visualização apenas, por empreendimento -- nunca pode ter vínculo "edicao" (validado no backend). */
export type Papel = "admin" | "usuario" | "stakeholder";

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
}

/** null quando não há sessão válida (não é um erro — é o estado esperado antes do login). */
export async function fetchUsuarioAtual(): Promise<Usuario | null> {
  const res = await apiFetch("/api/auth/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Falha ao verificar sessão (${res.status})`);
  return res.json();
}

export async function login(email: string, senha: string): Promise<Usuario> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha (${res.status})` }));
    throw new Error(erro.erro ?? `Falha (${res.status})`);
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export interface UsuarioResumo extends Usuario {
  createdAt: string;
}

export async function fetchUsuarios(): Promise<UsuarioResumo[]> {
  const res = await apiFetch("/api/usuarios");
  if (!res.ok) throw new Error(`Falha ao carregar usuários (${res.status})`);
  return res.json();
}

export function criarUsuario(input: { email: string; nome: string; senha: string; papel?: Papel }) {
  return postJson<UsuarioResumo>("/api/usuarios", input);
}

export function excluirUsuario(id: string) {
  return del(`/api/usuarios/${id}`);
}

export function redefinirSenhaUsuario(id: string, senha: string) {
  return patchJson<{ ok: true }>(`/api/usuarios/${id}/senha`, { senha });
}

/** Papel de acesso do vínculo (achado F23, docs/DECISOES.md) — "edicao" é o padrão, mesmo acesso total de antes dessa fatia. */
export type PapelVinculo = "edicao" | "leitura";

export interface EmpreendimentoVinculado {
  id: string;
  nome: string;
  papel: PapelVinculo;
}

export async function fetchEmpreendimentosDoUsuario(usuarioId: string): Promise<EmpreendimentoVinculado[]> {
  const res = await apiFetch(`/api/usuarios/${usuarioId}/empreendimentos`);
  if (!res.ok) throw new Error(`Falha ao carregar acesso (${res.status})`);
  return res.json();
}

/** Vínculo em lote (achado F22) — uma ou várias de uma vez, todas com o mesmo papel (achado F23; "edicao" quando omitido). Reenviar um id já vinculado troca o papel dele. */
export function vincularEmpreendimentos(usuarioId: string, empreendimentoIds: string[], papel?: PapelVinculo) {
  return postJson<EmpreendimentoVinculado[]>(`/api/usuarios/${usuarioId}/empreendimentos`, { empreendimentoIds, papel });
}

export function desvincularEmpreendimento(usuarioId: string, empreendimentoId: string) {
  return del(`/api/usuarios/${usuarioId}/empreendimentos/${empreendimentoId}`);
}

/**
 * Fase 2.5 — Relatórios (PDF/Excel): as rotas devolvem o arquivo binário
 * direto (não JSON) -- `baixarRelatorio` busca via fetch (cookie de sessão
 * já vai junto, mesmo padrão de `apiFetch`), monta um blob e dispara o
 * download por um link temporário, sem sair da SPA.
 */
async function baixarRelatorio(url: string, nomeArquivoPadrao: string): Promise<void> {
  const res = await apiFetch(url);
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha ao gerar relatório (${res.status})` }));
    throw new Error(erro.erro ?? `Falha ao gerar relatório (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const nomeArquivo = /filename="([^"]+)"/.exec(disposition)?.[1] ?? nomeArquivoPadrao;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export type FormatoRelatorio = "pdf" | "xlsx";

export function baixarRelatorioViabilidade(cenarioId: string, formato: FormatoRelatorio): Promise<void> {
  return baixarRelatorio(`/api/cenarios/${cenarioId}/relatorios/viabilidade.${formato}`, `relatorio-viabilidade.${formato}`);
}

export function baixarRelatorioComparativo(empreendimentoId: string, cenarioIds: string[], formato: FormatoRelatorio): Promise<void> {
  const ids = cenarioIds.map(encodeURIComponent).join(",");
  return baixarRelatorio(`/api/empreendimentos/${empreendimentoId}/relatorios/comparacao.${formato}?ids=${ids}`, `relatorio-comparativo.${formato}`);
}
