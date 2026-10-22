import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // permite importar design/tokens.css, que vive na raiz do repositorio,
    // um nivel acima deste projeto — nao e um arquivo do usuario, e a fonte
    // de verdade do design system (ver docs/DESIGN_SYSTEM.md).
    fs: { allow: [".."] },
    proxy: {
      "/api": "http://127.0.0.1:3333",
    },
  },
});
// forca invalidar cache de build apos troca de icones
