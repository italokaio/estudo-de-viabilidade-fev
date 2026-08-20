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

export interface TipologiaResumo {
  id: string;
  nome: string;
  areaPrivativaPadrao: string | null;
  precoUnitarioPadrao: string | null;
  quantidadeUnidades: number;
}

export interface EmpreendimentoDetalhe {
  id: string;
  nome: string;
  incorporador: string | null;
  endereco: string | null;
  tipologias: TipologiaResumo[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({ erro: `Falha (${res.status})` }));
    throw new Error(erro.erro ?? `Falha (${res.status})`);
  }
  return res.json();
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
