import type { buildApp as buildAppType } from "../../api/src/app.js";
import { buildApp } from "../../api/src/app.js";
import { criarUsuario } from "../../src/db/auth.js";

/**
 * Toda rota da API exige sessao (ver api/src/app.ts). Em vez de anexar o
 * cookie de sessao em cada uma das ~140 chamadas app.inject() espalhadas
 * pela suite, cria um usuario de teste, faz login uma vez, e substitui
 * app.inject por uma versao que sempre carrega o cookie -- um unico ponto
 * de mudanca por arquivo de teste (app = await buildApp() vira
 * app = await buildAuthenticatedApp()).
 */
export async function buildAuthenticatedApp(papel: "admin" | "usuario" = "admin"): Promise<Awaited<ReturnType<typeof buildAppType>>> {
  const app = await buildApp();
  const email = `teste-${papel}-${Math.random().toString(36).slice(2)}@local.test`;
  await criarUsuario({ email, nome: "Usuário de Teste", senha: "senha-de-teste-123", papel });

  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, senha: "senha-de-teste-123" } });
  const cookie = login.headers["set-cookie"];
  if (!cookie) throw new Error("login de teste falhou — sem set-cookie na resposta");

  const injectOriginal = app.inject.bind(app);
  app.inject = ((opts: any) => {
    const opcoes = typeof opts === "string" ? { url: opts } : opts;
    return injectOriginal({ ...opcoes, headers: { ...(opcoes.headers ?? {}), cookie } });
  }) as typeof app.inject;

  return app;
}
