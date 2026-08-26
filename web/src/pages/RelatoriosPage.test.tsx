import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RelatoriosPage } from "./RelatoriosPage.js";
import * as client from "../api/client.js";

/**
 * Fase 2.5 — tela de Relatórios. Mesma disciplina de teste das telas
 * anteriores: fluxos críticos, não cobertura de linha. `baixarRelatorio*`
 * é mockado inteiro (não testamos o download de blob aqui, só que a tela
 * chama a função certa com os parâmetros certos).
 */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchEmpreendimentoDetalhe: vi.fn(),
    baixarRelatorioViabilidade: vi.fn(),
    baixarRelatorioComparativo: vi.fn(),
  };
});

const empreendimentos: client.EmpreendimentoResumo[] = [
  { id: "emp1", nome: "Recanto das Aroeiras", cenarios: [{ id: "cen1", nome: "Base", tipo: "base", horizonteProjecaoMeses: 12 }] },
];

function detalhe(): any {
  return {
    id: "emp1",
    nome: "Recanto das Aroeiras",
    incorporador: null,
    endereco: null,
    terrenos: [],
    cenarios: [
      { id: "cen1", nome: "Base", tipo: "base", horizonteProjecaoMeses: 12, derivadoDeNome: null },
      { id: "cen2", nome: "Otimista", tipo: "otimista", horizonteProjecaoMeses: 12, derivadoDeNome: "Base" },
    ],
    tipologias: [],
    categoriasCusto: [],
  };
}

beforeEach(() => {
  vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos);
  vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue(detalhe());
});

describe("RelatoriosPage", () => {
  it("gera relatório de viabilidade em PDF para o cenário selecionado", async () => {
    vi.mocked(client.baixarRelatorioViabilidade).mockResolvedValue(undefined);

    render(<RelatoriosPage />);
    await screen.findByText("Recanto das Aroeiras");

    const botao = await screen.findByRole("button", { name: "Gerar relatório" });
    await waitFor(() => expect(botao).not.toBeDisabled());
    fireEvent.click(botao);

    // timeout maior que o padrao: sob a suite completa (varios arquivos de
    // teste rodando juntos), o encadeamento de dois efeitos assincronos
    // (fetchEmpreendimentos -> fetchEmpreendimentoDetalhe) pode passar de
    // 1s por contencao de CPU, mesmo cada chamada sendo mockada e rapida.
    await waitFor(() => expect(client.baixarRelatorioViabilidade).toHaveBeenCalledWith("cen1", "pdf"), { timeout: 5000 });
  });

  it("gera relatório comparativo em Excel para os cenários marcados", async () => {
    vi.mocked(client.baixarRelatorioComparativo).mockResolvedValue(undefined);

    render(<RelatoriosPage />);
    await screen.findByText("Recanto das Aroeiras");

    fireEvent.click(screen.getByRole("button", { name: /^Comparativo de Cenários/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Excel/ }));
    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

    await waitFor(() =>
      expect(client.baixarRelatorioComparativo).toHaveBeenCalledWith("emp1", expect.arrayContaining(["cen1", "cen2"]), "xlsx"),
    );
  });

  it("botão 'Gerar relatório' fica desabilitado sem nenhum cenário selecionado no comparativo", async () => {
    render(<RelatoriosPage />);
    await screen.findByText("Recanto das Aroeiras");

    fireEvent.click(screen.getByRole("button", { name: /^Comparativo de Cenários/ }));

    expect(screen.getByRole("button", { name: "Gerar relatório" })).toBeDisabled();
  });

  it("mostra o erro do backend quando gerar o relatório falha", async () => {
    vi.mocked(client.baixarRelatorioViabilidade).mockRejectedValue(new Error("Falha ao gerar relatório (500)"));

    render(<RelatoriosPage />);
    await screen.findByText("Recanto das Aroeiras");
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

    expect(await screen.findByText(/Falha ao gerar relatório/)).toBeInTheDocument();
  });
});
