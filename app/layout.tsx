import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({variable:"--font-inter",subsets:["latin","cyrillic"]});
export const metadata: Metadata = {
  title:"Qyzmet — Управление задачами ДРГУиЦ",
  description:"Корпоративная система управления проектами и поручениями Департамента развития государственных услуг и цифровизации АПК.",
  icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"},
  openGraph:{title:"Qyzmet",description:"Управление задачами ДРГУиЦ",type:"website",images:[{url:"/og.png",width:1200,height:630,alt:"Qyzmet — Управление задачами ДРГУиЦ"}]},
  twitter:{card:"summary_large_image",title:"Qyzmet",description:"Управление задачами ДРГУиЦ",images:["/og.png"]}
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body className={inter.variable}>{children}</body></html>}
