import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { pool } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { tasksRouter } from "./routes/tasks.js";
import { filesRouter } from "./routes/files.js";
import { usersRouter } from "./routes/users.js";
import { workspaceRouter } from "./routes/workspace.js";
import { adminRouter } from "./routes/admin.js";
import { errorHandler } from "./middleware/error.js";
import { logger } from "./logger.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy",config.trustProxy);
  app.use(pinoHttp({logger,genReqId:(req,res)=>{const supplied=req.headers["x-request-id"];const id=typeof supplied==="string"&&supplied.length<=100?supplied:randomUUID();res.setHeader("X-Request-Id",id);return id;},autoLogging:{ignore:req=>req.url==="/api/health"},customLogLevel:(_req,res,error)=>error||res.statusCode>=500?"error":res.statusCode>=400?"warn":"info"}));
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: config.frontendOrigins, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE"] }));
  app.use(compression());
  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(cookieParser());
  app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false }));
  app.get("/api/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "eTask API" });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", workspaceRouter);
  app.use((_req, res) => res.status(404).json({ error: "Маршрут не найден" }));
  app.use(errorHandler);
  return app;
}
