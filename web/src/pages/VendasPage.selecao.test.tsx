import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendasPage } from "./VendasPage.js";
import * as client from "../api/client.js";

/**
 * Cenário selecionado não pode ser sobrescrito pela resposta atrasada do cenário que a
 * tela carregou primeiro (o primeiro da lista). Regressão da troca de cenário em Vendas.
 */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchVendasDoCenario: vi.fn(),
    fetchRecebimentos: vi.fn(),
    fetchEstoque: vi.fn(),
    fetchEmpreendimentoDetalhe: vi.fn(),
  };
});

const empreendimentos: client.EmpreendimentoResumo[] = [
  { id: "emp1", nome: "Primeiro Empreendimento", nivelAcesso: "admin", cenarios: [{ id: "cen1", nome: "Padrão", tipo: "base", horizonteProjecaoMeses: 12 } as client.CenarioResumo] },
  { id: "emp2", nome: "Segundo Empreendimento", nivelAcesso: "admin", cenarios: [{ id: "cen2", nome: "Alvo", tipo: "base", horizonteProjecaoMeses: 12 } as client.CenarioResumo] },
];

function venda(id: string): any {
  return {
    id,
    unidade: { numero: id, tipologiaId: "t1", tipologiaNome: "Apto" },
    tipologia: { nome: "Apto" },
    comprador: null,
    condicaoPagamento: { id: "c1", nome: "Padrão" },
    valorVenda: "100000",
    mesOrigem: 1,
    status: "ativa",
  };
}

function deferido<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => (resolver = r));
  return { promessa, resolver };
}

describe("VendasPage — troca de cenário", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
    vi.mocked(client.fetchRecebimentos).mockResolvedValue([]);
    vi.mocked(client.fetchEstoque).mockResolvedValue({ total: 0, porStatus: {} });
    vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue({ id: "emp1", nome: "Primeiro Empreendimento", tipologias: [], cenarios: [] } as any);
  });

  it("descarta a resposta atrasada do cenário anterior e mostra as vendas do cenário selecionado", async () => {
    const atrasado = deferido<any[]>();
    vi.mocked(client.fetchVendasDoCenario).mockImplementation((id: string) => {
      if (id === "cen1") return atrasado.promessa;
      return Promise.resolve([venda("B-1")]);
    });

    render(<VendasPage />);
    await waitFor(() => expect(client.fetchVendasDoCenario).toHaveBeenCalledWith("cen1"));
    await waitFor(() => expect(document.querySelector("select")).not.toBeNull());

    fireEvent.change(document.querySelector("select")!, { target: { value: "cen2" } });
    await waitFor(() => expect(screen.getByText("Vendas do cenário — 1")).toBeTruthy());

    atrasado.resolver([venda("A-1"), venda("A-2"), venda("A-3")]);
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getByText("Vendas do cenário — 1")).toBeTruthy();
    expect(screen.queryByText("Vendas do cenário — 3")).toBeNull();
  });

  it("a segunda carga inicial da lista (StrictMode) não sobrescreve o cenário que o usuário escolheu", async () => {
    const segundaCarga = deferido<client.EmpreendimentoResumo[]>();
    vi.mocked(client.fetchEmpreendimentos).mockResolvedValueOnce(empreendimentos).mockReturnValueOnce(segundaCarga.promessa);
    vi.mocked(client.fetchVendasDoCenario).mockImplementation((id: string) =>
      Promise.resolve(id === "cen2" ? [venda("B-1")] : [venda("A-1"), venda("A-2")]),
    );

    render(<React.StrictMode><VendasPage /></React.StrictMode>);
    await waitFor(() => expect(document.querySelector("select")).not.toBeNull());
    fireEvent.change(document.querySelector("select")!, { target: { value: "cen2" } });
    await waitFor(() => expect(screen.getByText("Vendas do cenário — 1")).toBeTruthy());

    segundaCarga.resolver(empreendimentos);
    await new Promise((r) => setTimeout(r, 50));

    expect((document.querySelector("select") as HTMLSelectElement).value).toBe("cen2");
    expect(screen.getByText("Vendas do cenário — 1")).toBeTruthy();
  });
});
