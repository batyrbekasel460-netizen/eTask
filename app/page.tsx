"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, type AnalyticsData, type ApiTask, type AuditLog, type CalendarTask, type DashboardData, type Department, type Notification, type Project, type SearchResult, type Status, type User } from "./api";
import { AdminView } from "./components/AdminView";
import { Board } from "./components/Board";
import { CreateDialog, NotificationsDialog, SearchDialog, TaskDialog } from "./components/Dialogs";
import { Login } from "./components/Login";
import { Header, navigation, Sidebar, type View } from "./components/Shell";
import { CalendarView, Dashboard, Loading, People, Projects, Structure } from "./components/Views";

type CreateKind="task"|"project"|"user";
const viewIds=new Set(navigation.map(item=>item.id));
const Analytics=lazy(()=>import("./components/AnalyticsView"));
const viewFromHash=():View=>typeof window!=="undefined"&&viewIds.has(window.location.hash.slice(1) as View)?window.location.hash.slice(1) as View:"dashboard";

export default function Home(){
  const [auth,setAuth]=useState<"loading"|"anonymous"|"authenticated"|"failure">("loading");
  const [user,setUser]=useState<User|null>(null); const [view,setView]=useState<View>(viewFromHash); const [side,setSide]=useState(false);
  const [tasks,setTasks]=useState<ApiTask[]>([]); const [projects,setProjects]=useState<Project[]>([]); const [users,setUsers]=useState<User[]>([]); const [departments,setDepartments]=useState<Department[]>([]);
  const [dashboard,setDashboard]=useState<DashboardData|null>(null); const [analytics,setAnalytics]=useState<AnalyticsData|null>(null); const [calendar,setCalendar]=useState<CalendarTask[]>([]);
  const [selected,setSelected]=useState<ApiTask|null>(null); const [create,setCreate]=useState<CreateKind|null>(null); const [search,setSearch]=useState<SearchResult[]|null>(null); const [error,setError]=useState("");
  const [notifications,setNotifications]=useState<Notification[]>([]); const [notificationOpen,setNotificationOpen]=useState(false);
  const [auditLogs,setAuditLogs]=useState<AuditLog[]>([]);

  const loadWorkspace=useCallback(async(currentUser:User)=>{
    setError("");
    if(currentUser.role==="admin"){
      const [userRows,departmentRows,logs]=await Promise.all([api.users(),api.departments(),api.auditLogs()]);
      setUsers(userRows);setDepartments(departmentRows);setAuditLogs(logs);setView("administration");window.location.hash="administration";return;
    }
    const [taskRows,projectRows,userRows,departmentRows,dashboardData,notificationRows]=await Promise.all([api.tasks(),api.projects(),api.users(),api.departments(),api.dashboard(),api.notifications()]);
    setTasks(taskRows);setProjects(projectRows);setUsers(userRows);setDepartments(departmentRows);setDashboard(dashboardData);setNotifications(notificationRows);
    if(currentUser.role!=="expert")setAnalytics(await api.analytics());
    const now=new Date();const end=new Date(now.getTime()+31*86_400_000);setCalendar(await api.calendar(now.toISOString(),end.toISOString()));
  },[]);

  useEffect(()=>{let active=true;api.me().then(async current=>{if(!active)return;setUser(current);setAuth("authenticated");try{await loadWorkspace(current);}catch(problem){if(active)setError(problem instanceof Error?problem.message:"Не удалось загрузить рабочее пространство");}}).catch(problem=>{if(active)setAuth(problem instanceof ApiError&&problem.status===401?"anonymous":"failure");});return()=>{active=false;};},[loadWorkspace]);
  useEffect(()=>{const sync=()=>setView(viewFromHash());window.addEventListener("hashchange",sync);return()=>window.removeEventListener("hashchange",sync);},[]);
  const navigate=(next:View)=>{window.location.hash=next;setView(next);setSide(false);};
  const login=async(username:string,password:string)=>{const result=await api.login(username,password);setUser(result.user);setAuth("authenticated");try{await loadWorkspace(result.user);}catch(problem){setError(problem instanceof Error?problem.message:"Не удалось загрузить рабочее пространство");}};
  const logout=async()=>{try{await api.logout();}finally{setAuth("anonymous");setUser(null);setTasks([]);}};
  const move=async(task:ApiTask,status:Status)=>{if(task.status===status)return;setError("");setTasks(current=>current.map(item=>item.id===task.id?{...item,status}:item));try{const updated=await api.moveTask(task,status);setTasks(current=>current.map(item=>item.id===task.id?{...item,...updated}:item));}catch(problem){setError(problem instanceof ApiError&&problem.status===409?problem.message:"Не удалось переместить задачу");const fresh=await api.tasks().catch(()=>null);if(fresh)setTasks(fresh);}};
  const refresh=async()=>{if(user)await loadWorkspace(user);};
  const filterCalendar=async(assigneeId?:string)=>{const now=new Date(),end=new Date(now.getTime()+31*86_400_000);setCalendar(await api.calendar(now.toISOString(),end.toISOString(),assigneeId));};
  const title=useMemo(()=>navigation.find(item=>item.id===view)?.label??"eTask",[view]);

  if(auth==="loading")return <div className="loginPage"><div className="emptyState" role="status">Проверка сессии…</div></div>;
  if(auth==="failure")return <main className="fatalError" role="alert"><div><div className="brandMark"><span>e</span></div><h1>Сервер eTask недоступен</h1><p>Проверьте подключение к локальной сети или обратитесь к администратору.</p><button className="primaryButton" onClick={()=>window.location.reload()}>Повторить</button></div></main>;
  if(auth==="anonymous"||!user)return <Login onLogin={login}/>;
  const canCreateTask=["director","deputy","manager"].includes(user.role); const canCreateProject=user.role==="director"||user.role==="deputy";
  return <div className="app"><Sidebar view={view} setView={navigate} open={side} user={user} onLogout={logout}/><div className="workspace"><Header user={user} onMenu={()=>setSide(current=>!current)} onCreate={canCreateTask?()=>setCreate("task"):undefined} unread={notifications.filter(item=>!item.readAt).length} onNotifications={()=>setNotificationOpen(true)} onSearch={async term=>{if(term.trim().length<2){setSearch([]);return;}try{setSearch(await api.search(term));}catch(problem){setError(problem instanceof Error?problem.message:"Ошибка поиска");}}}/><main className={`content view-${view}`} aria-label={title}>
    {error&&view!=="boards"&&<p className="loginError" role="alert">{error}</p>}
    {view==="dashboard"&&<Dashboard data={dashboard} tasks={tasks} goBoard={()=>navigate("boards")}/>}
    {view==="boards"&&<Board tasks={tasks} onMove={move} onOpen={setSelected} onCreate={canCreateTask?()=>setCreate("task"):undefined} error={error}/>}
    {view==="projects"&&<Projects projects={projects} editable={canCreateProject} onCreate={canCreateProject?()=>setCreate("project"):undefined} onChanged={refresh}/>} 
    {view==="calendar"&&<CalendarView events={calendar} users={users} onFilter={filterCalendar}/>}
    {view==="analytics"&&<Suspense fallback={<Loading/>}><Analytics data={analytics}/></Suspense>}
    {view==="people"&&<People users={users} canCreate={false} onCreate={()=>setCreate("user")}/>}
    {view==="structure"&&<Structure users={users}/>}
    {view==="administration"&&<AdminView
      users={users} departments={departments} logs={auditLogs} onCreate={()=>setCreate("user")}
      onSave={async target=>{try{await api.updateUser(target.id,{fullName:target.fullName,position:target.position,departmentId:target.departmentId,role:target.role,status:target.status??"active",email:target.email??null,phone:target.phone??null,initials:target.initials??target.fullName.slice(0,2)});await refresh();}catch(problem){setError(problem instanceof Error?problem.message:"Не удалось сохранить пользователя");}}}
      onReset={async(id,password)=>{try{await api.resetPassword(id,password);await refresh();}catch(problem){setError(problem instanceof Error?problem.message:"Не удалось сбросить пароль");}}}
      onDelete={async id=>{try{await api.deleteUser(id);await refresh();}catch(problem){setError(problem instanceof Error?problem.message:"Не удалось удалить пользователя");}}}
      onCreateDepartment={async name=>{try{await api.createDepartment(name);await refresh();}catch(problem){setError(problem instanceof Error?problem.message:"Не удалось создать управление");}}}
      onDeleteDepartment={async id=>{try{await api.deleteDepartment(id);await refresh();}catch(problem){setError(problem instanceof Error?problem.message:"Не удалось удалить управление");}}}
    />}
  </main></div><TaskDialog task={selected} currentUser={user} users={users} onClose={()=>setSelected(null)} onChanged={refresh} onDeleted={refresh}/><CreateDialog kind={create??"task"} open={create!==null} onClose={()=>setCreate(null)} projects={projects} users={users} departments={user.role==="manager"?departments.filter(item=>item.id===user.departmentId):departments} onCreated={refresh}/><SearchDialog open={search!==null} onClose={()=>setSearch(null)} results={search??[]}/><NotificationsDialog open={notificationOpen} onClose={()=>setNotificationOpen(false)} items={notifications} onRead={async item=>{if(!item.readAt){await api.readNotification(item.id);setNotifications(current=>current.map(value=>value.id===item.id?{...value,readAt:new Date().toISOString()}:value));}if(item.taskId){const task=tasks.find(value=>value.id===item.taskId);if(task)setSelected(task);}}}/></div>;
}
