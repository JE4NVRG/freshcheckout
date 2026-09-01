import { buildApp } from "./app.js";
import { resolveServerAddress } from "./address.js";

const { host, port } = resolveServerAddress();
const app = await buildApp();

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
