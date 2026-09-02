import { CheckCircle2, File, FolderOpen } from "lucide-react";
import { formatBytes } from "@/app/archive-utils";
import { SmartEntry } from "@/app/smart-engine";

const COLLISION_LABEL: Record<string, string> = {
  "same-name-same-content": "Même nom et contenu",
  "same-name-different-content": "Même nom, contenu différent",
  "same-content-different-name": "Contenu identique",
};

export function EntryRow({ e, excluded, toggle }: { e: SmartEntry; excluded: boolean; toggle: () => void }) {
  return (
    <div
      className={`v2row ${e.collision ? "duplicate" : ""} ${excluded ? "excluded" : ""}`}
      title={e.explanation}
    >
      <input type="checkbox" checked={!excluded} onChange={toggle} aria-label={`Inclure ${(e.planned || e.name).split("/").pop()}`} />
      <i>{e.directory ? <FolderOpen /> : <File />}</i>
      <div>
        <b>{(e.planned || e.name).split("/").pop()}</b>
        <small>
          {e.category} • {formatBytes(e.size)} • {e.source}
        </small>
        <small className="why">{e.explanation}</small>
        {e.family && (
          <small className={e.familyIncomplete ? "familywarn" : "familyok"}>
            {e.family} —{" "}
            {e.familyIncomplete ? "groupe incomplet" : "groupe complet"}
          </small>
        )}
      </div>
      {e.collision ? (
        <span className="dup">{COLLISION_LABEL[e.collision]}</span>
      ) : e.pathUnsafe ? (
        <span className="integritybadge unsafe">Chemin long : destination courte</span>
      ) : e.integrityProtected && e.pathAdjusted ? (
        <span className="pathfixed" title={`Avant : ${e.originalPlanned}`}>Dossiers raccourcis (SIG)</span>
      ) : e.integrityProtected ? (
        <span className="integritybadge">Liens SIG protégés</span>
      ) : e.pathAdjusted ? (
        <span className="pathfixed" title={`Avant : ${e.originalPlanned}`}>Chemin Windows corrigé</span>
      ) : e.contentMatch ? (
        <span className="shared">Identique dans une autre archive</span>
      ) : (
        <CheckCircle2 />
      )}
    </div>
  );
}
