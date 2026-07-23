"use client";

import { useState } from "react";

export function Login({onLogin}:{onLogin:(username:string,password:string)=>Promise<void>}) {
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  return <div className="loginPage">
    <div className="loginAside">
      <div className="brand light"><div className="brandMark"><span>e</span></div><div><b>eTask</b><small>Управление задачами</small></div></div>
      <div><span className="secure">● Защищенное пространство</span><h1>Цифровая работа.<br/>Понятный результат.</h1><p>Единая система управления проектами и поручениями Департамента развития государственных услуг и цифровизации АПК.</p></div>
      <small>Министерство сельского хозяйства Республики Казахстан · 2026</small>
    </div>
    <div className="loginForm"><form aria-label="Вход в eTask" onSubmit={async event=>{
      event.preventDefault(); setLoading(true); setError("");
      const form=new FormData(event.currentTarget);
      try { await onLogin(String(form.get("username")??""),String(form.get("password")??"")); }
      catch(error){setError(error instanceof Error?error.message:"Ошибка входа");}
      finally{setLoading(false);}
    }}>
      <div className="mobileBrand"><div className="brandMark"><span>e</span></div><b>eTask</b></div>
      <h2>Добро пожаловать</h2><p>Войдите в корпоративное рабочее пространство</p>
      <label htmlFor="username">Логин</label><input id="username" name="username" autoComplete="username" required minLength={3}/>
      <label htmlFor="password">Пароль</label><input id="password" name="password" type="password" autoComplete="current-password" required minLength={8}/>
      {error&&<p className="loginError" role="alert">{error}</p>}
      <button className="loginButton" type="submit" disabled={loading}>{loading?"Выполняется вход...":"Войти в систему"}</button>
      <small>Для доступа используйте корпоративную учетную запись</small>
    </form></div>
  </div>;
}
