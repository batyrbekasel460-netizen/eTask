import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { pool } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types.js";
import { canAccessTask } from "../services/task-access.js";
import { HttpError } from "../types.js";
import { logger } from "../logger.js";
import { z } from "zod";

const root=resolve(config.uploadDir); mkdirSync(root,{recursive:true});
const allowedMimeTypes=new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","image/png","image/jpeg","text/plain"]);
const upload=multer({storage:multer.diskStorage({destination:root,filename:(_r,f,cb)=>cb(null,`${crypto.randomUUID()}-${f.originalname.slice(0,180).replace(/[^a-zA-Zа-яА-Я0-9._-]/g,"_")}`)}),limits:{fileSize:50*1024*1024,files:1},fileFilter:(_req,file,callback)=>callback(null,allowedMimeTypes.has(file.mimetype))});
export const filesRouter=Router(); filesRouter.use(authenticate);
const uuid=z.string().uuid();
filesRouter.post("/tasks/:taskId",upload.single("file"),async(req:AuthRequest,res)=>{
  if(!req.file)return res.status(400).json({error:"Файл не выбран"});
  try {
    if (!(await canAccessTask(pool, req.user!, String(req.params.taskId)))) throw new HttpError(404, "Задача не найдена");
    const {rows}=await pool.query(`INSERT INTO attachments(task_id,uploader_id,original_name,stored_name,mime_type,size_bytes)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id,original_name AS "name",mime_type AS "mimeType",size_bytes AS "size"`,[req.params.taskId,req.user!.id,req.file.originalname,req.file.filename,req.file.mimetype,req.file.size]);
    res.status(201).json(rows[0]);
  } catch (error) {
    await unlink(req.file.path).catch(() => undefined);
    throw error;
  }
});
filesRouter.get("/:id",async(req:AuthRequest,res)=>{const parsed=uuid.safeParse(req.params.id);if(!parsed.success)throw new HttpError(404,"Файл не найден");const {rows}=await pool.query(`SELECT a.* FROM attachments a WHERE a.id=$1`,[parsed.data]);const f=rows[0];if(!f||!(await canAccessTask(pool,req.user!,String(f.task_id))))throw new HttpError(404,"Файл не найден");res.download(resolve(root,f.stored_name),f.original_name);});
filesRouter.delete("/:id",async(req:AuthRequest,res)=>{
  const parsed=uuid.safeParse(req.params.id);if(!parsed.success)throw new HttpError(404,"Файл не найден");
  const {rows}=await pool.query("SELECT * FROM attachments WHERE id=$1",[parsed.data]);const file=rows[0];
  if(!file||!(await canAccessTask(pool,req.user!,String(file.task_id))))throw new HttpError(404,"Файл не найден");
  if(req.user!.role==="expert"&&file.uploader_id!==req.user!.id)throw new HttpError(403,"Можно удалить только собственное вложение");
  await pool.query("DELETE FROM attachments WHERE id=$1",[parsed.data]);
  await unlink(resolve(root,file.stored_name)).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")logger.warn({attachmentId:req.params.id,error},"Attachment cleanup failed");});
  res.status(204).end();
});
