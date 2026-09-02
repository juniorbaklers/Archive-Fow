import { Archive, History, Settings2, ShieldCheck } from "lucide-react";

export function TopBar({ onOpenHistory, onOpenSettings }: { onOpenHistory: () => void; onOpenSettings: () => void }) {
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
      <strong>
        <ShieldCheck />
        Traitement local
      </strong>
    </header>
  );
}
