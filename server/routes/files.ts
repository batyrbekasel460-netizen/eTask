import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { pool } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types.js";

const root=resolve(config.uploadDir); mkdirSync(root,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:root,filename:(_r,f,cb)=>cb(null,`${crypto.randomUUID()}-${f.originalname.replace(/[^a-zA-Zа-яА-Я0-9._-]/g,"_")}`)}),limits:{fileSize:50*1024*1024}});
export const filesRouter=Router(); filesRouter.use(authenticate);
filesRouter.post("/tasks/:taskId",upload.single("file"),async(req:AuthRequest,res)=>{
  if(!req.file)return res.status(400).json({error:"Файл не выбран"});
  const access=await pool.query(`SELECT assignee_id,department_id FROM tasks WHERE id=$1`,[req.params.taskId]);
  const task=access.rows[0];
  if(!task || (req.user!.role==="expert"&&task.assignee_id!==req.user!.id)||(req.user!.role==="manager"&&task.department_id!==req.user!.departmentId)) return res.status(403).json({error:"Недостаточно прав"});
  const {rows}=await pool.query(`INSERT INTO attachments(task_id,uploader_id,original_name,stored_name,mime_type,size_bytes)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id,original_name AS "name",mime_type AS "mimeType",size_bytes AS "size"`,[req.params.taskId,req.user!.id,req.file.originalname,req.file.filename,req.file.mimetype,req.file.size]);
  res.status(201).json(rows[0]);
});
filesRouter.get("/:id",async(req:AuthRequest,res)=>{const {rows}=await pool.query(`SELECT a.*,t.assignee_id,t.department_id FROM attachments a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1`,[req.params.id]);const f=rows[0];if(!f)return res.status(404).end();if((req.user!.role==="expert"&&f.assignee_id!==req.user!.id)||(req.user!.role==="manager"&&f.department_id!==req.user!.departmentId))return res.status(403).json({error:"Недостаточно прав"});res.download(resolve(root,f.stored_name),f.original_name);});
