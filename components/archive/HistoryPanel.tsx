import { History } from "lucide-react";

export type HistoryEntry = {
  id: number;
  date: string;
  action: string;
  count: number;
  format: string;
};

function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvField(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportHistoryJson(history: HistoryEntry[]) {
  download(JSON.stringify(history, null, 2), "archiveflow-historique.json", "application/json");
}

function exportHistoryCsv(history: HistoryEntry[]) {
  const rows = [
    ["Date", "Action", "Format", "Fichiers"],
    ...history.map((h) => [new Date(h.date).toLocaleString("fr-FR"), h.action, h.format, String(h.count)]),
  ];
  download(rows.map((row) => row.map(csvField).join(",")).join("\r\n"), "archiveflow-historique.csv", "text/csv");
}

function exportHistoryHtml(history: HistoryEntry[]) {
  const rows = history
    .map((h) => `<tr><td>${new Date(h.date).toLocaleString("fr-FR")}</td><td>${h.action}</td><td>${h.format}</td><td>${h.count}</td></tr>`)
    .join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Historique ArchiveFlow</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#1a2638}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #dbe3ed;padding:8px 10px;text-align:left;font-size:13px}th{background:#f4f7fb}</style>
</head><body><h1>Historique ArchiveFlow</h1><p>Exporté le ${new Date().toLocaleString("fr-FR")} — ${history.length} opération(s).</p>
<table><thead><tr><th>Date</th><th>Action</th><th>Format</th><th>Fichiers</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  download(html, "archiveflow-historique.html", "text/html");
}

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
            <div className="historyexport">
              <button onClick={() => exportHistoryJson(history)}>JSON</button>
              <button onClick={() => exportHistoryCsv(history)}>CSV</button>
              <button onClick={() => exportHistoryHtml(history)}>HTML</button>
            </div>
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
