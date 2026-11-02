import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { buildFirestoreApp } from "./firestore/app.js";

const config = loadConfig();
const app =
  config.DATABASE_BACKEND === "legacy-firestore"
    ? await buildApp(config)
    : await buildFirestoreApp(config);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => {
      process.exitCode = 0;
    });
  });
}
try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
