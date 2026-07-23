"use client";

import type { ReactNode } from "react";
import { Add, AnalyticsOutlined, CalendarMonthOutlined, DashboardOutlined, FolderOutlined, GroupsOutlined, Logout, Menu, NotificationsNone, Search, SettingsOutlined, SpaceDashboardOutlined } from "@mui/icons-material";
import { Avatar, Badge, IconButton, Tooltip } from "@mui/material";
import type { User } from "../api";

export type View="dashboard"|"boards"|"projects"|"calendar"|"analytics"|"people"|"structure"|"administration";
export const navigation:{id:View;label:string;icon:ReactNode;roles?:User["role"][]}[]=[
  {id:"dashboard",label:"Обзор",icon:<DashboardOutlined/>,roles:["director","deputy","manager","expert"]},{id:"boards",label:"Мои доски",icon:<SpaceDashboardOutlined/>,roles:["director","deputy","manager","expert"]},
  {id:"projects",label:"Проекты",icon:<FolderOutlined/>,roles:["director","deputy","manager","expert"]},{id:"calendar",label:"Календарь",icon:<CalendarMonthOutlined/>,roles:["director","deputy","manager","expert"]},
  {id:"analytics",label:"Аналитика",icon:<AnalyticsOutlined/>,roles:["director","deputy","manager"]},
  {id:"people",label:"Сотрудники",icon:<GroupsOutlined/>,roles:["director","deputy","manager","expert"]},{id:"structure",label:"Структура",icon:<span className="treeIcon">⌘</span>,roles:["director","deputy","manager","expert"]},
  {id:"administration",label:"Администрирование",icon:<SettingsOutlined/>,roles:["admin"]},
];

export function Header({user,onMenu,onSearch,onCreate,onNotifications,unread=0,workMode=true}:{user:User;onMenu:()=>void;onSearch:(term:string)=>void;onCreate?:()=>void;onNotifications:()=>void;unread?:number;workMode?:boolean}) {
  workMode=workMode&&user.role!=="admin";
  return <header className="topbar"><IconButton className="mobileMenu" onClick={onMenu} aria-label="Открыть меню"><Menu/></IconButton>
    {workMode&&<form className="search" role="search" onSubmit={event=>{event.preventDefault();onSearch(String(new FormData(event.currentTarget).get("q")??""));}}><Search/><input name="q" aria-label="Глобальный поиск" placeholder="Поиск задач, проектов, сотрудников..." minLength={2}/><kbd>↵</kbd></form>}
    <div className="topActions">{workMode&&onCreate&&<button className="quick" onClick={onCreate}><Add/> Создать</button>}{workMode&&<Tooltip title="Уведомления"><IconButton aria-label={`Уведомления: ${unread} непрочитанных`} onClick={onNotifications}><Badge color="error" badgeContent={unread}><NotificationsNone/></Badge></IconButton></Tooltip>}<span className="divider"/><Avatar className="avatar">{user.initials??user.fullName.split(" ").map(x=>x[0]).slice(0,2).join("")}</Avatar><div className="profile"><strong>{user.fullName}</strong><span>{user.position??user.role}</span></div></div>
  </header>;
}

export function Sidebar({view,setView,open,user,onLogout}:{view:View;setView:(view:View)=>void;open:boolean;user:User;onLogout:()=>void}) {
  return <aside className={`sidebar ${open?"open":""}`} aria-label="Основная навигация"><div className="brand"><div className="brandMark"><span>e</span></div><div><b>eTask</b><small>Управление задачами</small></div></div>
    <nav>{navigation.filter(item=>!item.roles||item.roles.includes(user.role)).map(item=><button key={item.id} className={view===item.id?"active":""} aria-current={view===item.id?"page":undefined} onClick={()=>setView(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>
    <div className="sideBottom"><button onClick={()=>setView(user.role==="admin"?"administration":"people")}><SettingsOutlined/><span>Настройки</span></button><button onClick={onLogout}><Logout/><span>Выйти</span></button></div>
  </aside>;
}
