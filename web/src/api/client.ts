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
}

export async function fetchEmpreendimentos(): Promise<EmpreendimentoResumo[]> {
  const res = await fetch("/api/empreendimentos");
  if (!res.ok) throw new Error(`Falha ao carregar empreendimentos (${res.status})`);
  return res.json();
}

export async function fetchFluxoCaixa(cenarioId: string): Promise<FluxoCaixaResposta> {
  const res = await fetch(`/api/cenarios/${cenarioId}/fluxo-caixa`);
  if (!res.ok) throw new Error(`Falha ao carregar fluxo de caixa (${res.status})`);
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
  modalidades: { nome: string; percentual: string; tipoDistribuicao: string }[];
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
}

export type TipoIncidenciaCusto = "fixo" | "pct_vgv_vendido_no_mes" | "pct_recebido_mes_anterior" | "pct_execucao";

export interface CategoriaCustoResumo {
  id: string;
  nome: string;
  tipoIncidencia: TipoIncidenciaCusto;
}

export interface EmpreendimentoDetalhe {
  id: string;
  nome: string;
  incorporador: string | null;
  endereco: string | null;
  cenarios: CenarioResumo[];
  tipologias: TipologiaResumo[];
  categoriasCusto: CategoriaCustoResumo[];
}

export interface CustoResumo {
  id: string;
  categoriaNome: string;
  tipoIncidencia: TipoIncidenciaCusto;
  valorPrevisto: string | null;
  percentual: string | null;
  competenciaMes: number | null;
  recorrencia: string;
}

export interface CenarioDetalhe {
  id: string;
  nome: string;
  tipo: string;
  horizonteProjecaoMeses: number;
  empreendimento: { id: string; nome: string };
  tipologiasDisponiveis: { id: string; nome: string }[];
  categoriasCustoDisponiveis: CategoriaCustoResumo[];
  premissasVelocidade: { id: string; tipologiaId: string; tipologiaNome: string; mes: number; unidadesPrevistas: string }[];
  custos: CustoResumo[];
  cronograma: { mes: number; percentualExecucaoMensal: string }[];
  totalVendasGeradas: number;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha (${res.status})` }));
    throw new Error(erro.erro ?? `Falha (${res.status})`);
  }
  return res.json();
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha (${res.status})` }));
    throw new Error(erro.erro ?? `Falha (${res.status})`);
  }
  return res.json();
}

async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha (${res.status})` }));
    throw new Error(erro.erro ?? `Falha (${res.status})`);
  }
}

export async function fetchEmpreendimentoDetalhe(id: string): Promise<EmpreendimentoDetalhe> {
  const res = await fetch(`/api/empreendimentos/${id}`);
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
  const res = await fetch(`/api/cenarios/${id}`);
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
  input: { categoriaId: string; valorPrevisto?: string; percentual?: string; competenciaMes?: number; recorrencia?: "unico" | "mensal" },
) {
  return postJson<CustoResumo>(`/api/cenarios/${cenarioId}/custos`, input);
}

export function criarCronograma(cenarioId: string, pontos: { mes: number; percentualExecucaoMensal: string }[]) {
  return postJson<{ criados: number }>(`/api/cenarios/${cenarioId}/cronograma`, { pontos });
}

export function atualizarEmpreendimento(id: string, input: { nome?: string; incorporador?: string | null; endereco?: string | null }) {
  return patchJson<{ id: string; nome: string }>(`/api/empreendimentos/${id}`, input);
}

export function excluirEmpreendimento(id: string) {
  return del(`/api/empreendimentos/${id}`);
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

export function atualizarCenario(id: string, input: { nome?: string; horizonteProjecaoMeses?: number }) {
  return patchJson<CenarioResumo>(`/api/cenarios/${id}`, input);
}

export function excluirCenario(id: string) {
  return del(`/api/cenarios/${id}`);
}
