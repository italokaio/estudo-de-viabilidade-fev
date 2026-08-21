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

export type EixoSensibilidade = "custo" | "vgv" | "velocidadeVendas";

export interface PontoSensibilidade {
  variacao: string;
  vpl: string;
  necessidadeMaximaCapital: string;
  mesPico: number | null;
}

export async function fetchSensibilidade(cenarioId: string, eixo: EixoSensibilidade): Promise<PontoSensibilidade[]> {
  const res = await fetch(`/api/cenarios/${cenarioId}/sensibilidade?eixo=${eixo}`);
  if (!res.ok) throw new Error(`Falha ao calcular sensibilidade (${res.status})`);
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
}

export type TipoIncidenciaCusto = "fixo" | "pct_vgv_vendido_no_mes" | "pct_recebido_mes_anterior" | "pct_execucao";

export interface CategoriaCustoResumo {
  id: string;
  nome: string;
  tipoIncidencia: TipoIncidenciaCusto;
}

export type StatusValidacaoArea = "pendente" | "validado" | "conflitante";
export type FormaAquisicaoTerreno = "compra" | "permuta" | "misto";

export interface TerrenoResumo {
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
  terreno: TerrenoResumo | null;
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
  valorRealizado: string | null;
  status: string;
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
  indicesCorrecao: { mes: number; percentual: string }[];
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

export interface RecebimentoResumo {
  id: string;
  unidadeNumero: string;
  modalidadeNome: string;
  mesCompetencia: number;
  valorPrevisto: string;
  valorRealizado: string | null;
  status: string;
}

export async function fetchRecebimentos(cenarioId: string): Promise<RecebimentoResumo[]> {
  const res = await fetch(`/api/cenarios/${cenarioId}/recebimentos`);
  if (!res.ok) throw new Error(`Falha ao carregar recebimentos (${res.status})`);
  return res.json();
}

export function registrarRecebimentoRealizado(id: string, input: { valorRealizado: string; status?: "recebido" | "atrasado" }) {
  return patchJson<RecebimentoResumo>(`/api/recebimentos/${id}`, input);
}

export function estornarRecebimentoRealizado(id: string) {
  return patchJson<RecebimentoResumo>(`/api/recebimentos/${id}`, { estornar: true });
}

export function registrarCustoRealizado(id: string, input: { valorRealizado: string }) {
  return patchJson<CustoResumo>(`/api/custos/${id}`, input);
}

export function estornarCustoRealizado(id: string) {
  return patchJson<CustoResumo>(`/api/custos/${id}`, { estornar: true });
}

export function atualizarEmpreendimento(id: string, input: { nome?: string; incorporador?: string | null; endereco?: string | null }) {
  return patchJson<{ id: string; nome: string }>(`/api/empreendimentos/${id}`, input);
}

export function excluirEmpreendimento(id: string) {
  return del(`/api/empreendimentos/${id}`);
}

export function definirTerreno(
  empreendimentoId: string,
  input: { areaValor?: string; areaUnidade?: string; areaStatusValidacao?: StatusValidacaoArea; areaObservacao?: string; formaAquisicao?: FormaAquisicaoTerreno },
) {
  return postJson<TerrenoResumo>(`/api/empreendimentos/${empreendimentoId}/terreno`, input);
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

export interface DistratoResumo {
  valorRecebidoAteDistrato: string;
  percentualRetencao: string;
  valorRetido: string;
  valorReembolsar: string;
}

export interface VendaResumo {
  id: string;
  status: string;
  mesOrigem: number;
  valorVenda: string;
  distrato: DistratoResumo | null;
}

export interface UnidadeResumo {
  id: string;
  numero: string;
  andar: number | null;
  areaPrivativa: string | null;
  precoVenda: string | null;
  status: string;
  permuta: { id: string; nomeContraparte: string; documento: string | null; valorAtribuido: string | null } | null;
  venda: VendaResumo | null;
}

export async function fetchUnidades(tipologiaId: string): Promise<UnidadeResumo[]> {
  const res = await fetch(`/api/tipologias/${tipologiaId}/unidades`);
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

export function registrarDistrato(vendaId: string, input: { percentualRetencao?: string; motivo?: string }) {
  return postJson<DistratoResumo>(`/api/vendas/${vendaId}/distrato`, input);
}

export function desfazerDistrato(vendaId: string) {
  return del(`/api/vendas/${vendaId}/distrato`);
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
  input: { valorPrevisto?: string | null; percentual?: string | null; competenciaMes?: number | null; recorrencia?: "unico" | "mensal" },
) {
  return patchJson<CustoResumo>(`/api/custos/${id}`, input);
}

export function excluirCusto(id: string) {
  return del(`/api/custos/${id}`);
}

export function excluirCronograma(cenarioId: string) {
  return del(`/api/cenarios/${cenarioId}/cronograma`);
}

export function definirPontoIndiceCorrecao(cenarioId: string, input: { mes: number; percentual: string }) {
  return postJson<{ mes: number; percentual: string }>(`/api/cenarios/${cenarioId}/indices-correcao`, input);
}

export function excluirPontoIndiceCorrecao(cenarioId: string, mes: number) {
  return del(`/api/cenarios/${cenarioId}/indices-correcao/${mes}`);
}

export type Papel = "admin" | "usuario";

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
}

/** null quando não há sessão válida (não é um erro — é o estado esperado antes do login). */
export async function fetchUsuarioAtual(): Promise<Usuario | null> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Falha ao verificar sessão (${res.status})`);
  return res.json();
}

export async function login(email: string, senha: string): Promise<Usuario> {
  const res = await fetch("/api/auth/login", {
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
  await fetch("/api/auth/logout", { method: "POST" });
}

export interface UsuarioResumo extends Usuario {
  createdAt: string;
}

export async function fetchUsuarios(): Promise<UsuarioResumo[]> {
  const res = await fetch("/api/usuarios");
  if (!res.ok) throw new Error(`Falha ao carregar usuários (${res.status})`);
  return res.json();
}

export function criarUsuario(input: { email: string; nome: string; senha: string; papel?: Papel }) {
  return postJson<UsuarioResumo>("/api/usuarios", input);
}

export function excluirUsuario(id: string) {
  return del(`/api/usuarios/${id}`);
}

export interface EmpreendimentoVinculado {
  id: string;
  nome: string;
}

export async function fetchEmpreendimentosDoUsuario(usuarioId: string): Promise<EmpreendimentoVinculado[]> {
  const res = await fetch(`/api/usuarios/${usuarioId}/empreendimentos`);
  if (!res.ok) throw new Error(`Falha ao carregar acesso (${res.status})`);
  return res.json();
}

export function vincularEmpreendimento(usuarioId: string, empreendimentoId: string) {
  return postJson<EmpreendimentoVinculado[]>(`/api/usuarios/${usuarioId}/empreendimentos`, { empreendimentoId });
}

export function desvincularEmpreendimento(usuarioId: string, empreendimentoId: string) {
  return del(`/api/usuarios/${usuarioId}/empreendimentos/${empreendimentoId}`);
}
