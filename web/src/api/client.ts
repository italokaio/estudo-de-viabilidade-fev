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
