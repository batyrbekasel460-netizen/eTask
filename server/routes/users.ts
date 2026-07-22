import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { allow, authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types.js";

export const usersRouter=Router(); usersRouter.use(authenticate);
usersRouter.get("/",async(req:AuthRequest,res)=>{const args=[];let where="";if(req.user!.role==="manager"){args.push(req.user!.departmentId);where="WHERE u.department_id=$1"}else if(req.user!.role==="expert"){args.push(req.user!.id);where="WHERE u.id=$1"}const {rows}=await pool.query(`SELECT u.id,u.full_name AS "fullName",u.position,u.role,u.status,u.email,u.phone,u.initials,d.name AS department FROM users u LEFT JOIN departments d ON d.id=u.department_id ${where} ORDER BY u.full_name`,args);res.json(rows)});
usersRouter.post("/",allow("director"),async(_req,res)=>{const b=_req.body;const hash=await bcrypt.hash(b.password,12);const {rows}=await pool.query(`INSERT INTO users(username,password_hash,full_name,position,department_id,role,email,phone,initials) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,username,full_name AS "fullName"`,[b.username,hash,b.fullName,b.position,b.departmentId,b.role,b.email,b.phone,b.initials]);res.status(201).json(rows[0])});
