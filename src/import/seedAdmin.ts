import { pathToFileURL } from "node:url";
import { criarUsuario } from "../db/auth.js";
import { prisma } from "../db/client.js";

/**
 * Cria o primeiro usuário administrador — necessário porque
 * POST /api/usuarios exige um admin autenticado (problema do ovo e da
 * galinha: sem este script, ninguém consegue criar o primeiro usuário).
 * Uso: npm run seed:admin -- <email> <nome> <senha>
 */
export async function seedAdmin(email: string, nome: string, senha: string) {
  return criarUsuario({ email, nome, senha, papel: "admin" });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const [email, nome, senha] = process.argv.slice(2);
  if (!email || !nome || !senha) {
    console.error("Uso: npm run seed:admin -- <email> <nome> <senha>");
    process.exit(1);
  }
  seedAdmin(email, nome, senha)
    .then((usuario) => {
      console.log("Administrador criado:", usuario);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
