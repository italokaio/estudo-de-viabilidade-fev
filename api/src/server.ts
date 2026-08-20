import { buildApp } from "./app.js";

const app = await buildApp();
const port = Number(process.env.PORT ?? 3333);

app.listen({ port, host: "127.0.0.1" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
