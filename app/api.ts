export type Role = "admin" | "director" | "deputy" | "manager" | "expert";
export type Status = "Новая" | "Назначена" | "В работе" | "На проверке руководителя" | "На согласовании заместителя" | "На утверждении директора" | "Выполнена" | "Закрыта";
export type Priority = "Критический" | "Высокий" | "Средний" | "Низкий";
export type User = { id:string; username?:string; fullName:string; position?:string; role:Role; departmentId:string|null; department?:string; status?:string; email?:string; phone?:string; initials?:string };
export type ApiTask = { id:number; title:string; status:Status; priority:Priority; version:number; position:number; projectId:string; departmentId:string; assigneeId:string|null; project:string; assignee:string|null; initials:string|null; deadline:string|null; createdAt:string; comments:number; files:number; description:string; department:string; currentStage:string; returnReason:string|null; returnCount:number; stageStartedAt:string };
export type BoardSummary={id:string;name:string};
export type Project = { id:string; name:string; description:string; color:string; tasks:number; completed:number; boards:BoardSummary[] };
export type DashboardData = { total:number; inProgress:number; overdue:number; completed:number; review:number };
export type AnalyticsData = { departments:Array<{department:string;total:number;completed:number;overdue:number;averageDays:string|null}>; employees:Array<{id:string;fullName:string;active:number;completed:number;overdue:number}> };
export type CalendarTask = Pick<ApiTask,"id"|"title"|"deadline"|"status"|"priority"|"assignee">;
export type SearchResult = {type:"task"|"comment"|"project"|"user";id:string;label:string;context:string};
export type Department = {id:string;name:string};
export type Notification = {id:number;taskId:number|null;type:string;message:string;readAt:string|null;createdAt:string};
export type AuditLog={id:number;action:string;targetType:string;targetId:string|null;details:Record<string,unknown>;ip:string|null;createdAt:string;actor:string|null};
export type TaskDetails={task:{creator:string;assignee:string|null;currentStage:string;returnReason:string|null;returnCount:number;stageStartedAt:string};comments:Array<{id:number;body:string;authorId:string;createdAt:string;author:string;initials:string}>;attachments:Array<{id:string;uploaderId:string;name:string;mimeType:string;size:number;createdAt:string}>;history:Array<{id:number;action:string;changes:Record<string,unknown>;createdAt:string;author:string}>;checklist:Array<{id:number;title:string;completed:boolean;position:number}>;subtasks:Array<{id:number;title:string;status:Status;priority:Priority;version:number}>};

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(message:string, public readonly status:number, public readonly fields?:Array<{path:string;message:string}>) { super(message); }
}

async function request<T>(path:string, options:RequestInit = {}):Promise<T> {
  let response:Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      credentials:"include",
      headers:{ ...(options.body instanceof FormData ? {} : {"Content-Type":"application/json"}), ...options.headers },
    });
  } catch {
    throw new ApiError("Сервер eTask недоступен. Проверьте подключение к локальной сети",0);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error ?? "Ошибка соединения с сервером", response.status, payload.fields);
  return payload as T;
}

const query = (values:Record<string,string|undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key,value]) => { if (value) params.set(key,value); });
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const api = {
  login:(username:string,password:string) => request<{user:User}>("/auth/login",{method:"POST",body:JSON.stringify({username,password})}),
  logout:() => request<void>("/auth/logout",{method:"POST"}),
  me:() => request<User>("/auth/me"),
  tasks:(filters:Record<string,string|undefined>={}) => request<ApiTask[]>(`/tasks${query(filters)}`),
  taskDetails:(id:number) => request<TaskDetails>(`/tasks/${id}`),
  moveTask:(task:ApiTask,status:Status,position=0) => request<ApiTask>(`/tasks/${task.id}`,{method:"PATCH",body:JSON.stringify({status,position,version:task.version})}),
  updateTask:(task:ApiTask,body:Record<string,unknown>) => request<ApiTask>(`/tasks/${task.id}`,{method:"PATCH",body:JSON.stringify({...body,version:task.version})}),
  workflow:(task:ApiTask,body:{action:"assign"|"submit"|"return"|"approve"|"close";targetAssigneeId?:string|null;reason?:string}) => request<ApiTask>(`/tasks/${task.id}/workflow`,{method:"POST",body:JSON.stringify(body)}),
  deleteTask:(id:number) => request<void>(`/tasks/${id}`,{method:"DELETE"}),
  dashboard:() => request<DashboardData>("/dashboard"),
  projects:() => request<Project[]>("/projects"),
  createProject:(body:{name:string;description:string;color:string}) => request<Project>("/projects",{method:"POST",body:JSON.stringify(body)}),
  updateProject:(id:string,body:{name:string;description:string;color:string}) => request<Project>(`/projects/${id}`,{method:"PATCH",body:JSON.stringify(body)}),
  deleteProject:(id:string) => request<void>(`/projects/${id}`,{method:"DELETE"}),
  createBoard:(projectId:string,name:string) => request<BoardSummary>(`/projects/${projectId}/boards`,{method:"POST",body:JSON.stringify({name})}),
  updateBoard:(projectId:string,boardId:string,name:string) => request<BoardSummary>(`/projects/${projectId}/boards/${boardId}`,{method:"PATCH",body:JSON.stringify({name})}),
  deleteBoard:(projectId:string,boardId:string) => request<void>(`/projects/${projectId}/boards/${boardId}`,{method:"DELETE"}),
  departments:() => request<Department[]>("/departments"),
  createTask:(body:{title:string;description:string;projectId:string;departmentId:string;assigneeId:string|null;priority:Priority;deadline:string|null}) => request<ApiTask>("/tasks",{method:"POST",body:JSON.stringify(body)}),
  users:() => request<User[]>("/users"),
  createUser:(body:Record<string,unknown>) => request<User>("/users",{method:"POST",body:JSON.stringify(body)}),
  updateUser:(id:string,body:Record<string,unknown>) => request<User>(`/users/${id}`,{method:"PATCH",body:JSON.stringify(body)}),
  resetPassword:(id:string,password:string) => request<void>(`/users/${id}/reset-password`,{method:"POST",body:JSON.stringify({password})}),
  deleteUser:(id:string) => request<void>(`/users/${id}`,{method:"DELETE"}),
  createDepartment:(name:string) => request<Department>("/admin/departments",{method:"POST",body:JSON.stringify({name})}),
  deleteDepartment:(id:string) => request<void>(`/admin/departments/${id}`,{method:"DELETE"}),
  auditLogs:() => request<AuditLog[]>("/admin/audit-logs"),
  analytics:() => request<AnalyticsData>("/analytics"),
  calendar:(from:string,to:string,assigneeId?:string) => request<CalendarTask[]>(`/calendar${query({from,to,assigneeId})}`),
  search:(term:string) => request<SearchResult[]>(`/search${query({q:term})}`),
  notifications:() => request<Notification[]>("/notifications"),
  readNotification:(id:number) => request<void>(`/notifications/${id}/read`,{method:"PATCH"}),
  comment:(id:number,body:string) => request(`/tasks/${id}/comments`,{method:"POST",body:JSON.stringify({body})}),
  addChecklistItem:(id:number,title:string) => request(`/tasks/${id}/checklist`,{method:"POST",body:JSON.stringify({title})}),
  updateChecklistItem:(taskId:number,itemId:number,completed:boolean) => request(`/tasks/${taskId}/checklist/${itemId}`,{method:"PATCH",body:JSON.stringify({completed})}),
  deleteChecklistItem:(taskId:number,itemId:number) => request<void>(`/tasks/${taskId}/checklist/${itemId}`,{method:"DELETE"}),
  updateComment:(taskId:number,commentId:number,body:string) => request(`/tasks/${taskId}/comments/${commentId}`,{method:"PATCH",body:JSON.stringify({body})}),
  deleteComment:(taskId:number,commentId:number) => request<void>(`/tasks/${taskId}/comments/${commentId}`,{method:"DELETE"}),
  deleteAttachment:(id:string) => request<void>(`/files/${id}`,{method:"DELETE"}),
  upload:(id:number,file:File) => { const body=new FormData(); body.append("file",file); return request(`/files/tasks/${id}`,{method:"POST",body}); },
};
