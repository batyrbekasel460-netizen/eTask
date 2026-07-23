import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import type { AuthRequest } from "../types.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";

export const authRouter = Router();
const loginSchema = z.object({ body: z.object({ username: z.string().trim().min(3).max(100), password: z.string().min(8).max(200) }), params: z.object({}), query: z.object({}) });

authRouter.post("/login", validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query(`SELECT id, username, password_hash, full_name, role, department_id, status FROM users WHERE username=$1`, [username]);
  const user = rows[0];
  const passwordMatches=await bcrypt.compare(password,user?.password_hash??"$2b$12$C6UzMDM.H6dfI/f/IKcEe.97t9zWj3oVZ7fsDmZECq.NT7q0S2S5a");
  if (!user || user.status !== "active" || !passwordMatches){logger.warn({username,ip:req.ip},"Authentication failed");return res.status(401).json({ error: "Неверный логин или пароль" });}
  const sessionId=randomUUID();
  const expiresAt=new Date(Date.now()+config.jwtExpiresMs);
  await pool.query("DELETE FROM user_sessions WHERE expires_at<=now() OR revoked_at IS NOT NULL");
  await pool.query("INSERT INTO user_sessions(id,user_id,expires_at) VALUES($1,$2,$3)",[sessionId,user.id,expiresAt]);
  const token = jwt.sign({}, config.jwtSecret, {subject:user.id,issuer:"etask",audience:"etask-web",jwtid:sessionId,expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
  res.cookie("etask_session", token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    priority:"high",
    path: "/",
  });
  res.setHeader("Cache-Control","no-store");
  logger.info({userId:user.id,role:user.role,ip:req.ip},"Authentication succeeded");
  await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,details,ip) VALUES($1,'auth.login','session',$2,$3,$4)",[user.id,sessionId,JSON.stringify({role:user.role}),req.ip]);
  res.json({ user:{ id:user.id,username:user.username,role:user.role,departmentId:user.department_id,fullName:user.full_name } });
});
authRouter.post("/logout", async (req, res) => {
  const token=req.cookies?.etask_session;
  if(token){try{const payload=jwt.verify(token,config.jwtSecret,{issuer:"etask",audience:"etask-web",ignoreExpiration:true}) as jwt.JwtPayload;if(payload.jti){await pool.query("UPDATE user_sessions SET revoked_at=now() WHERE id=$1",[payload.jti]);await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,ip) VALUES($1,'auth.logout','session',$2,$3)",[payload.sub,payload.jti,req.ip]);}logger.info({userId:payload.sub,sessionId:payload.jti},"Session revoked");}catch{/* Cookie is cleared even when the token is malformed. */}}
  res.clearCookie("etask_session", { httpOnly: true, sameSite: "strict", secure: config.cookieSecure, path: "/" });
  res.status(204).end();
});
authRouter.get("/me", authenticate, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(`SELECT id, username, full_name AS "fullName", role, department_id AS "departmentId", email, phone FROM users WHERE id=$1`, [req.user!.id]);
  if (!rows[0]) return res.status(401).json({ error: "Пользователь не найден" });
  res.setHeader("Cache-Control","no-store");
  res.json(rows[0]);
});
