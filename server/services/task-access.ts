import type { Pool, PoolClient } from "pg";
import type { AuthUser } from "../types.js";

type Queryable = Pick<Pool | PoolClient, "query">;

export function taskScope(user: AuthUser, alias = "t") {
  if (user.role === "admin") return { clause: "FALSE", values: [] };
  if (user.role === "expert") return { clause: `${alias}.assignee_id = $1`, values: [user.id] };
  if (user.role === "manager") return { clause: `${alias}.department_id = $1`, values: [user.departmentId] };
  return { clause: "TRUE", values: [] as unknown[] };
}

export async function canAccessTask(db: Queryable, user: AuthUser, taskId: string) {
  const scope = taskScope(user);
  const result = await db.query(`SELECT 1 FROM tasks t WHERE t.id = $${scope.values.length + 1} AND ${scope.clause}`, [...scope.values, taskId]);
  return result.rowCount === 1;
}
