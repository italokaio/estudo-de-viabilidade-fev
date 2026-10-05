import { createContext, useContext, type ReactNode } from "react";

/**
 * Espelha as regras da API (api/src/app.ts, garantirAcesso): para escrever num
 * empreendimento vale só o vínculo ("edicao"; "admin" escreve em tudo), e toda
 * exclusão exige admin. A tela só esconde o que a API negaria; quem decide
 * continua sendo a API.
 */
export type NivelAcessoEmpreendimento = "admin" | "edicao" | "leitura";

export interface PermissoesEscrita {
  podeEditar: boolean;
  podeExcluir: boolean;
}

const SEM_PERMISSAO: PermissoesEscrita = { podeEditar: false, podeExcluir: false };

export function permissoesDoNivel(nivel: NivelAcessoEmpreendimento | null | undefined): PermissoesEscrita {
  return { podeEditar: nivel === "admin" || nivel === "edicao", podeExcluir: nivel === "admin" };
}

export const PermissoesContext = createContext<PermissoesEscrita>(SEM_PERMISSAO);
export const UsuarioContext = createContext<{ papel: string } | null>(null);

export function PermissoesProvider({ nivel, children }: { nivel: NivelAcessoEmpreendimento | null | undefined; children: ReactNode }) {
  return <PermissoesContext.Provider value={permissoesDoNivel(nivel)}>{children}</PermissoesContext.Provider>;
}

export function PermitidoEditar({ children }: { children: ReactNode }) {
  const { podeEditar } = useContext(PermissoesContext);
  return podeEditar ? <>{children}</> : null;
}

export function PermitidoExcluir({ children }: { children: ReactNode }) {
  const { podeExcluir } = useContext(PermissoesContext);
  return podeExcluir ? <>{children}</> : null;
}

export function nivelDoEmpreendimento(
  lista: { id: string; nivelAcesso: NivelAcessoEmpreendimento }[],
  empreendimentoId: string | null | undefined,
): NivelAcessoEmpreendimento | null {
  return lista.find((e) => e.id === empreendimentoId)?.nivelAcesso ?? null;
}

export function nivelDoCenario(
  lista: { nivelAcesso: NivelAcessoEmpreendimento; cenarios: { id: string }[] }[],
  cenarioId: string | null | undefined,
): NivelAcessoEmpreendimento | null {
  return lista.find((e) => e.cenarios.some((c) => c.id === cenarioId))?.nivelAcesso ?? null;
}
