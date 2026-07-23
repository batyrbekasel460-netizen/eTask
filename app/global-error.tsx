"use client";

export default function GlobalError({reset}:{error:Error&{digest?:string};reset:()=>void}){
  return <html lang="ru"><body><main className="fatalError" role="alert"><div><h1>eTask временно недоступен</h1><p>Обновите страницу. Если проблема повторяется, сообщите администратору системы.</p><button onClick={reset}>Повторить</button></div></main></body></html>;
}
