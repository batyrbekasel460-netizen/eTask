import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { allow, authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, type AuthRequest } from "../types.js";

const empty=z.object({});
const departmentSchema=z.object({body:z.object({name:z.string().trim().min(2).max(200)}),params:empty,query:empty});
const idSchema=z.object({body:z.unknown().optional(),params:z.object({id:z.string().uuid()}),query:empty});
const logSchema=z.object({body:z.unknown().optional(),params:empty,query:z.object({limit:z.coerce.number().int().min(1).max(500).default(100)})});

export const adminRouter=Router();
adminRouter.use(authenticate,allow("admin"));
adminRouter.post("/departments",validate(departmentSchema),async(req:AuthRequest,res)=>{
  const {rows}=await pool.query("INSERT INTO departments(name,sort_order) VALUES($1,(SELECT COALESCE(max(sort_order),0)+1 FROM departments)) RETURNING id,name",[req.body.name]);
  await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,details,ip) VALUES($1,'department.created','department',$2,$3,$4)",[req.user!.id,rows[0].id,JSON.stringify({name:req.body.name}),req.ip]);
  res.status(201).json(rows[0]);
});
adminRouter.delete("/departments/:id",validate(idSchema),async(req:AuthRequest,res)=>{
  const {rows}=await pool.query("DELETE FROM departments d WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM users WHERE department_id=d.id) AND NOT EXISTS(SELECT 1 FROM tasks WHERE department_id=d.id) RETURNING id,name",[req.params.id]);
  if(!rows[0])throw new HttpError(409,"Нельзя удалить управление, пока к нему относятся сотрудники или задачи");
  await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,details,ip) VALUES($1,'department.deleted','department',$2,$3,$4)",[req.user!.id,rows[0].id,JSON.stringify({name:rows[0].name}),req.ip]);res.status(204).end();
});
adminRouter.get("/audit-logs",validate(logSchema),async(req,res)=>{
  const {rows}=await pool.query(`SELECT a.id,a.action,a.target_type AS "targetType",a.target_id AS "targetId",a.details,a.ip,a.created_at AS "createdAt",u.full_name AS actor
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT $1`,[req.query.limit]);res.json(rows);
});
