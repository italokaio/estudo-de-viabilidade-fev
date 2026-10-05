import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustosPage } from "./CustosPage.js";
import { CronogramaPage } from "./CronogramaPage.js";
import { FluxoCaixaPage } from "./FluxoCaixaPage.js";
import * as client from "../api/client.js";

/**
 * Regressão da seleção de cenário nas telas Custos, Cronograma e Fluxo de caixa (mesma
 * disciplina de VendasPage.selecao.test.tsx): resposta atrasada de outro cenário não pode
 * sobrescrever a lista, e a carga inicial (duplicada pelo StrictMode) não pode sobrescrever
 * a escolha do usuário.
 */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchCustosResumo: vi.fn(),
    fetchCronogramaCurva: vi.fn(),
    fetchFluxoCaixa: vi.fn(),
    fetchCenarioDetalhe: vi.fn(),
    fetchDistribuicaoMensalCusto: vi.fn(),
    fetchRecebimentos: vi.fn(),
    fetchDesembolsosCustos: vi.fn(),
  };
});

const empreendimentos: client.EmpreendimentoResumo[] = [
  {
    id: "emp1",
    nome: "Empreendimento",
    nivelAcesso: "admin",
    cenarios: [
      { id: "cen1", nome: "Primeiro", tipo: "base", horizonteProjecaoMeses: 12 } as client.CenarioResumo,
      { id: "cen2", nome: "Segundo", tipo: "base", horizonteProjecaoMeses: 12 } as client.CenarioResumo,
    ],
  },
];

function deferido<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => (resolver = r));
  return { promessa, resolver };
}

function custoResumo(id: string, categoria: string): any {
  return {
    id,
    categoriaId: `cat-${id}`,
    categoriaNome: categoria,
    papel: "custo",
    tipoIncidencia: "pct_vgv_vendido_no_mes",
    tipologiaId: null,
    tipologiaNome: null,
    recorrencia: "unico",
    competenciaMes: null,
    status: "previsto",
    totalPrevisto: "1000.00",
    totalRealizado: "0.00",
    saldoARealizar: "1000.00",
    desvio: "-1000.00",
    desvioPercentual: "-100.00",
  };
}

function detalheCenario(): any {
  return { id: "x", nome: "x", categoriasCustoDisponiveis: [], tipologiasDisponiveis: [], indicesCorrecao: [], cronograma: [], custos: [], financiamento: null, premissas: [] };
}

function fluxo(nomeCenario: string): any {
  return {
    empreendimento: "Empreendimento",
    cenario: nomeCenario,
    horizonteProjecaoMeses: 12,
    fluxo: [],
    indicadores: { necessidadeMaximaCapital: "0.00", mesPico: null, mesRecuperacao: null, mesRecuperacaoDescontado: null, saldoFinal: "0.00", vpl: "0.00", taxaDescontoMensal: "0.005", tir: null, margemLiquida: null },
    financiamento: [],
    alertas: [],
    recebimentosRealizados: [],
  };
}

describe("seleção de cenário — Custos, Cronograma e Fluxo de caixa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.fetchDistribuicaoMensalCusto).mockResolvedValue({ meses: [], realizadoPorMes: [], granular: true } as any);
    vi.mocked(client.fetchCenarioDetalhe).mockResolvedValue(detalheCenario());
    vi.mocked(client.fetchRecebimentos).mockResolvedValue([]);
    vi.mocked(client.fetchDesembolsosCustos).mockResolvedValue([]);
  });

  describe("Custos", () => {
    it("resposta atrasada do cenário anterior não sobrescreve a lista do cenário selecionado", async () => {
      const atrasado = deferido<any[]>();
      vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
      vi.mocked(client.fetchCustosResumo).mockImplementation((id: string) =>
        id === "cen1" ? atrasado.promessa : Promise.resolve([custoResumo("c2", "Custo do segundo")]),
      );

      render(<CustosPage />);
      await waitFor(() => expect(client.fetchCustosResumo).toHaveBeenCalledWith("cen1"));
      await waitFor(() => expect(document.querySelector("select")).not.toBeNull());
      fireEvent.change(document.querySelector("select")!, { target: { value: "cen2" } });
      await waitFor(() => expect(screen.getAllByText("Custo do segundo").length).toBeGreaterThan(0));

      atrasado.resolver([custoResumo("c1", "Custo do primeiro")]);
      await new Promise((r) => setTimeout(r, 50));

      expect(screen.getAllByText("Custo do segundo").length).toBeGreaterThan(0);
      expect(screen.queryByText("Custo do primeiro")).toBeNull();
    });

    it("a segunda carga inicial (StrictMode) não sobrescreve o cenário escolhido", async () => {
      const segunda = deferido<client.EmpreendimentoResumo[]>();
      vi.mocked(client.fetchEmpreendimentos).mockResolvedValueOnce(empreendimentos).mockReturnValueOnce(segunda.promessa);
      vi.mocked(client.fetchCustosResumo).mockImplementation((id: string) =>
        Promise.resolve(id === "cen2" ? [custoResumo("c2", "Custo do segundo")] : [custoResumo("c1", "Custo do primeiro")]),
      );

      render(<React.StrictMode><CustosPage /></React.StrictMode>);
      await waitFor(() => expect(document.querySelector("select")).not.toBeNull());
      fireEvent.change(document.querySelector("select")!, { target: { value: "cen2" } });
      await waitFor(() => expect(screen.getAllByText("Custo do segundo").length).toBeGreaterThan(0));

      segunda.resolver(empreendimentos);
      await new Promise((r) => setTimeout(r, 50));

      expect((document.querySelector("select") as HTMLSelectElement).value).toBe("cen2");
      expect(screen.getAllByText("Custo do segundo").length).toBeGreaterThan(0);
      expect(screen.queryByText("Custo do primeiro")).toBeNull();
    });
  });

  describe("Cronograma", () => {
    const linhasDaCurva = () => document.querySelectorAll("tbody tr").length;

    function curva(meses: number[]) {
      return {
        pontos: meses.map((mes) => ({ mes, percentualExecucaoMensal: "0.5", percentualAcumulado: "0.5", desembolsoMensal: "100", desembolsoAcumulado: "100" })),
      } as any;
    }

    it("resposta atrasada do cenário anterior não sobrescreve a curva do cenário selecionado", async () => {
      const atrasado = deferido<any>();
      vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
      vi.mocked(client.fetchCronogramaCurva).mockImplementation((id: string) => (id === "cen1" ? atrasado.promessa : Promise.resolve(curva([1, 2, 3]))));

      render(<CronogramaPage />);
      await waitFor(() => expect(client.fetchCronogramaCurva).toHaveBeenCalledWith("cen1"));
      await waitFor(() => expect(document.querySelector("select")).not.toBeNull());
      fireEvent.change(document.querySelector("select")!, { target: { value: "cen2" } });
      await waitFor(() => expect(linhasDaCurva()).toBe(3));

      atrasado.resolver(curva([1]));
      await new Promise((r) => setTimeout(r, 50));

      expect(linhasDaCurva()).toBe(3);
    });

    it("a segunda carga inicial (StrictMode) não sobrescreve o cenário escolhido", async () => {
      const segunda = deferido<client.EmpreendimentoResumo[]>();
      vi.mocked(client.fetchEmpreendimentos).mockResolvedValueOnce(empreendimentos).mockReturnValueOnce(segunda.promessa);
      vi.mocked(client.fetchCronogramaCurva).mockImplementation((id: string) => Promise.resolve(id === "cen2" ? curva([1, 2, 3]) : curva([1])));

      render(<React.StrictMode><CronogramaPage /></React.StrictMode>);
      await waitFor(() => expect(document.querySelector("select")).not.toBeNull());
      fireEvent.change(document.querySelector("select")!, { target: { value: "cen2" } });
      await waitFor(() => expect(linhasDaCurva()).toBe(3));

      segunda.resolver(empreendimentos);
      await new Promise((r) => setTimeout(r, 50));

      expect((document.querySelector("select") as HTMLSelectElement).value).toBe("cen2");
      expect(linhasDaCurva()).toBe(3);
    });
  });

  describe("Fluxo de caixa", () => {
    it("resposta atrasada do cenário anterior não sobrescreve o fluxo do cenário selecionado", async () => {
      const atrasado = deferido<any>();
      vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
      vi.mocked(client.fetchFluxoCaixa).mockImplementation((id: string) => (id === "cen1" ? atrasado.promessa : Promise.resolve(fluxo("Segundo"))));

      render(<FluxoCaixaPage />);
      await waitFor(() => expect(client.fetchFluxoCaixa).toHaveBeenCalledWith("cen1"));
      await waitFor(() => expect(document.querySelector("select")).not.toBeNull());
      fireEvent.change(document.querySelector("select")!, { target: { value: "cen2" } });
      await waitFor(() => expect(screen.getAllByText(/Segundo/).length).toBeGreaterThan(0));

      atrasado.resolver(fluxo("Primeiro"));
      await new Promise((r) => setTimeout(r, 50));

      expect(screen.getAllByText(/Segundo/).length).toBeGreaterThan(0);
      expect(screen.queryAllByText(/Primeiro/).filter((e) => e.tagName !== "OPTION")).toHaveLength(0);
    });

    it("a segunda carga inicial (StrictMode) não sobrescreve o cenário escolhido", async () => {
      const segunda = deferido<client.EmpreendimentoResumo[]>();
      vi.mocked(client.fetchEmpreendimentos).mockResolvedValueOnce(empreendimentos).mockReturnValueOnce(segunda.promessa);
      vi.mocked(client.fetchFluxoCaixa).mockImplementation((id: string) => Promise.resolve(fluxo(id === "cen2" ? "Segundo" : "Primeiro")));

      render(<React.StrictMode><FluxoCaixaPage /></React.StrictMode>);
      await waitFor(() => expect(document.querySelector("select")).not.toBeNull());
      fireEvent.change(document.querySelector("select")!, { target: { value: "cen2" } });
      await waitFor(() => expect(screen.getAllByText(/Segundo/).length).toBeGreaterThan(0));

      segunda.resolver(empreendimentos);
      await new Promise((r) => setTimeout(r, 50));

      expect((document.querySelector("select") as HTMLSelectElement).value).toBe("cen2");
      expect(screen.getAllByText(/Segundo/).length).toBeGreaterThan(0);
    });
  });
});
