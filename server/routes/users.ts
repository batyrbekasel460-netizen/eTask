import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, tx } from "../db.js";
import { allow, authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { HttpError, type AuthRequest } from "../types.js";

const empty = z.object({});
const role = z.enum(["admin", "director", "deputy", "manager", "expert"]);
const userFields = z.object({
  fullName: z.string().trim().min(3).max(200), position: z.string().trim().min(2).max(200),
  departmentId: z.string().uuid().nullable(), role, email: z.string().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(), initials: z.string().trim().min(1).max(4),
}).refine(value => value.role === "admin" || !["manager", "expert"].includes(value.role) || value.departmentId !== null,
  { path:["departmentId"], message:"Для этой роли необходимо выбрать управление" })
 .refine(value => value.role !== "admin" || value.departmentId === null,
  { path:["departmentId"], message:"Системный администратор не относится к управлению" });
const createUserSchema = z.object({ body: userFields.and(z.object({
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/), password: z.string().min(12).max(200),
})), params: empty, query: empty });
const updateUserSchema = z.object({ body: userFields.and(z.object({status:z.enum(["active","vacation","disabled"])})), params:z.object({id:z.string().uuid()}), query:empty });
const passwordSchema = z.object({body:z.object({password:z.string().min(12).max(200)}),params:z.object({id:z.string().uuid()}),query:empty});
const idSchema=z.object({body:z.unknown().optional(),params:z.object({id:z.string().uuid()}),query:empty});

async function audit(req:AuthRequest,action:string,targetId:string,details:Record<string,unknown>={}) {
  await pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,details,ip) VALUES($1,$2,'user',$3,$4,$5)",[req.user!.id,action,targetId,JSON.stringify(details),req.ip]);
}

export const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.get("/", async (req: AuthRequest, res) => {
  const args: unknown[] = []; let where = "";
  if (req.user!.role === "manager") { args.push(req.user!.departmentId); where = "WHERE u.department_id=$1 AND u.role<>'admin'"; }
  else if (req.user!.role === "expert") { args.push(req.user!.id); where = "WHERE u.id=$1"; }
  else if(req.user!.role!=="admin") where="WHERE u.role<>'admin'";
  const { rows } = await pool.query(`SELECT u.id,u.username,u.full_name AS "fullName",u.position,u.role,u.status,u.email,u.phone,u.initials,
    u.department_id AS "departmentId",d.name AS department FROM users u LEFT JOIN departments d ON d.id=u.department_id ${where} ORDER BY u.full_name`, args);
  res.json(rows);
});
usersRouter.post("/", allow("admin"), validate(createUserSchema), async (req:AuthRequest, res) => {
  const body = req.body; const hash = await bcrypt.hash(body.password, 12);
  const { rows } = await pool.query(`INSERT INTO users(username,password_hash,full_name,position,department_id,role,email,phone,initials)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,username,full_name AS "fullName",role,department_id AS "departmentId"`,
    [body.username,hash,body.fullName,body.position,body.departmentId,body.role,body.email,body.phone,body.initials]);
  await audit(req,"user.created",rows[0].id,{role:body.role}); res.status(201).json(rows[0]);
});
usersRouter.patch("/:id",allow("admin"),validate(updateUserSchema),async(req:AuthRequest,res)=>{
  const userId=String(req.params.id);if(userId===req.user!.id&&(req.body.status!=="active"||req.body.role!=="admin"))throw new HttpError(422,"Нельзя изменить роль или заблокировать собственную учётную запись");
  const current=await pool.query("SELECT role,status FROM users WHERE id=$1",[userId]);
  if(current.rows[0]?.role==="admin"&&(req.body.role!=="admin"||req.body.status!=="active")){
    const count=await pool.query("SELECT count(*)::int AS value FROM users WHERE role='admin' AND status='active'");
    if(count.rows[0].value<=1)throw new HttpError(409,"В системе должен оставаться хотя бы один активный администратор");
  }
  const b=req.body; const {rows}=await pool.query(`UPDATE users SET full_name=$1,position=$2,department_id=$3,role=$4,status=$5,email=$6,phone=$7,initials=$8,updated_at=now() WHERE id=$9 RETURNING id,username,full_name AS "fullName",role,status,department_id AS "departmentId"`,[b.fullName,b.position,b.departmentId,b.role,b.status,b.email,b.phone,b.initials,userId]);
  if(!rows[0])throw new HttpError(404,"Пользователь не найден");
  if(b.status!=="active")await pool.query("UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1",[userId]);
  await audit(req,"user.updated",userId,{role:b.role,status:b.status});res.json(rows[0]);
});
usersRouter.post("/:id/reset-password",allow("admin"),validate(passwordSchema),async(req:AuthRequest,res)=>{
  const userId=String(req.params.id);const hash=await bcrypt.hash(req.body.password,12);const {rowCount}=await tx(async client=>{const result=await client.query("UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2",[hash,userId]);await client.query("UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1",[userId]);return result;});
  if(!rowCount)throw new HttpError(404,"Пользователь не найден");await audit(req,"user.password_reset",userId);res.status(204).end();
});
usersRouter.delete("/:id",allow("admin"),validate(idSchema),async(req:AuthRequest,res)=>{
  const userId=String(req.params.id);if(userId===req.user!.id)throw new HttpError(422,"Нельзя удалить собственную учётную запись");
  const {rows}=await pool.query(`DELETE FROM users u WHERE u.id=$1 AND NOT EXISTS(SELECT 1 FROM tasks WHERE creator_id=u.id OR assignee_id=u.id) AND NOT EXISTS(SELECT 1 FROM comments WHERE author_id=u.id) AND NOT EXISTS(SELECT 1 FROM attachments WHERE uploader_id=u.id) RETURNING id`,[userId]);
  if(!rows[0])throw new HttpError(409,"Пользователя с рабочей историей нельзя удалить — заблокируйте его");
  await audit(req,"user.deleted",userId);res.status(204).end();
});
