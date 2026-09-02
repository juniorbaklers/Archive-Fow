import { History } from "lucide-react";

export type HistoryEntry = {
  id: number;
  date: string;
  action: string;
  count: number;
  format: string;
};

export function HistoryPanel({ history, onClose, onClear }: { history: HistoryEntry[]; onClose: () => void; onClear: () => void }) {
  return (
    <div className="modalback" onClick={onClose}>
      <div className="historypanel" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2>Historique local</h2>
          <button onClick={onClose}>×</button>
        </div>
        <p>Conservé uniquement dans ce navigateur.</p>
        {history.length ? (
          <>
            {history.map((h) => (
              <article key={h.id}>
                <i>
                  <History />
                </i>
                <span>
                  <b>
                    {h.action} — {h.format}
                  </b>
                  <small>{h.count} fichiers</small>
                </span>
              </article>
            ))}
            <button className="clearhistory" onClick={onClear}>
              Effacer l’historique
            </button>
          </>
        ) : (
          <div className="nohistory">Aucune opération pour l’instant.</div>
        )}
      </div>
    </div>
  );
}
