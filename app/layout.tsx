import type {Metadata} from "next";import "./globals.css";
export const metadata:Metadata={title:"ArchiveFlow — Gestionnaire d’archives local",description:"Extrayez et créez des archives ZIP dans votre navigateur, sans transfert de fichiers.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}</body></html>}
