"use client";

export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){
  return <main className="fatalError" role="alert"><div><div className="brandMark"><span>e</span></div><h1>Не удалось открыть раздел</h1><p>Данные не потеряны. Повторите запрос или обратитесь к администратору, если ошибка сохраняется.</p><button className="primaryButton" onClick={reset}>Повторить</button></div></main>;
}
