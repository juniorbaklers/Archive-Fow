import { CheckCircle2, Info, ShieldCheck, XCircle } from "lucide-react";
import { TranslationKey } from "@/app/i18n";

type FormatSupport = {
  format: string;
  extensions: string;
  read: "complete" | "partial" | "unavailable";
  create: "complete" | "partial" | "unavailable";
  encryptedKey: TranslationKey;
  noteKey: TranslationKey;
};

const FORMAT_MATRIX: FormatSupport[] = [
  { format: "ZIP", extensions: ".zip", read: "complete", create: "complete", encryptedKey: "formatModal.encryptedNo", noteKey: "formatModal.note.zip" },
  { format: "TAR", extensions: ".tar", read: "complete", create: "complete", encryptedKey: "formatModal.encryptedNo", noteKey: "formatModal.note.tar" },
  { format: "TAR.GZ", extensions: ".tar.gz, .tgz", read: "complete", create: "complete", encryptedKey: "formatModal.encryptedNo", noteKey: "formatModal.note.tarGz" },
  { format: "GZIP", extensions: ".gz, .gzip", read: "complete", create: "partial", encryptedKey: "formatModal.encryptedNo", noteKey: "formatModal.note.gzip" },
  { format: "7Z", extensions: ".7z", read: "complete", create: "unavailable", encryptedKey: "formatModal.encryptedDepends", noteKey: "formatModal.note.sevenZip" },
  { format: "RAR", extensions: ".rar", read: "complete", create: "unavailable", encryptedKey: "formatModal.encryptedDepends", noteKey: "formatModal.note.rar" },
];

const SUPPORT_KEY: Record<FormatSupport["read"], TranslationKey> = {
  complete: "formatModal.complete",
  partial: "formatModal.partial",
  unavailable: "formatModal.unavailable",
};

function Support({ value, t }: { value: FormatSupport["read"]; t: (key: TranslationKey) => string }) {
  return <span className={`support support-${value === "complete" ? "complet" : value === "partial" ? "partiel" : "non"}`}>{value === "unavailable" ? <XCircle /> : <CheckCircle2 />}{t(SUPPORT_KEY[value])}</span>;
}

export function FormatMatrixModal({ onClose, t }: { onClose: () => void; t: (key: TranslationKey, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="modalback formatmodalback" onClick={onClose}>
      <div className="formatpanel" onClick={(e) => e.stopPropagation()}>
        <header>
          <div><h2>{t("formatModal.title")}</h2><p>{t("formatModal.subtitle")}</p></div>
          <button onClick={onClose}>×</button>
        </header>
        <div className="formatlegend"><span><i className="support-complet" />{t("formatModal.complete")}</span><span><i className="support-partiel" />{t("formatModal.partial")}</span><span><i className="support-non" />{t("formatModal.unavailable")}</span></div>
        <div className="formattablewrap">
          <table className="formattable">
            <thead><tr><th>{t("formatModal.colFormat")}</th><th>{t("formatModal.colExtensions")}</th><th>{t("formatModal.colExtract")}</th><th>{t("formatModal.colCreate")}</th><th>{t("formatModal.colEncrypted")}</th><th>{t("formatModal.colLimitation")}</th></tr></thead>
            <tbody>{FORMAT_MATRIX.map((item) => <tr key={item.format}><td><b>{item.format}</b></td><td><code>{item.extensions}</code></td><td><Support value={item.read} t={t} /></td><td><Support value={item.create} t={t} /></td><td>{t(item.encryptedKey)}</td><td>{t(item.noteKey)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="browserlimits"><Info /><div><b>{t("formatModal.webLimitsTitle")}</b><p>{t("formatModal.webLimitsText")}</p></div></div>
        <footer><span><ShieldCheck />{t("formatModal.allFree")}</span><button onClick={onClose}>{t("formatModal.gotIt")}</button></footer>
      </div>
    </div>
  );
}
