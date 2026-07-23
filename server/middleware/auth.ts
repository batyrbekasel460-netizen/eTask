import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { AuthRequest, AuthUser, Role } from "../types.js";
import { pool } from "../db.js";

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const headerToken = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  const token = req.cookies?.etask_session ?? headerToken;
  if (!token) return res.status(401).json({ error: "Требуется авторизация" });
  try {
    const payload=jwt.verify(token,config.jwtSecret,{issuer:"etask",audience:"etask-web"}) as jwt.JwtPayload;
    if(typeof payload.sub!=="string"||typeof payload.jti!=="string")return res.status(401).json({error:"Недействительная сессия"});
    const {rows}=await pool.query(`SELECT u.id,u.username,u.role,u.department_id,u.status FROM users u JOIN user_sessions s ON s.user_id=u.id
      WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()`,[payload.sub,payload.jti]);
    const current=rows[0];
    if(!current||current.status!=="active")return res.status(401).json({error:"Учётная запись отключена"});
    req.user={id:current.id,username:current.username,role:current.role,departmentId:current.department_id} as AuthUser;
    next();
  }
  catch { return res.status(401).json({ error: "Сессия истекла" }); }
}

export function allow(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => req.user && roles.includes(req.user.role)
    ? next() : res.status(403).json({ error: "Недостаточно прав" });
}
