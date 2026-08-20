import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "./client.js";

/**
 * Autenticacao — token de sessao opaco (nao JWT) guardado na tabela
 * Sessao e verificado a cada request, nunca decodificado no cliente.
 * Mesmo padrao de "estado explicito no banco em vez de esperteza" usado
 * no resto do sistema (ver docs/DECISOES.md).
 */

const DURACAO_SESSAO_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

export interface CriarUsuarioInput {
  email: string;
  nome: string;
  senha: string;
  papel?: "admin" | "usuario";
}

export async function criarUsuario(input: CriarUsuarioInput) {
  const senhaHash = await bcrypt.hash(input.senha, 12);
  return prisma.usuario.create({
    data: { email: input.email.toLowerCase().trim(), nome: input.nome, senhaHash, papel: input.papel ?? "usuario" },
    select: { id: true, email: true, nome: true, papel: true, createdAt: true },
  });
}

export async function listarUsuarios() {
  return prisma.usuario.findMany({
    select: { id: true, email: true, nome: true, papel: true, createdAt: true },
    orderBy: { nome: "asc" },
  });
}

export async function excluirUsuario(id: string) {
  await prisma.sessao.deleteMany({ where: { usuarioId: id } });
  await prisma.usuario.delete({ where: { id } });
}

export interface AutenticarInput {
  email: string;
  senha: string;
}

/** Devolve o token de sessao + dados do usuario, ou null se as credenciais nao baterem. */
export async function autenticar(input: AutenticarInput) {
  const usuario = await prisma.usuario.findUnique({ where: { email: input.email.toLowerCase().trim() } });
  if (!usuario) return null;
  const senhaConfere = await bcrypt.compare(input.senha, usuario.senhaHash);
  if (!senhaConfere) return null;

  const token = randomBytes(32).toString("hex");
  await prisma.sessao.create({
    data: { usuarioId: usuario.id, token, expiraEm: new Date(Date.now() + DURACAO_SESSAO_MS) },
  });
  return { token, usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome, papel: usuario.papel } };
}

/** Devolve o usuario da sessao valida, ou null se o token nao existir/estiver expirado. */
export async function validarSessao(token: string) {
  const sessao = await prisma.sessao.findUnique({ where: { token }, include: { usuario: true } });
  if (!sessao) return null;
  if (sessao.expiraEm < new Date()) {
    await prisma.sessao.delete({ where: { token } });
    return null;
  }
  return { id: sessao.usuario.id, email: sessao.usuario.email, nome: sessao.usuario.nome, papel: sessao.usuario.papel };
}

export async function encerrarSessao(token: string) {
  await prisma.sessao.deleteMany({ where: { token } });
}
