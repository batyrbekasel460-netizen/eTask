"use client";

import { useMemo, useState } from "react";
import { Add, MoreHoriz, Search, Tune } from "@mui/icons-material";
import { Avatar, LinearProgress } from "@mui/material";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { ApiTask, Priority, Status } from "../api";

export const statuses:Status[]=["Новая","Назначена","В работе","На проверке руководителя","На согласовании заместителя","На утверждении директора","Выполнена","Закрыта"];
const priorityClass:Record<Priority,string>={"Критический":"critical","Высокий":"high","Средний":"medium","Низкий":"low"};

function TaskCard({task,onOpen,onMove}:{task:ApiTask;onOpen:(task:ApiTask)=>void;onMove:(task:ApiTask,status:Status)=>void}) {
  const [{isDragging},drag]=useDrag(()=>({type:"TASK",item:{task},collect:monitor=>({isDragging:monitor.isDragging()})}),[task]);
  const due=task.deadline?new Date(task.deadline).toLocaleDateString("ru-RU"):"Без срока";
  return <article ref={drag as never} tabIndex={0} role="button" aria-label={`${task.title}. ${task.status}. Alt и стрелки для перемещения`} className="taskCard" style={{opacity:isDragging?.45:1}}
    onClick={()=>onOpen(task)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onOpen(task);}const index=statuses.indexOf(task.status);if(event.altKey&&event.key==="ArrowRight"&&index<statuses.length-1)onMove(task,statuses[index+1]);if(event.altKey&&event.key==="ArrowLeft"&&index>0)onMove(task,statuses[index-1]);}}>
    <div className="taskTop"><span className={`priority ${priorityClass[task.priority]}`}>{task.priority}</span><MoreHoriz fontSize="small" aria-hidden="true"/></div>
    <h4>{task.title}</h4><span className="projectTag"><i/>{task.project}</span>
    {(task.status==="Выполнена"||task.status==="Закрыта")&&<div className="progressRow"><LinearProgress variant="determinate" value={100}/><small>100%</small></div>}
    <div className="taskMeta"><span className={task.deadline&&new Date(task.deadline)<new Date()&&task.status!=="Выполнена"&&task.status!=="Закрыта"?"due urgent":"due"}>◷ {due}</span><span className="counts">◌ {task.comments} &nbsp;▱ {task.files}</span><Avatar className="miniAvatar">{task.initials??"—"}</Avatar></div>
  </article>;
}

function Column({status,tasks,onMove,onOpen}:{status:Status;tasks:ApiTask[];onMove:(task:ApiTask,status:Status)=>void;onOpen:(task:ApiTask)=>void}) {
  const [{over},drop]=useDrop(()=>({accept:"TASK",drop:(item:{task:ApiTask})=>onMove(item.task,status),collect:monitor=>({over:monitor.isOver()})}),[status,onMove]);
  return <section ref={drop as never} className={`kanbanColumn ${over?"over":""}`} aria-label={status}><header><span className={`statusDot s${statuses.indexOf(status)}`}/><strong>{status}</strong><b>{tasks.length}</b></header><div className="columnBody">{tasks.map(task=><TaskCard key={task.id} task={task} onOpen={onOpen} onMove={onMove}/>)}</div></section>;
}

export function Board({tasks,onMove,onOpen,onCreate,error}:{tasks:ApiTask[];onMove:(task:ApiTask,status:Status)=>void;onOpen:(task:ApiTask)=>void;onCreate?:()=>void;error?:string}) {
  const [query,setQuery]=useState(""); const [priority,setPriority]=useState(""); const [assignee,setAssignee]=useState(""); const [project,setProject]=useState(""); const [department,setDepartment]=useState(""); const [deadline,setDeadline]=useState("");
  const assignees=useMemo(()=>Array.from(new Set(tasks.map(task=>task.assignee).filter(Boolean))) as string[],[tasks]);
  const projects=useMemo(()=>Array.from(new Set(tasks.map(task=>task.project))).sort(),[tasks]);
  const departments=useMemo(()=>Array.from(new Set(tasks.map(task=>task.department))).sort(),[tasks]);
  const visible=useMemo(()=>tasks.filter(task=>{
    const due=task.deadline?new Date(task.deadline):null; const now=new Date(); const week=new Date(now.getTime()+7*86_400_000);
    return (!query||`${task.title} ${task.description} ${task.project} ${task.assignee??""}`.toLowerCase().includes(query.toLowerCase()))&&(!priority||task.priority===priority)&&(!assignee||task.assignee===assignee)&&(!project||task.project===project)&&(!department||task.department===department)&&(!deadline||(deadline==="overdue"&&due&&due<now&&task.status!=="Выполнена"&&task.status!=="Закрыта")||(deadline==="week"&&due&&due>=now&&due<=week)||(deadline==="none"&&!due));
  }),[tasks,query,priority,assignee,project,department,deadline]);
  return <><div className="boardHero"><div><div className="breadcrumb">Рабочее пространство / Задачи</div><h1>Доска задач</h1><p>Контроль исполнения поручений и проектных работ</p></div>{onCreate&&<button className="primaryButton" onClick={onCreate}><Add/> Задача</button>}</div>
    <div className="boardTools"><label><Tune aria-hidden="true"/> <span className="srOnly">Приоритет</span><select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">Все приоритеты</option>{Object.keys(priorityClass).map(value=><option key={value}>{value}</option>)}</select></label><label><span className="srOnly">Проект</span><select value={project} onChange={e=>setProject(e.target.value)}><option value="">Все проекты</option>{projects.map(value=><option key={value}>{value}</option>)}</select></label><label><span className="srOnly">Управление</span><select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">Все управления</option>{departments.map(value=><option key={value}>{value}</option>)}</select></label><label><span className="srOnly">Исполнитель</span><select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Все исполнители</option>{assignees.map(value=><option key={value}>{value}</option>)}</select></label><label><span className="srOnly">Срок</span><select value={deadline} onChange={e=>setDeadline(e.target.value)}><option value="">Все сроки</option><option value="overdue">Просроченные</option><option value="week">Ближайшие 7 дней</option><option value="none">Без срока</option></select></label><span/><label><Search aria-hidden="true"/><input aria-label="Поиск по доске" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск"/></label></div>
    {error&&<p className="loginError" role="alert">{error}</p>}
    <DndProvider backend={HTML5Backend}><div className="kanban">{statuses.map(status=><Column key={status} status={status} tasks={visible.filter(task=>task.status===status)} onMove={onMove} onOpen={onOpen}/>)}</div></DndProvider>
  </>;
}
