import { Archive, History, Moon, Settings2, ShieldCheck, Sun } from "lucide-react";

export function TopBar({
  onOpenHistory,
  onOpenSettings,
  theme,
  onToggleTheme,
}: {
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <header className="v2bar">
      <a className="v2brand">
        <i>
          <Archive />
        </i>
        <span>
          Archive<b>Flow</b>
          <small>MANAGER</small>
        </span>
      </a>
      <nav>
        <button className="on">Espace de travail</button>
        <button onClick={onOpenHistory}>
          <History />
          Historique
        </button>
        <button onClick={onOpenSettings}>
          <Settings2 />
          Paramètres
        </button>
      </nav>
      <div className="v2barright">
        <button className="themetoggle" onClick={onToggleTheme} title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <strong>
          <ShieldCheck />
          Traitement local
        </strong>
      </div>
    </header>
  );
}
