import { Archive, ArchiveRestore, FolderOpen, History, ShieldCheck, Sparkles } from "lucide-react";
import { HistoryEntry } from "./HistoryPanel";

export function HomeScreen({
  history,
  profiles,
  onStart,
  onSelectProfile,
}: {
  history: HistoryEntry[];
  profiles: { id: string; name: string; description: string }[];
  onStart: (mode: "extract" | "create") => void;
  onSelectProfile: (id: string) => void;
}) {
  const recent = history.slice(0, 5);
  return (
    <section className="homescreen">
      <div className="homehero">
        <em>
          <Sparkles />
          GESTIONNAIRE D’ARCHIVES LOCAL
        </em>
        <h1>Que voulez-vous faire ?</h1>
        <p>Extrayez et organisez une archive existante, ou créez-en une nouvelle. Tout se passe dans votre navigateur, sans transfert de fichiers.</p>
      </div>
      <div className="homeactions">
        <button className="homeaction" onClick={() => onStart("extract")}>
          <i>
            <FolderOpen />
          </i>
          <div>
            <b>Extraire &amp; organiser</b>
            <small>Ouvrez une ou plusieurs archives, classez et renommez leur contenu, puis enregistrez-le.</small>
          </div>
        </button>
        <button className="homeaction" onClick={() => onStart("create")}>
          <i>
            <Archive />
          </i>
          <div>
            <b>Créer une archive</b>
            <small>Rassemblez des fichiers et des dossiers dans une nouvelle archive ZIP, TAR ou GZIP.</small>
          </div>
        </button>
      </div>
      <div className="homegrid">
        <div className="homepanel">
          <h2>
            <History />
            Opérations récentes
          </h2>
          {recent.length ? (
            <ul>
              {recent.map((h) => (
                <li key={h.id}>
                  <b>
                    {h.action} — {h.format}
                  </b>
                  <small>
                    {h.count} fichiers · {new Date(h.date).toLocaleString("fr-FR")}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="homeempty">Aucune opération pour l’instant.</p>
          )}
        </div>
        <div className="homepanel">
          <h2>
            <ArchiveRestore />
            Profils métiers enregistrés
          </h2>
          <ul className="homeprofiles">
            {profiles.map((p) => (
              <li key={p.id}>
                <button onClick={() => onSelectProfile(p.id)}>
                  <b>{p.name}</b>
                  <small>{p.description}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="homefooter">
        <ShieldCheck />
        Traitement 100&nbsp;% local : vos fichiers ne quittent jamais votre appareil.
      </p>
    </section>
  );
}
