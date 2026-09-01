import { buildApp } from "./app.js";

const host = process.env.FRESHCHECKOUT_HOST ?? "127.0.0.1";
const port = Number(process.env.FRESHCHECKOUT_PORT ?? 4317);
const app = await buildApp();

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
