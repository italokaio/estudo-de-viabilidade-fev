import { useCallback, useEffect, useRef } from "react";

/** Devolve uma função que diz se um cenário ainda é o selecionado, para descartar respostas atrasadas de outro cenário. */
export function useCenarioAtivo(cenarioId: string | null) {
  const ativoRef = useRef(cenarioId);
  useEffect(() => {
    ativoRef.current = cenarioId;
  }, [cenarioId]);
  return useCallback((alvo: string) => ativoRef.current === alvo, []);
}
