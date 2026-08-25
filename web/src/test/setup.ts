import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom nao implementa matchMedia -- ThemeToggle (renderizado em toda
// pagina) le window.matchMedia("(prefers-color-scheme: dark)") sem
// nenhuma feature-detection, entao todo teste que renderiza uma pagina
// precisa deste polyfill minimo, nao so os testes de tema.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

afterEach(() => {
  cleanup();
});
