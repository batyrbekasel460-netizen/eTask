import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://etask:etask@localhost:5432/etask",
  jwtSecret: process.env.JWT_SECRET ?? "change-this-secret-before-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  uploadDir: process.env.UPLOAD_DIR ?? "./storage/uploads",
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
};
