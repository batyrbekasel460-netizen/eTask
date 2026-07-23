import pino from "pino";
import { config } from "./config.js";

export const logger=pino({
  level:config.logLevel,
  base:{service:"etask-api",environment:config.nodeEnv},
  redact:{paths:["req.headers.authorization","req.headers.cookie","password","token","jwtSecret"],censor:"[REDACTED]"},
  timestamp:pino.stdTimeFunctions.isoTime,
});
