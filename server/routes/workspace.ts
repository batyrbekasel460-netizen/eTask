import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { allow, authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { taskScope } from "../services/task-access.js";
import { HttpError, type AuthRequest } from "../types.js";

const empty = z.object({});
const projectSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(200), description: z.string().trim().max(5000).default(""), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }), params: empty, query: empty });
const boardSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(200) }), params: z.object({ projectId: z.string().uuid() }), query: empty });
const projectUpdateSchema = z.object({body:z.object({name:z.string().trim().min(2).max(200),description:z.string().trim().max(5000),color:z.string().regex(/^#[0-9a-fA-F]{6}$/)}),params:z.object({projectId:z.string().uuid()}),query:empty});
const boardItemSchema=z.object({body:z.object({name:z.string().trim().min(2).max(200)}),params:z.object({projectId:z.string().uuid(),boardId:z.string().uuid()}),query:empty});
const projectIdSchema=z.object({body:z.unknown().optional(),params:z.object({projectId:z.string().uuid()}),query:empty});
const boardIdSchema=z.object({body:z.unknown().optional(),params:z.object({projectId:z.string().uuid(),boardId:z.string().uuid()}),query:empty});
const calendarSchema = z.object({ body: z.unknown().optional(), params: empty, query: z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional(), assigneeId: z.string().uuid().optional() }) });
const searchSchema = z.object({ body: z.unknown().optional(), params: empty, query: z.object({ q: z.string().trim().min(2).max(200) }) });

export const workspaceRouter = Router();
workspaceRouter.use(authenticate);

workspaceRouter.get("/departments", async (_req, res) => {
  const { rows } = await pool.query("SELECT id,name FROM departments ORDER BY sort_order,name");
  res.json(rows);
});

workspaceRouter.get("/notifications", async (req:AuthRequest,res)=>{
  const {rows}=await pool.query(`SELECT id,task_id AS "taskId",type,message,read_at AS "readAt",created_at AS "createdAt"
    FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.user!.id]);
  res.json(rows);
});
workspaceRouter.patch("/notifications/:id/read",async(req:AuthRequest,res)=>{
  const {rows}=await pool.query(`UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id`,[req.params.id,req.user!.id]);
  if(!rows[0])return res.status(404).json({error:"Уведомление не найдено"});
  res.status(204).end();
});

workspaceRouter.get("/projects", async (req: AuthRequest, res) => {
  const scope = taskScope(req.user!);
  const { rows } = await pool.query(`SELECT p.id,p.name,p.description,p.color,count(t.id)::int AS tasks,
    count(t.id) FILTER(WHERE t.status='Выполнено')::int AS completed,
    (SELECT COALESCE(json_agg(json_build_object('id',b.id,'name',b.name) ORDER BY b.created_at),'[]'::json) FROM boards b WHERE b.project_id=p.id) AS boards
    FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND ${scope.clause}
    GROUP BY p.id HAVING count(t.id)>0 OR $${scope.values.length + 1}::boolean ORDER BY p.created_at DESC`, [...scope.values, req.user!.role === "director" || req.user!.role === "deputy"]);
  res.json(rows);
});
workspaceRouter.post("/projects", allow("director", "deputy"), validate(projectSchema), async (req: AuthRequest, res) => {
  const { name, description, color } = req.body;
  const { rows } = await pool.query("INSERT INTO projects(name,description,color,created_by) VALUES($1,$2,$3,$4) RETURNING *", [name, description, color, req.user!.id]);
  res.status(201).json(rows[0]);
});
workspaceRouter.post("/projects/:projectId/boards", allow("director", "deputy"), validate(boardSchema), async (req, res) => {
  const { rows } = await pool.query("INSERT INTO boards(project_id,name) VALUES($1,$2) RETURNING *", [req.params.projectId, req.body.name]);
  res.status(201).json(rows[0]);
});
workspaceRouter.patch("/projects/:projectId",allow("director","deputy"),validate(projectUpdateSchema),async(req,res)=>{
  const {rows}=await pool.query("UPDATE projects SET name=$1,description=$2,color=$3 WHERE id=$4 RETURNING id,name,description,color",[req.body.name,req.body.description,req.body.color,req.params.projectId]);
  if(!rows[0])throw new HttpError(404,"Проект не найден");res.json(rows[0]);
});
workspaceRouter.delete("/projects/:projectId",allow("director","deputy"),validate(projectIdSchema),async(req,res)=>{
  const used=await pool.query("SELECT 1 FROM tasks WHERE project_id=$1 LIMIT 1",[req.params.projectId]);
  if(used.rowCount)throw new HttpError(409,"Сначала удалите задачи проекта");
  const {rowCount}=await pool.query("DELETE FROM projects WHERE id=$1",[req.params.projectId]);if(!rowCount)throw new HttpError(404,"Проект не найден");res.status(204).end();
});
workspaceRouter.patch("/projects/:projectId/boards/:boardId",allow("director","deputy"),validate(boardItemSchema),async(req,res)=>{
  const {rows}=await pool.query("UPDATE boards SET name=$1 WHERE id=$2 AND project_id=$3 RETURNING id,name,project_id AS \"projectId\"",[req.body.name,req.params.boardId,req.params.projectId]);if(!rows[0])throw new HttpError(404,"Доска не найдена");res.json(rows[0]);
});
workspaceRouter.delete("/projects/:projectId/boards/:boardId",allow("director","deputy"),validate(boardIdSchema),async(req,res)=>{
  const {rowCount}=await pool.query("DELETE FROM boards WHERE id=$1 AND project_id=$2",[req.params.boardId,req.params.projectId]);if(!rowCount)throw new HttpError(404,"Доска не найдена");res.status(204).end();
});

workspaceRouter.get("/dashboard", async (req: AuthRequest, res) => {
  const scope = taskScope(req.user!);
  const { rows } = await pool.query(`SELECT count(*)::int total,count(*) FILTER(WHERE status='В работе')::int AS "inProgress",
    count(*) FILTER(WHERE deadline<now() AND status NOT IN('Выполнена','Закрыта'))::int overdue,count(*) FILTER(WHERE status IN('Выполнена','Закрыта'))::int completed,
    count(*) FILTER(WHERE status IN('На проверке руководителя','На согласовании заместителя','На утверждении директора'))::int review FROM tasks t WHERE ${scope.clause}`, scope.values);
  res.json(rows[0]);
});
workspaceRouter.get("/analytics", allow("director", "deputy", "manager"), async (req: AuthRequest, res) => {
  const scope = taskScope(req.user!);
  const [departments, employees] = await Promise.all([
    pool.query(`SELECT d.name AS department,count(t.id)::int total,count(t.id) FILTER(WHERE t.status IN('Выполнена','Закрыта'))::int completed,
      count(t.id) FILTER(WHERE t.deadline<now() AND t.status NOT IN('Выполнена','Закрыта'))::int overdue,
      round(avg(EXTRACT(EPOCH FROM(t.updated_at-t.created_at))/86400) FILTER(WHERE t.status IN('Выполнена','Закрыта'))::numeric,1) AS "averageDays"
      FROM departments d LEFT JOIN tasks t ON t.department_id=d.id AND ${scope.clause} GROUP BY d.id ORDER BY d.sort_order`, scope.values),
    pool.query(`SELECT u.id,u.full_name AS "fullName",count(t.id) FILTER(WHERE t.status NOT IN('Выполнена','Закрыта'))::int active,
      count(t.id) FILTER(WHERE t.status IN('Выполнена','Закрыта'))::int completed,count(t.id) FILTER(WHERE t.deadline<now() AND t.status NOT IN('Выполнена','Закрыта'))::int overdue
      FROM users u LEFT JOIN tasks t ON t.assignee_id=u.id AND ${scope.clause}
      WHERE u.status='active' ${req.user!.role === "manager" ? "AND u.department_id=$1" : ""} GROUP BY u.id ORDER BY completed DESC,active DESC LIMIT 50`, scope.values),
  ]);
  res.json({ departments: departments.rows, employees: employees.rows });
});
workspaceRouter.get("/calendar", validate(calendarSchema), async (req: AuthRequest, res) => {
  const scope = taskScope(req.user!);
  const args = [...scope.values];
  args.push(String(req.query.from ?? new Date().toISOString()), String(req.query.to ?? new Date(Date.now() + 31 * 86_400_000).toISOString()));
  const where = [scope.clause, `t.deadline BETWEEN $${args.length - 1} AND $${args.length}`];
  if (req.query.assigneeId) { args.push(String(req.query.assigneeId)); where.push(`t.assignee_id=$${args.length}`); }
  const { rows } = await pool.query(`SELECT t.id,t.title,t.deadline,t.status,t.priority,u.full_name AS assignee FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE ${where.join(" AND ")} ORDER BY t.deadline`, args);
  res.json(rows);
});
workspaceRouter.get("/search", validate(searchSchema), async (req: AuthRequest, res) => {
  const scope = taskScope(req.user!);
  const args = [...scope.values, `%${req.query.q}%`];
  const queryIndex = args.length;
  const elevated = req.user!.role === "director" || req.user!.role === "deputy";
  const manager = req.user!.role === "manager";
  const { rows } = await pool.query(`
    SELECT 'task' AS type,t.id::text,t.title AS label,t.description AS context FROM tasks t
      WHERE ${scope.clause} AND (t.title ILIKE $${queryIndex} OR t.description ILIKE $${queryIndex})
    UNION ALL
    SELECT 'comment',c.id::text,left(c.body,120),t.title FROM comments c JOIN tasks t ON t.id=c.task_id
      WHERE ${scope.clause} AND c.body ILIKE $${queryIndex}
    UNION ALL
    SELECT 'project',p.id::text,p.name,p.description FROM projects p
      WHERE ($${queryIndex + 1}::boolean OR EXISTS(SELECT 1 FROM tasks t WHERE t.project_id=p.id AND ${scope.clause}))
        AND (p.name ILIKE $${queryIndex} OR p.description ILIKE $${queryIndex})
    UNION ALL
    SELECT 'user',u.id::text,u.full_name,u.position FROM users u
      WHERE ($${queryIndex + 1}::boolean OR ($${queryIndex + 2}::boolean AND u.department_id=$${queryIndex + 3}) OR u.id=$${queryIndex + 4})
        AND (u.full_name ILIKE $${queryIndex} OR u.position ILIKE $${queryIndex}) LIMIT 30`,
    [...args, elevated, manager, req.user!.departmentId, req.user!.id]);
  res.json(rows);
});
