import { config } from "./config.js";
import { ensureTaskWorkflowSchema, pool } from "./db.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";

await ensureTaskWorkflowSchema();
const server = createApp().listen(config.port, config.host, () => logger.info({host:config.host,port:config.port},"eTask API started"));

async function shutdown(signal: string) {
  logger.info({signal},"eTask API shutting down");
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection",error=>{logger.fatal({err:error},"Unhandled promise rejection");void shutdown("unhandledRejection");});
process.on("uncaughtException",error=>{logger.fatal({err:error},"Uncaught exception");void shutdown("uncaughtException");});
