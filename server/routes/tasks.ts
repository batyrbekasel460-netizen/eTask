import { Router } from "express";
import { z } from "zod";
import { pool, tx } from "../db.js";
import { allow, authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { canAccessTask, taskScope } from "../services/task-access.js";
import { HttpError, type AuthRequest } from "../types.js";
import { notifyTaskParticipants, notifyUser } from "../services/notifications.js";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

const id = z.string().regex(/^\d+$/);
const uuid = z.string().uuid();
const status = z.enum(["Новая", "Назначена", "В работе", "На проверке руководителя", "На согласовании заместителя", "На утверждении директора", "Выполнена", "Закрыта"]);
const priority = z.enum(["Критический", "Высокий", "Средний", "Низкий"]);
const empty = z.object({});
const listSchema = z.object({
  body: z.unknown().optional(), params: empty,
  query: z.object({ status: status.optional(), projectId: uuid.optional(), departmentId: uuid.optional(), assigneeId: uuid.optional() }),
});
const createSchema = z.object({ body: z.object({
  title: z.string().trim().min(3).max(300), description: z.string().trim().max(20_000).default(""),
  projectId: uuid, departmentId: uuid, assigneeId: uuid.nullable().optional(), priority,
  deadline: z.string().datetime().nullable().optional(), boardId: uuid.nullable().optional(),
}), params: empty, query: empty });
const updateSchema = z.object({ body: z.object({
  title: z.string().trim().min(3).max(300).optional(), description: z.string().trim().max(20_000).optional(),
  priority: priority.optional(), status: status.optional(), deadline: z.string().datetime().nullable().optional(),
  assigneeId: uuid.nullable().optional(), position: z.number().int().min(0).optional(), version: z.number().int().positive(),
}).refine((body) => Object.keys(body).some((key) => key !== "version"), "Нет изменений"), params: z.object({ id }), query: empty });
const commentSchema = z.object({ body: z.object({ body: z.string().trim().min(1).max(10_000) }), params: z.object({ id }), query: empty });
const commentItemSchema = z.object({ body: z.object({ body: z.string().trim().min(1).max(10_000) }), params: z.object({ id, commentId:id }), query: empty });
const nestedIdSchema=z.object({body:z.unknown().optional(),params:z.object({id,itemId:id}),query:empty});
const checklistCreateSchema=z.object({body:z.object({title:z.string().trim().min(1).max(500)}),params:z.object({id}),query:empty});
const checklistUpdateSchema=z.object({body:z.object({completed:z.boolean()}),params:z.object({id,itemId:id}),query:empty});
const workflowSchema=z.object({body:z.object({action:z.enum(["assign","submit","return","approve","close"]),targetAssigneeId:uuid.nullable().optional(),reason:z.string().trim().min(3).max(2000).optional()}),params:z.object({id}),query:empty});
type WorkflowTarget={id:string;full_name:string;role:"admin"|"director"|"deputy"|"manager"|"expert";department_id:string|null};

export const tasksRouter = Router();
tasksRouter.use(authenticate);
tasksRouter.use((req:AuthRequest,res,next)=>req.user!.role==="admin"?res.status(403).json({error:"Системный администратор не участвует в рабочих процессах"}):next());

tasksRouter.get("/", validate(listSchema), async (req: AuthRequest, res) => {
  const scoped = taskScope(req.user!);
  const where = [scoped.clause];
  const args = [...scoped.values];
  for (const [column, value] of [["status", req.query.status], ["project_id", req.query.projectId], ["department_id", req.query.departmentId], ["assignee_id", req.query.assigneeId]]) {
    if (value) { args.push(String(value)); where.push(`t.${column} = $${args.length}`); }
  }
  const { rows } = await pool.query(`SELECT t.id,t.title,t.description,t.priority,t.status,t.current_stage AS "currentStage",t.return_reason AS "returnReason",t.return_count AS "returnCount",t.stage_started_at AS "stageStartedAt",t.version,t.position,
    t.created_at AS "createdAt",t.deadline,t.project_id AS "projectId",t.department_id AS "departmentId",t.assignee_id AS "assigneeId",
    p.name AS project,d.name AS department,u.full_name AS assignee,u.initials,
    (SELECT count(*)::int FROM comments c WHERE c.task_id=t.id) comments,
    (SELECT count(*)::int FROM attachments a WHERE a.task_id=t.id) files
    FROM tasks t JOIN projects p ON p.id=t.project_id JOIN departments d ON d.id=t.department_id
    LEFT JOIN users u ON u.id=t.assignee_id WHERE ${where.join(" AND ")} ORDER BY t.position,t.created_at DESC`, args);
  res.json(rows);
});

tasksRouter.get("/:id", async (req:AuthRequest,res)=>{
  const taskId=String(req.params.id);
  if(!(await canAccessTask(pool,req.user!,taskId)))throw new HttpError(404,"Задача не найдена");
  const [comments,attachments,history,checklist,subtasks]=await Promise.all([
    pool.query(`SELECT c.id,c.body,c.author_id AS "authorId",c.created_at AS "createdAt",u.full_name AS author,u.initials FROM comments c JOIN users u ON u.id=c.author_id WHERE c.task_id=$1 ORDER BY c.created_at`,[taskId]),
    pool.query(`SELECT id,uploader_id AS "uploaderId",original_name AS name,mime_type AS "mimeType",size_bytes AS size,created_at AS "createdAt" FROM attachments WHERE task_id=$1 ORDER BY created_at`,[taskId]),
    pool.query(`SELECT h.id,h.action,h.changes,h.created_at AS "createdAt",u.full_name AS author FROM task_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.task_id=$1 ORDER BY h.created_at DESC`,[taskId]),
    pool.query(`SELECT id,title,completed,position FROM checklist_items WHERE task_id=$1 ORDER BY position,id`,[taskId]),
    pool.query(`SELECT id,title,status,priority,version FROM tasks WHERE parent_task_id=$1 ORDER BY position,id`,[taskId]),
  ]);
  const task=(await pool.query(`SELECT t.current_stage AS "currentStage",t.return_reason AS "returnReason",t.return_count AS "returnCount",t.stage_started_at AS "stageStartedAt",creator.full_name AS "creator",assignee.full_name AS "assignee" FROM tasks t JOIN users creator ON creator.id=t.creator_id LEFT JOIN users assignee ON assignee.id=t.assignee_id WHERE t.id=$1`,[taskId])).rows[0];
  res.json({task,comments:comments.rows,attachments:attachments.rows,history:history.rows,checklist:checklist.rows,subtasks:subtasks.rows});
});

tasksRouter.post("/:id/checklist",validate(checklistCreateSchema),async(req:AuthRequest,res)=>{
  const taskId=String(req.params.id);if(!(await canAccessTask(pool,req.user!,taskId)))throw new HttpError(404,"Задача не найдена");
  const {rows}=await pool.query(`INSERT INTO checklist_items(task_id,title,position) SELECT $1,$2,COALESCE(max(position)+1,0) FROM checklist_items WHERE task_id=$1 RETURNING *`,[taskId,req.body.title]);
  res.status(201).json(rows[0]);
});
tasksRouter.patch("/:id/checklist/:itemId",validate(checklistUpdateSchema),async(req:AuthRequest,res)=>{
  const taskId=String(req.params.id);if(!(await canAccessTask(pool,req.user!,taskId)))throw new HttpError(404,"Задача не найдена");
  const {rows}=await pool.query(`UPDATE checklist_items SET completed=$1 WHERE id=$2 AND task_id=$3 RETURNING *`,[req.body.completed,req.params.itemId,taskId]);
  if(!rows[0])throw new HttpError(404,"Пункт не найден");res.json(rows[0]);
});
tasksRouter.delete("/:id/checklist/:itemId",validate(nestedIdSchema),async(req:AuthRequest,res)=>{
  const taskId=String(req.params.id);if(!(await canAccessTask(pool,req.user!,taskId)))throw new HttpError(404,"Задача не найдена");
  const {rowCount}=await pool.query("DELETE FROM checklist_items WHERE id=$1 AND task_id=$2",[req.params.itemId,taskId]);
  if(!rowCount)throw new HttpError(404,"Пункт не найден");res.status(204).end();
});

tasksRouter.post("/", allow("director", "deputy", "manager"), validate(createSchema), async (req: AuthRequest, res) => {
  const body = req.body;
  if (req.user!.role === "manager" && body.departmentId !== req.user!.departmentId) throw new HttpError(403, "Можно создавать задачи только в своём управлении");
  if (body.assigneeId) {
    const assignee = await pool.query("SELECT department_id,role FROM users WHERE id=$1 AND status='active'", [body.assigneeId]);
    if (!assignee.rows[0] || (assignee.rows[0].role!=="deputy" && assignee.rows[0].role!=="director" && assignee.rows[0].department_id !== body.departmentId)) throw new HttpError(422, "Исполнитель должен относиться к выбранному управлению");
    const allowed=(req.user!.role==="director"&&(assignee.rows[0].role==="deputy"||assignee.rows[0].role==="manager"))||(req.user!.role==="deputy"&&assignee.rows[0].role==="manager")||(req.user!.role==="manager"&&assignee.rows[0].role==="expert");
    if(!allowed)throw new HttpError(403,"Задача может передаваться только следующему уровню иерархии");
  }
  const { rows } = await pool.query(`INSERT INTO tasks(title,description,project_id,board_id,department_id,assignee_id,creator_id,priority,status,deadline)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Новая',$9) RETURNING *`,
    [body.title, body.description, body.projectId, body.boardId, body.departmentId, body.assigneeId, req.user!.id, body.priority, body.deadline]);
  await notifyTaskParticipants(pool,rows[0].id,req.user!.id,"assigned",`Назначена задача «${body.title}»`);
  res.status(201).json(rows[0]);
});

tasksRouter.post("/:id/workflow", validate(workflowSchema), async (req:AuthRequest,res) => {
  const taskId=String(req.params.id); const {action,targetAssigneeId,reason}=req.body;
  const result=await tx(async client=>{
    const current=(await client.query(`SELECT t.*,actor.role AS actor_role,actor.department_id AS actor_department FROM tasks t JOIN users actor ON actor.id=$2 WHERE t.id=$1 FOR UPDATE`,[taskId,req.user!.id])).rows[0];
    if(!current)throw new HttpError(404,"Задача не найдена");
    if(!(await canAccessTask(client,req.user!,taskId)))throw new HttpError(403,"Недостаточно прав");
    let target:WorkflowTarget|null=null;
    if(targetAssigneeId){target=(await client.query("SELECT id,full_name,role,department_id FROM users WHERE id=$1 AND status='active'",[targetAssigneeId])).rows[0];if(!target)throw new HttpError(422,"Новый исполнитель не найден");}
    const actorRole=req.user!.role;
    const sameDept=(target?.department_id??current.department_id)===current.department_id;
    const stageValid=(action==="assign"&&["Новая","Назначена","В работе"].includes(current.status)) ||
      (action==="submit"&&((actorRole==="expert"&&current.status==="В работе")||(actorRole==="manager"&&current.status==="На проверке руководителя")||(actorRole==="deputy"&&current.status==="На согласовании заместителя"))) ||
      (action==="approve"&&((actorRole==="manager"&&current.status==="На проверке руководителя")||(actorRole==="deputy"&&current.status==="На согласовании заместителя")||(actorRole==="director"&&current.status==="На утверждении директора"))) ||
      (action==="return"&&((actorRole==="manager"&&current.status==="На проверке руководителя")||(actorRole==="deputy"&&current.status==="На согласовании заместителя")||(actorRole==="director"&&current.status==="На утверждении директора"))) ||
      (action==="close"&&["На утверждении директора","Выполнена"].includes(current.status));
    const valid=stageValid&&((action==="close"&&actorRole==="director") ||
      (action==="assign"&&((actorRole==="director"&&(target?.role==="deputy"||(target?.role==="manager"&&sameDept)))||(actorRole==="deputy"&&target?.role==="manager"&&sameDept)||(actorRole==="manager"&&target?.role==="expert"&&sameDept))) ||
      (action==="submit"&&((actorRole==="expert"&&target?.role==="manager"&&sameDept)||(actorRole==="manager"&&target?.role==="deputy")||(actorRole==="deputy"&&target?.role==="director"))) ||
      (action==="approve"&&((actorRole==="manager"&&target?.role==="deputy")||(actorRole==="deputy"&&target?.role==="director")||(actorRole==="director"&&!targetAssigneeId)) ) ||
      (action==="return"&&reason&&((actorRole==="manager"&&target?.role==="expert"&&sameDept)||(actorRole==="deputy"&&target?.role==="director")||(actorRole==="director"&&target?.role==="deputy"))));
    if(!valid)throw new HttpError(403,"Недопустимая передача для текущей роли и этапа");
    const nextStatus=action==="close"?"Закрыта":action==="return"?(target?.role==="expert"?"В работе":target?.role==="deputy"?"На согласовании заместителя":"На утверждении директора"):action==="submit"?(actorRole==="expert"?"На проверке руководителя":actorRole==="manager"?"На согласовании заместителя":"На утверждении директора"):action==="approve"?(actorRole==="director"?"Выполнена":actorRole==="manager"?"На согласовании заместителя":"На утверждении директора"):"Назначена";
    const nextStage=action==="close"?"Закрыто":target?.role==="director"?"Директор":target?.role==="deputy"?"Заместитель директора":target?.role==="manager"?"Руководитель управления":"Эксперт";
    const nextAssignee=action==="close"?current.assignee_id:target?.id??null;
    const updated=(await client.query(`UPDATE tasks SET assignee_id=$1,status=$2,current_stage=$3,return_reason=$4,return_count=return_count+$5,stage_started_at=now(),updated_at=now(),version=version+1 WHERE id=$6 RETURNING *`,[nextAssignee,nextStatus,nextStage,action==="return"?reason:null,action==="return"?1:0,taskId])).rows[0];
    await client.query("INSERT INTO task_history(task_id,user_id,action,changes) VALUES($1,$2,$3,$4)",[taskId,req.user!.id,action==="return"?"returned":"transferred",JSON.stringify({fromAssigneeId:current.assignee_id,toAssigneeId:nextAssignee,status:nextStatus,stage:nextStage,reason:reason??null})]);
    if(targetAssigneeId&&targetAssigneeId!==req.user!.id)await notifyUser(client,targetAssigneeId,taskId,action==="return"?"returned":"assigned",action==="return"?`Задача возвращена вам на доработку: ${reason}`:`Вам передана задача «${current.title}»`);
    if(action==="close"&&current.creator_id&&current.creator_id!==req.user!.id)await notifyUser(client,current.creator_id,taskId,"completed",`Задача «${current.title}» закрыта директором`);
    return updated;
  });
  res.json(result);
});

tasksRouter.patch("/:id", validate(updateSchema), async (req: AuthRequest, res) => {
  const taskId = String(req.params.id);
  const { version, assigneeId, ...changes } = req.body;
  if (assigneeId !== undefined) throw new HttpError(403, "Исполнитель изменяется только через workflow-передачу");
  if (changes.status && req.user!.role !== "expert") throw new HttpError(403, "Передача между этапами выполняется через workflow-действие");
  if (changes.status && req.user!.role === "expert" && changes.status !== "В работе") throw new HttpError(403, "Эксперт отправляет задачу на проверку кнопкой передачи");
  if (req.user!.role === "expert" && Object.keys(changes).some((key) => !["status", "position"].includes(key))) {
    throw new HttpError(403, "Эксперт может изменять только статус своей задачи");
  }
  const result = await tx(async (client) => {
    const current = await client.query("SELECT * FROM tasks WHERE id=$1 FOR UPDATE", [taskId]);
    const task = current.rows[0];
    if (!task) return null;
    if (!(await canAccessTask(client, req.user!, taskId))) throw new HttpError(403, "Недостаточно прав");
    const entries = Object.entries(changes);
    const values = entries.map(([, value]) => value);
    values.push(taskId, version);
    const set = entries.map(([key], index) => `${key}=$${index + 1}`).join(",");
    const updated = await client.query(`UPDATE tasks SET ${set},updated_at=now(),version=version+1 WHERE id=$${values.length - 1} AND version=$${values.length} RETURNING *`, values);
    if (!updated.rows[0]) throw new HttpError(409, "Задача была изменена другим пользователем. Обновите данные");
    await client.query("INSERT INTO task_history(task_id,user_id,action,changes) VALUES($1,$2,'updated',$3)", [taskId, req.user!.id, JSON.stringify(changes)]);
    if(changes.deadline!==undefined&&task.assignee_id&&task.assignee_id!==req.user!.id)await notifyUser(client,task.assignee_id,taskId,"deadline",changes.deadline?`Изменён дедлайн задачи «${task.title}»`:`С задачи «${task.title}» снят дедлайн`);
    return updated.rows[0];
  });
  if (!result) throw new HttpError(404, "Задача не найдена");
  res.json(result);
});

tasksRouter.post("/:id/comments", validate(commentSchema), async (req: AuthRequest, res) => {
  if (!(await canAccessTask(pool, req.user!, String(req.params.id)))) throw new HttpError(404, "Задача не найдена");
  const { rows } = await pool.query("INSERT INTO comments(task_id,author_id,body) VALUES($1,$2,$3) RETURNING id,task_id AS \"taskId\",body,created_at AS \"createdAt\"", [req.params.id, req.user!.id, req.body.body]);
  await notifyTaskParticipants(pool,String(req.params.id),req.user!.id,"comment","Добавлен новый комментарий к задаче");
  res.status(201).json(rows[0]);
});
tasksRouter.patch("/:id/comments/:commentId",validate(commentItemSchema),async(req:AuthRequest,res)=>{
  const taskId=String(req.params.id);if(!(await canAccessTask(pool,req.user!,taskId)))throw new HttpError(404,"Задача не найдена");
  const elevated=req.user!.role!=="expert";
  const {rows}=await pool.query("UPDATE comments SET body=$1 WHERE id=$2 AND task_id=$3 AND (author_id=$4 OR $5::boolean) RETURNING id,body,created_at AS \"createdAt\"",[req.body.body,req.params.commentId,taskId,req.user!.id,elevated]);
  if(!rows[0])throw new HttpError(404,"Комментарий не найден");res.json(rows[0]);
});
tasksRouter.delete("/:id/comments/:commentId",validate(z.object({body:z.unknown().optional(),params:z.object({id,commentId:id}),query:empty})),async(req:AuthRequest,res)=>{
  const taskId=String(req.params.id);if(!(await canAccessTask(pool,req.user!,taskId)))throw new HttpError(404,"Задача не найдена");
  const elevated=req.user!.role!=="expert";
  const {rowCount}=await pool.query("DELETE FROM comments WHERE id=$1 AND task_id=$2 AND (author_id=$3 OR $4::boolean)",[req.params.commentId,taskId,req.user!.id,elevated]);
  if(!rowCount)throw new HttpError(404,"Комментарий не найден");res.status(204).end();
});
tasksRouter.delete("/:id",allow("director","deputy","manager"),validate(z.object({body:z.unknown().optional(),params:z.object({id}),query:empty})),async(req:AuthRequest,res)=>{
  const taskId=String(req.params.id);if(!(await canAccessTask(pool,req.user!,taskId)))throw new HttpError(404,"Задача не найдена");
  const stored=await tx(async client=>{const files=await client.query(`WITH RECURSIVE descendants AS (SELECT id FROM tasks WHERE id=$1 UNION ALL SELECT t.id FROM tasks t JOIN descendants d ON t.parent_task_id=d.id) SELECT stored_name FROM attachments WHERE task_id IN (SELECT id FROM descendants)`,[taskId]);const deleted=await client.query("DELETE FROM tasks WHERE id=$1 RETURNING id",[taskId]);if(!deleted.rows[0])throw new HttpError(404,"Задача не найдена");return files.rows.map(row=>String(row.stored_name));});
  const outcomes=await Promise.allSettled(stored.map(name=>unlink(resolve(config.uploadDir,name))));
  outcomes.forEach((outcome,index)=>{if(outcome.status==="rejected"&&(outcome.reason as NodeJS.ErrnoException)?.code!=="ENOENT")logger.warn({taskId,file:stored[index],error:outcome.reason},"Task attachment cleanup failed");});
  res.status(204).end();
});
