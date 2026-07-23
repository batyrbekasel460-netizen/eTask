import type { Pool, PoolClient } from "pg";

type Queryable=Pick<Pool|PoolClient,"query">;

export async function notifyUser(db:Queryable,userId:string,taskId:string|number,type:string,message:string){
  await db.query("INSERT INTO notifications(user_id,task_id,type,message) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[userId,taskId,type,message]);
}

export async function notifyTaskParticipants(db:Queryable,taskId:string|number,actorId:string,type:string,message:string){
  await db.query(`INSERT INTO notifications(user_id,task_id,type,message)
    SELECT DISTINCT recipient,$1,$3,$4 FROM (
      SELECT assignee_id AS recipient FROM tasks WHERE id=$1
      UNION ALL SELECT creator_id FROM tasks WHERE id=$1
    ) recipients WHERE recipient IS NOT NULL AND recipient<>$2`,[taskId,actorId,type,message]);
}
