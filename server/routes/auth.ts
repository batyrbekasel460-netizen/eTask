import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types.js";

export const authRouter = Router();
authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: "Укажите логин и пароль" });
  const { rows } = await pool.query(`SELECT id, username, password_hash, full_name, role, department_id, status FROM users WHERE username=$1`, [username]);
  const user = rows[0];
  if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Неверный логин или пароль" });
  const payload = { id:user.id, username:user.username, role:user.role, departmentId:user.department_id };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
  res.json({ token, user:{ ...payload, fullName:user.full_name } });
});
authRouter.get("/me", authenticate, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(`SELECT id, username, full_name AS "fullName", role, department_id AS "departmentId", email, phone FROM users WHERE id=$1`, [req.user!.id]);
  res.json(rows[0]);
});
