import { CheckCircle2, Info, ShieldCheck, XCircle } from "lucide-react";

type FormatSupport = {
  format: string;
  extensions: string;
  read: "Complet" | "Partiel" | "Non";
  create: "Complet" | "Partiel" | "Non";
  encrypted: "Oui" | "Non" | "Selon archive";
  note: string;
};

const FORMAT_MATRIX: FormatSupport[] = [
  { format: "ZIP", extensions: ".zip", read: "Complet", create: "Complet", encrypted: "Non", note: "Extraction, arborescence, dossiers vides et création disponibles." },
  { format: "TAR", extensions: ".tar", read: "Complet", create: "Complet", encrypted: "Non", note: "Format non compressé, adapté aux lots et aux arborescences." },
  { format: "TAR.GZ", extensions: ".tar.gz, .tgz", read: "Complet", create: "Complet", encrypted: "Non", note: "Archive TAR compressée en GZIP, extraction et création disponibles." },
  { format: "GZIP", extensions: ".gz, .gzip", read: "Complet", create: "Partiel", encrypted: "Non", note: "Un flux ou fichier unique ; pour plusieurs fichiers, utiliser TAR.GZ." },
  { format: "7Z", extensions: ".7z", read: "Complet", create: "Non", encrypted: "Selon archive", note: "Extraction locale ; les archives protégées peuvent demander un mot de passe." },
  { format: "RAR", extensions: ".rar", read: "Complet", create: "Non", encrypted: "Selon archive", note: "Extraction locale uniquement ; création RAR non disponible dans le navigateur." },
];

function Support({ value }: { value: FormatSupport["read"] }) {
  return <span className={`support support-${value.toLowerCase()}`}>{value === "Non" ? <XCircle /> : <CheckCircle2 />}{value}</span>;
}

export function FormatMatrixModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modalback formatmodalback" onClick={onClose}>
      <div className="formatpanel" onClick={(e) => e.stopPropagation()}>
        <header>
          <div><h2>Formats et limitations</h2><p>Ce que cette version gratuite peut réellement faire dans votre navigateur.</p></div>
          <button onClick={onClose}>×</button>
        </header>
        <div className="formatlegend"><span><i className="support-complet" />Complet</span><span><i className="support-partiel" />Partiel</span><span><i className="support-non" />Non disponible</span></div>
        <div className="formattablewrap">
          <table className="formattable">
            <thead><tr><th>Format</th><th>Extensions</th><th>Extraire</th><th>Créer</th><th>Chiffré</th><th>Limitation actuelle</th></tr></thead>
            <tbody>{FORMAT_MATRIX.map((item) => <tr key={item.format}><td><b>{item.format}</b></td><td><code>{item.extensions}</code></td><td><Support value={item.read} /></td><td><Support value={item.create} /></td><td>{item.encrypted}</td><td>{item.note}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="browserlimits"><Info /><div><b>Limites du mode web</b><p>Le traitement reste sur votre appareil. La mémoire disponible, la taille maximale et le choix direct d’un dossier dépendent du navigateur. Chrome et Edge offrent la meilleure prise en charge des dossiers ; sur mobile et les autres navigateurs, le téléchargement classique reste disponible.</p></div></div>
        <footer><span><ShieldCheck />Toutes les fonctions affichées sont gratuites.</span><button onClick={onClose}>J’ai compris</button></footer>
      </div>
    </div>
  );
}
