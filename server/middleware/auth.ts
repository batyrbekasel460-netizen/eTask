import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { AuthRequest, AuthUser, Role } from "../types.js";

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Требуется авторизация" });
  try { req.user = jwt.verify(token, config.jwtSecret) as AuthUser; next(); }
  catch { return res.status(401).json({ error: "Сессия истекла" }); }
}

export function allow(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => req.user && roles.includes(req.user.role)
    ? next() : res.status(403).json({ error: "Недостаточно прав" });
}
