import { Router } from "express";
import { pool, tx } from "../db.js";
import { allow, authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types.js";

export const tasksRouter = Router();
tasksRouter.use(authenticate);

function scope(req: AuthRequest) {
  if (req.user!.role === "expert") return { sql:" AND t.assignee_id=$1", args:[req.user!.id] };
  if (req.user!.role === "manager") return { sql:" AND t.department_id=$1", args:[req.user!.departmentId] };
  return { sql:"", args:[] };
}

tasksRouter.get("/", async (req: AuthRequest, res) => {
  const s=scope(req); const where:string[]=[]; const args=[...s.args];
  if (req.query.status) { args.push(String(req.query.status)); where.push(`t.status=$${args.length}`); }
  if (req.query.projectId) { args.push(String(req.query.projectId)); where.push(`t.project_id=$${args.length}`); }
  const extra=(s.sql + (where.length ? ` AND ${where.join(" AND ")}` : "")).replace(/^ AND /," WHERE ");
  const { rows } = await pool.query(`SELECT t.id,t.title,t.description,t.priority,t.status,t.created_at AS "createdAt",t.deadline,
    p.name AS project,d.name AS department,u.full_name AS assignee,u.initials,
    (SELECT count(*)::int FROM comments c WHERE c.task_id=t.id) comments,
    (SELECT count(*)::int FROM attachments a WHERE a.task_id=t.id) files
    FROM tasks t JOIN projects p ON p.id=t.project_id JOIN departments d ON d.id=t.department_id
    LEFT JOIN users u ON u.id=t.assignee_id ${extra} ORDER BY t.position,t.created_at DESC`,args);
  res.json(rows);
});

tasksRouter.post("/", allow("director","deputy","manager"), async (req: AuthRequest,res) => {
  const b=req.body; const { rows }=await pool.query(`INSERT INTO tasks(title,description,project_id,department_id,assignee_id,creator_id,priority,status,deadline)
    VALUES($1,$2,$3,$4,$5,$6,$7,'Новые',$8) RETURNING *`,[b.title,b.description,b.projectId,b.departmentId,b.assigneeId,req.user!.id,b.priority,b.deadline]);
  res.status(201).json(rows[0]);
});

tasksRouter.patch("/:id", async (req: AuthRequest,res) => {
  const id=req.params.id; const allowed=["title","description","priority","status","deadline","assignee_id","position"];
  const entries=Object.entries(req.body).filter(([k])=>allowed.includes(k));
  if(!entries.length) return res.status(400).json({error:"Нет изменений"});
  const result=await tx(async client=>{
    const current=await client.query(`SELECT * FROM tasks WHERE id=$1 FOR UPDATE`,[id]);
    if(!current.rows[0]) return null;
    if(req.user!.role==="expert" && current.rows[0].assignee_id!==req.user!.id) throw Object.assign(new Error("forbidden"),{status:403});
    if(req.user!.role==="manager" && current.rows[0].department_id!==req.user!.departmentId) throw Object.assign(new Error("forbidden"),{status:403});
    const values=entries.map(([,v])=>v); values.push(id);
    const set=entries.map(([k],i)=>`${k}=$${i+1}`).join(",");
    const updated=await client.query(`UPDATE tasks SET ${set},updated_at=now(),version=version+1 WHERE id=$${values.length} RETURNING *`,values);
    await client.query(`INSERT INTO task_history(task_id,user_id,action,changes) VALUES($1,$2,'updated',$3)`,[id,req.user!.id,JSON.stringify(req.body)]);
    return updated.rows[0];
  });
  if(!result) return res.status(404).json({error:"Задача не найдена"}); res.json(result);
});

tasksRouter.post("/:id/comments", async (req:AuthRequest,res)=>{
  const {rows}=await pool.query(`INSERT INTO comments(task_id,author_id,body) VALUES($1,$2,$3) RETURNING *`,[req.params.id,req.user!.id,req.body.body]);
  res.status(201).json(rows[0]);
});
