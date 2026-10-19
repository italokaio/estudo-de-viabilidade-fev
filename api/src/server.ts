import { buildApp } from "./app.js";

const app = await buildApp();
const port = Number(process.env.PORT ?? 3333);

// host 0.0.0.0: em producao (Railway, Docker, etc.) o processo roda num
// container e so e alcancavel de fora se escutar em todas as interfaces --
// 127.0.0.1 so aceita conexoes da propria maquina. Em localhost continua
// acessivel normalmente por http://127.0.0.1:3333 ou http://localhost:3333.
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
