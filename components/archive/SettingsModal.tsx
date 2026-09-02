import { RefObject } from "react";
import { ShieldCheck } from "lucide-react";
import { DEFAULT_SECURITY_LIMITS, SecurityLimits } from "@/app/archive-utils";
import {
  CategoryDef,
  CollisionPolicy,
  DEFAULT_CATEGORIES,
  RenameOptions,
  SmartRule,
} from "@/app/smart-engine";

export type SettingsTab = "rules" | "rename" | "duplicates" | "security" | "categories";

export type SettingsModalProps = {
  close: () => void;
  tab: string;
  setTab: (tab: SettingsTab) => void;
  rules: SmartRule[];
  setRules: (rules: SmartRule[]) => void;
  cats: CategoryDef[];
  setCats: (cats: CategoryDef[]) => void;
  rename: RenameOptions;
  setRename: (rename: RenameOptions) => void;
  policy: CollisionPolicy;
  setPolicy: (policy: CollisionPolicy) => void;
  preserveAll: boolean;
  setPreserveAll: (value: boolean) => void;
  exportJson: () => void;
  importJson: (file?: File) => void;
  jsonInput: RefObject<HTMLInputElement | null>;
  security: SecurityLimits;
  setSecurity: (security: SecurityLimits) => void;
};

const RENAME_FIELDS: [keyof RenameOptions, string][] = [
  ["project", "Projet"],
  ["pattern", "Modèle"],
  ["prefix", "Préfixe"],
  ["suffix", "Suffixe"],
  ["search", "Rechercher"],
  ["replace", "Remplacer"],
];

const POLICIES: [CollisionPolicy, string][] = [
  ["keep-both", "Conserver les deux"],
  ["rename", "Renommer automatiquement"],
  ["skip", "Ignorer"],
  ["duplicates-folder", "Déplacer dans Doublons"],
  ["replace-confirm", "Remplacer après confirmation"],
];

const TABS: [SettingsTab, string][] = [
  ["rules", "Règles"],
  ["rename", "Renommage"],
  ["duplicates", "Doublons"],
  ["security", "Sécurité"],
  ["categories", "Catégories"],
];

export function SettingsModal(p: SettingsModalProps) {
  const upd = (id: string, x: Partial<SmartRule>) =>
    p.setRules(p.rules.map((r) => (r.id === id ? { ...r, ...x } : r)));

  return (
    <div className="modalback" onClick={p.close}>
      <div className="settingspanel" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Moteur de classement intelligent</h2>
            <p>Configuration locale et partageable.</p>
          </div>
          <button onClick={p.close}>×</button>
        </header>
        <nav>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={p.tab === id ? "on" : ""}
              onClick={() => p.setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {p.tab === "rules" && (
          <section>
            <div className="settingactions">
              <button
                onClick={() =>
                  p.setRules([
                    ...p.rules,
                    {
                      id: crypto.randomUUID(),
                      priority: p.rules.length + 1,
                      enabled: true,
                      field: "name",
                      operator: "contains",
                      value: "",
                      destination: "{projet}/{category}/{annee}",
                    },
                  ])
                }
              >
                + Règle
              </button>
              <button onClick={p.exportJson}>Exporter JSON</button>
              <input
                hidden
                ref={p.jsonInput}
                type="file"
                accept=".json"
                onChange={(e) => p.importJson(e.target.files?.[0])}
              />
              <button onClick={() => p.jsonInput.current?.click()}>
                Importer
              </button>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify(
                      {
                        rules: p.rules,
                        rename: p.rename,
                        policy: p.policy,
                        categories: p.cats,
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                Partager
              </button>
            </div>
            {p.rules.map((r, i) => (
              <article className="rulecard" key={r.id}>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => upd(r.id, { enabled: e.target.checked })}
                />
                <b>#{r.priority}</b>
                <select
                  value={r.field}
                  onChange={(e) => upd(r.id, { field: e.target.value as SmartRule["field"] })}
                >
                  {[
                    "name",
                    "extension",
                    "category",
                    "source",
                    "size",
                    "regex",
                    "keyword",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  value={r.operator}
                  onChange={(e) => upd(r.id, { operator: e.target.value as SmartRule["operator"] })}
                >
                  {["contains", "equals", "greater", "less", "matches"].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
                <input
                  value={r.value}
                  placeholder="Valeur"
                  onChange={(e) => upd(r.id, { value: e.target.value })}
                />
                <input
                  value={r.destination}
                  onChange={(e) => upd(r.id, { destination: e.target.value })}
                />
                <button
                  onClick={() => {
                    const q = [...p.rules],
                      a = q[i - 1];
                    if (a) {
                      q[i - 1] = q[i];
                      q[i] = a;
                      q.forEach((v, j) => (v.priority = j + 1));
                      p.setRules(q);
                    }
                  }}
                >
                  ↑
                </button>
                <button
                  onClick={() =>
                    p.setRules(p.rules.filter((x) => x.id !== r.id))
                  }
                >
                  ×
                </button>
              </article>
            ))}
          </section>
        )}
        {p.tab === "rename" && (
          <section className="formgrid">
            {RENAME_FIELDS.map(([k, l]) => (
              <label key={k}>
                {l}
                <input
                  value={String(p.rename[k])}
                  onChange={(e) =>
                    p.setRename({ ...p.rename, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Casse
              <select
                value={p.rename.caseMode}
                onChange={(e) =>
                  p.setRename({ ...p.rename, caseMode: e.target.value as RenameOptions["caseMode"] })
                }
              >
                <option value="none">Conserver</option>
                <option value="upper">MAJUSCULES</option>
                <option value="lower">minuscules</option>
              </select>
            </label>
            <label>
              Espaces
              <select
                value={p.rename.spaces}
                onChange={(e) =>
                  p.setRename({ ...p.rename, spaces: e.target.value as RenameOptions["spaces"] })
                }
              >
                <option value="keep">Conserver</option>
                <option value="underscore">_</option>
                <option value="dash">-</option>
              </select>
            </label>
            <label>
              Longueur max
              <input
                type="number"
                value={p.rename.maxLength}
                onChange={(e) =>
                  p.setRename({ ...p.rename, maxLength: +e.target.value })
                }
              />
            </label>
            <label className="tick">
              <input
                type="checkbox"
                checked={p.rename.removeAccents}
                onChange={(e) =>
                  p.setRename({ ...p.rename, removeAccents: e.target.checked })
                }
              />
              Sans accents
            </label>
            <label className="tick">
              <input
                type="checkbox"
                checked={p.rename.regex}
                onChange={(e) =>
                  p.setRename({ ...p.rename, regex: e.target.checked })
                }
              />
              Regex
            </label>
            <div className="pathoption">ArchiveFlow demande toujours une autorisation avant de raccourcir un nom.</div>
            <label>
              Longueur relative maximale
              <input type="number" min="100" max="220" value={p.rename.relativePathLimit || 180} onChange={(e) => p.setRename({ ...p.rename, relativePathLimit: +e.target.value })} />
              <small>180 caractères recommandés pour laisser de la place au dossier choisi.</small>
            </label>
            <div className="renamepreview">
              <b>Aperçu</b>
              <code>
                {p.rename.prefix}
                {p.rename.pattern
                  .replace("{nom}", "rapport")
                  .replace("{projet}", p.rename.project)
                  .replace("{category}", "Documents")
                  .replace("{numero}", "001")}
                {p.rename.suffix}.pdf
              </code>
            </div>
          </section>
        )}
        {p.tab === "duplicates" && (
          <section>
            <label className="strictsave"><input type="checkbox" checked={p.preserveAll} onChange={(e) => p.setPreserveAll(e.target.checked)} /><span><b>Mode strict : conserver tous les fichiers</b><small>Recommandé. « Ignorer » devient « Conserver les deux » pour éviter toute disparition.</small></span></label>
            <h3>Politique globale</h3>
            {POLICIES.map(([id, label]) => (
              <label className="policy" key={id}>
                <input
                  type="radio"
                  checked={p.policy === id}
                  onChange={() => p.setPolicy(id)}
                />
                <span>
                  <b>{label}</b>
                  <small>Détection par nom et SHA-256.</small>
                </span>
              </label>
            ))}
            <p className="safenote">
              <ShieldCheck />
              Journal de récupération avant génération.
            </p>
          </section>
        )}
        {p.tab === "security" && (
          <section>
            <div className="safenote"><ShieldCheck /><div><b>Protection contre les bombes ZIP</b><small>L’archive est bloquée avant la décompression dès qu’une limite est dépassée.</small></div></div>
            <div className="formgrid securitygrid">
              <label>Taille extraite maximale (Go)<input type="number" min="1" value={Math.round(p.security.maxExpandedBytes / 1073741824)} onChange={(e) => p.setSecurity({ ...p.security, maxExpandedBytes: Math.max(1, +e.target.value) * 1073741824 })} /></label>
              <label>Nombre maximal de fichiers<input type="number" min="100" value={p.security.maxFiles} onChange={(e) => p.setSecurity({ ...p.security, maxFiles: Math.max(100, +e.target.value) })} /></label>
              <label>Ratio de compression maximal<input type="number" min="10" value={p.security.maxRatio} onChange={(e) => p.setSecurity({ ...p.security, maxRatio: Math.max(10, +e.target.value) })} /></label>
              <label>Profondeur maximale<input type="number" min="1" value={p.security.maxDepth} onChange={(e) => p.setSecurity({ ...p.security, maxDepth: Math.max(1, +e.target.value) })} /></label>
            </div>
            <button onClick={() => p.setSecurity(DEFAULT_SECURITY_LIMITS)}>Rétablir les limites équilibrées</button>
          </section>
        )}
        {p.tab === "categories" && (
          <section>
            <h3>Catégories intégrées</h3>
            <div className="categorychips">
              {DEFAULT_CATEGORIES.map((c) => (
                <span key={c.id}>
                  {c.name} <small>{c.extensions.length}</small>
                </span>
              ))}
            </div>
            <h3>Personnalisées</h3>
            {p.cats.map((c) => (
              <article className="customcat" key={c.id}>
                <input
                  value={c.name}
                  onChange={(e) =>
                    p.setCats(
                      p.cats.map((x) =>
                        x.id === c.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  value={c.extensions.join(", ")}
                  onChange={(e) =>
                    p.setCats(
                      p.cats.map((x) =>
                        x.id === c.id
                          ? {
                              ...x,
                              extensions: e.target.value
                                .split(",")
                                .map((v) => v.trim()),
                            }
                          : x,
                      ),
                    )
                  }
                />
                <button
                  onClick={() =>
                    p.setCats(p.cats.filter((x) => x.id !== c.id))
                  }
                >
                  ×
                </button>
              </article>
            ))}
            <button
              onClick={() =>
                p.setCats([
                  ...p.cats,
                  {
                    id: crypto.randomUUID(),
                    name: "Nouvelle catégorie",
                    extensions: [],
                    custom: true,
                  },
                ])
              }
            >
              + Créer une catégorie
            </button>
            <p>Les formats inconnus sont classés dans « Autres ».</p>
          </section>
        )}
      </div>
    </div>
  );
}
