import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url().optional(),
  PGHOST: z.string().default("localhost"),
  PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
  PGUSER: z.string().default("etask"),
  PGPASSWORD: z.string().optional(),
  PGDATABASE: z.string().default("etask"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET должен содержать не менее 32 символов"),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default("8h"),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  LOG_LEVEL: z.enum(["fatal","error","warn","info","debug","trace","silent"]).default("info"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
  JSON_BODY_LIMIT: z.string().regex(/^\d+(kb|mb)$/i).default("2mb"),
}).superRefine((env,ctx)=>{
  if(!env.DATABASE_URL&&(!env.PGPASSWORD||env.PGPASSWORD.length<12))ctx.addIssue({code:"custom",path:["PGPASSWORD"],message:"PGPASSWORD должен содержать не менее 12 символов, если DATABASE_URL не задан"});
  for(const origin of env.FRONTEND_ORIGIN.split(",")){try{new URL(origin.trim());}catch{ctx.addIssue({code:"custom",path:["FRONTEND_ORIGIN"],message:`Некорректный адрес: ${origin}`});}}
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Некорректная конфигурация окружения: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
}

const env = parsed.data;
const durationMatch=/^(\d+)([smhd])$/.exec(env.JWT_EXPIRES_IN)!;
const durationUnits={s:1_000,m:60_000,h:3_600_000,d:86_400_000} as const;
export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  host: env.HOST,
  databaseUrl: env.DATABASE_URL,
  database:{host:env.PGHOST,port:env.PGPORT,user:env.PGUSER,password:env.PGPASSWORD,database:env.PGDATABASE},
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  jwtExpiresMs:Number(durationMatch[1])*durationUnits[durationMatch[2] as keyof typeof durationUnits],
  uploadDir: env.UPLOAD_DIR,
  frontendOrigins: env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  cookieSecure: env.COOKIE_SECURE,
  logLevel:env.LOG_LEVEL,
  trustProxy:env.TRUST_PROXY,
  jsonBodyLimit:env.JSON_BODY_LIMIT,
};
