import { History } from "lucide-react";
import { Locale, TranslationKey, translate } from "@/app/i18n";

export type HistoryEntry = {
  id: number;
  date: string;
  action: string;
  count: number;
  format: string;
};

const HISTORY_ACTION_KEYS: Record<string, TranslationKey> = {
  Extraction: "history.action.extract",
  Création: "history.action.create",
  Organisation: "history.action.organize",
};
const actionLabel = (action: string, locale: Locale) => (HISTORY_ACTION_KEYS[action] ? translate(locale, HISTORY_ACTION_KEYS[action]) : action);

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

function exportHistoryCsv(history: HistoryEntry[], locale: Locale) {
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";
  const rows = [
    [translate(locale, "history.csv.date"), translate(locale, "history.csv.action"), translate(locale, "history.csv.format"), translate(locale, "history.csv.files")],
    ...history.map((h) => [new Date(h.date).toLocaleString(dateLocale), actionLabel(h.action, locale), h.format, String(h.count)]),
  ];
  download(rows.map((row) => row.map(csvField).join(",")).join("\r\n"), "archiveflow-historique.csv", "text/csv");
}

function exportHistoryHtml(history: HistoryEntry[], locale: Locale) {
  const dateLocale = locale === "en" ? "en-US" : "fr-FR";
  const rows = history
    .map((h) => `<tr><td>${new Date(h.date).toLocaleString(dateLocale)}</td><td>${actionLabel(h.action, locale)}</td><td>${h.format}</td><td>${h.count}</td></tr>`)
    .join("");
  const title = translate(locale, "history.export.title");
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#1a2638}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #dbe3ed;padding:8px 10px;text-align:left;font-size:13px}th{background:#f4f7fb}</style>
</head><body><h1>${title}</h1><p>${translate(locale, "history.export.subtitle", { date: new Date().toLocaleString(dateLocale), count: history.length })}</p>
<table><thead><tr><th>${translate(locale, "history.csv.date")}</th><th>${translate(locale, "history.csv.action")}</th><th>${translate(locale, "history.csv.format")}</th><th>${translate(locale, "history.csv.files")}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  download(html, "archiveflow-historique.html", "text/html");
}

export function HistoryPanel({
  history,
  onClose,
  onClear,
  locale,
  t,
}: {
  history: HistoryEntry[];
  onClose: () => void;
  onClear: () => void;
  locale: Locale;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div className="modalback" onClick={onClose}>
      <div className="historypanel" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2>{t("history.title")}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <p>{t("history.keptLocally")}</p>
        {history.length ? (
          <>
            {history.map((h) => (
              <article key={h.id}>
                <i>
                  <History />
                </i>
                <span>
                  <b>
                    {actionLabel(h.action, locale)} — {h.format}
                  </b>
                  <small>{t("history.filesCount", { count: h.count })}</small>
                </span>
              </article>
            ))}
            <div className="historyexport">
              <button onClick={() => exportHistoryJson(history)}>JSON</button>
              <button onClick={() => exportHistoryCsv(history, locale)}>CSV</button>
              <button onClick={() => exportHistoryHtml(history, locale)}>HTML</button>
            </div>
            <button className="clearhistory" onClick={onClear}>
              {t("history.clear")}
            </button>
          </>
        ) : (
          <div className="nohistory">{t("history.empty")}</div>
        )}
      </div>
    </div>
  );
}
