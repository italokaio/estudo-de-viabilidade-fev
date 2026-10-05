import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CenariosPage } from "./CenariosPage.js";
import * as client from "../api/client.js";
import type { NivelAcessoEmpreendimento } from "../permissoes.js";

/**
 * Os botões de escrita só aparecem quando a API aceitaria a ação para o nível de
 * acesso do usuário no empreendimento: "edicao" escreve e não exclui; "leitura"
 * não escreve nem exclui; "admin" faz tudo.
 */
vi.mock("../api/client.js", async () => {
  const real = await vi.importActual<typeof client>("../api/client.js");
  return {
    ...real,
    fetchEmpreendimentos: vi.fn(),
    fetchEmpreendimentoDetalhe: vi.fn(),
    fetchComparacaoCenariosMultiplos: vi.fn(),
    criarCenario: vi.fn(),
    atualizarCenario: vi.fn(),
    duplicarCenario: vi.fn(),
    excluirCenario: vi.fn(),
  };
});

function empreendimentos(nivel: NivelAcessoEmpreendimento): client.EmpreendimentoResumo[] {
  return [
    {
      id: "emp1",
      nome: "Recanto das Aroeiras",
      nivelAcesso: nivel,
      cenarios: [{ id: "cen1", nome: "Cenário Principal", tipo: "base", horizonteProjecaoMeses: 12 }],
    },
  ];
}

function detalhe(nivel: NivelAcessoEmpreendimento): any {
  return {
    id: "emp1",
    nome: "Recanto das Aroeiras",
    nivelAcesso: nivel,
    incorporador: null,
    endereco: null,
    terrenos: [],
    cenarios: [{ id: "cen1", nome: "Cenário Principal", tipo: "base", horizonteProjecaoMeses: 12, derivadoDeNome: null }],
    tipologias: [],
    categoriasCusto: [],
  };
}

beforeEach(() => {
  vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue(detalhe("admin"));
});

async function renderizar(nivel: NivelAcessoEmpreendimento) {
  vi.mocked(client.fetchEmpreendimentos).mockResolvedValue(empreendimentos(nivel));
  vi.mocked(client.fetchEmpreendimentoDetalhe).mockResolvedValue(detalhe(nivel));
  render(<CenariosPage />);
  await screen.findByText("Cenário Principal");
}

describe("botões de escrita conforme o nível de acesso", () => {
  it("admin vê editar, duplicar e excluir", async () => {
    await renderizar("admin");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
  });

  it("usuário com vínculo de edição escreve, mas não vê excluir (a API responde 403)", async () => {
    await renderizar("edicao");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });

  it("usuário com vínculo de leitura não vê nenhum botão de escrita", async () => {
    await renderizar("leitura");
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duplicar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar" })).not.toBeInTheDocument();
  });
});
