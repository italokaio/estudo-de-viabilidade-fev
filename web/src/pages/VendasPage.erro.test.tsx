import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VendasPage } from "./VendasPage.js";
import * as client from "../api/client.js";

/** Mensagem de erro não pode sobreviver a uma nova ação na mesma tela. */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchVendasDoCenario: vi.fn(),
    fetchRecebimentos: vi.fn(),
    fetchEstoque: vi.fn(),
    fetchEmpreendimentoDetalhe: vi.fn(),
    fetchImpactoExclusaoVenda: vi.fn(),
  };
});

const empreendimentos: client.EmpreendimentoResumo[] = [
  { id: "emp1", nome: "Empreendimento", nivelAcesso: "admin", cenarios: [{ id: "cen1", nome: "Padrão", tipo: "base", horizonteProjecaoMeses: 12 } as client.CenarioResumo] },
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

describe("VendasPage — mensagem de erro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
    vi.mocked(client.fetchVendasDoCenario).mockResolvedValue([venda("A-1")]);
    vi.mocked(client.fetchRecebimentos).mockResolvedValue([]);
    vi.mocked(client.fetchEstoque).mockResolvedValue({ total: 0, porStatus: {} });
    vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue({ id: "emp1", nome: "Empreendimento", tipologias: [], cenarios: [] } as any);
  });

  it("some ao iniciar nova ação na tela, mesmo quando essa ação é recusada sem erro novo", async () => {
    vi.mocked(client.fetchImpactoExclusaoVenda)
      .mockRejectedValueOnce(new Error("Falha de teste ao consultar"))
      .mockResolvedValue({ premissaPassaraValer: false });
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<VendasPage />);
    const excluir = await screen.findByRole("button", { name: "Excluir" });
    fireEvent.click(excluir);
    await waitFor(() => expect(screen.getByText("Falha de teste ao consultar")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(confirmar).toHaveBeenCalled());
    expect(screen.queryByText("Falha de teste ao consultar")).toBeNull();
    confirmar.mockRestore();
  });
});
