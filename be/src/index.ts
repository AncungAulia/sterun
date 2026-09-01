/**
 * STE-6 — process entry point. Config is loaded before the server is built, so
 * a missing or unreadable docs/deployments.md kills startup instead of
 * producing a server that answers /health while pointing at nothing.
 */
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig();
const app = buildServer(config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, "shutting down");
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { network: config.network.name, addresses: config.addresses },
    "sterun backend ready",
  );
} catch (err) {
  app.log.error(err, "failed to start");
  process.exit(1);
}
