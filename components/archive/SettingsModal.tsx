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
import { TranslationKey } from "@/app/i18n";

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
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const RENAME_FIELD_KEYS: [keyof RenameOptions, TranslationKey][] = [
  ["project", "settings.rename.project"],
  ["pattern", "settings.rename.pattern"],
  ["prefix", "settings.rename.prefix"],
  ["suffix", "settings.rename.suffix"],
  ["search", "settings.rename.search"],
  ["replace", "settings.rename.replace"],
];

const POLICY_KEYS: [CollisionPolicy, TranslationKey][] = [
  ["keep-both", "settings.duplicates.keepBoth"],
  ["rename", "settings.duplicates.renameAuto"],
  ["skip", "settings.duplicates.skip"],
  ["duplicates-folder", "settings.duplicates.moveToDuplicates"],
  ["replace-confirm", "settings.duplicates.replaceConfirm"],
];

const TAB_KEYS: [SettingsTab, TranslationKey][] = [
  ["rules", "settings.tab.rules"],
  ["rename", "settings.tab.rename"],
  ["duplicates", "settings.tab.duplicates"],
  ["security", "settings.tab.security"],
  ["categories", "settings.tab.categories"],
];

export function SettingsModal(p: SettingsModalProps) {
  const { t } = p;
  const upd = (id: string, x: Partial<SmartRule>) =>
    p.setRules(p.rules.map((r) => (r.id === id ? { ...r, ...x } : r)));

  return (
    <div className="modalback" onClick={p.close}>
      <div className="settingspanel" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>{t("settings.title")}</h2>
            <p>{t("settings.subtitle")}</p>
          </div>
          <button onClick={p.close}>×</button>
        </header>
        <nav>
          {TAB_KEYS.map(([id, labelKey]) => (
            <button
              key={id}
              className={p.tab === id ? "on" : ""}
              onClick={() => p.setTab(id)}
            >
              {t(labelKey)}
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
                {t("settings.addRule")}
              </button>
              <button onClick={p.exportJson}>{t("settings.exportJson")}</button>
              <input
                hidden
                ref={p.jsonInput}
                type="file"
                accept=".json"
                onChange={(e) => p.importJson(e.target.files?.[0])}
              />
              <button onClick={() => p.jsonInput.current?.click()}>
                {t("settings.import")}
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
                {t("settings.share")}
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
                  placeholder={t("settings.valuePlaceholder")}
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
            {RENAME_FIELD_KEYS.map(([k, labelKey]) => (
              <label key={k}>
                {t(labelKey)}
                <input
                  value={String(p.rename[k])}
                  onChange={(e) =>
                    p.setRename({ ...p.rename, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              {t("settings.rename.case")}
              <select
                value={p.rename.caseMode}
                onChange={(e) =>
                  p.setRename({ ...p.rename, caseMode: e.target.value as RenameOptions["caseMode"] })
                }
              >
                <option value="none">{t("settings.rename.caseKeep")}</option>
                <option value="upper">{t("settings.rename.caseUpper")}</option>
                <option value="lower">{t("settings.rename.caseLower")}</option>
              </select>
            </label>
            <label>
              {t("settings.rename.spaces")}
              <select
                value={p.rename.spaces}
                onChange={(e) =>
                  p.setRename({ ...p.rename, spaces: e.target.value as RenameOptions["spaces"] })
                }
              >
                <option value="keep">{t("settings.rename.spacesKeep")}</option>
                <option value="underscore">_</option>
                <option value="dash">-</option>
              </select>
            </label>
            <label>
              {t("settings.rename.maxLength")}
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
              {t("settings.rename.noAccents")}
            </label>
            <label className="tick">
              <input
                type="checkbox"
                checked={p.rename.regex}
                onChange={(e) =>
                  p.setRename({ ...p.rename, regex: e.target.checked })
                }
              />
              {t("settings.rename.regex")}
            </label>
            <div className="pathoption">{t("settings.rename.alwaysAsksPermission")}</div>
            <label>
              {t("settings.rename.relativePathLimit")}
              <input type="number" min="100" max="220" value={p.rename.relativePathLimit || 180} onChange={(e) => p.setRename({ ...p.rename, relativePathLimit: +e.target.value })} />
              <small>{t("settings.rename.relativePathLimitHint")}</small>
            </label>
            <div className="renamepreview">
              <b>{t("settings.rename.preview")}</b>
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
            <label className="strictsave"><input type="checkbox" checked={p.preserveAll} onChange={(e) => p.setPreserveAll(e.target.checked)} /><span><b>{t("settings.duplicates.strictMode")}</b><small>{t("settings.duplicates.strictModeHint")}</small></span></label>
            <h3>{t("settings.duplicates.globalPolicy")}</h3>
            {POLICY_KEYS.map(([id, labelKey]) => (
              <label className="policy" key={id}>
                <input
                  type="radio"
                  checked={p.policy === id}
                  onChange={() => p.setPolicy(id)}
                />
                <span>
                  <b>{t(labelKey)}</b>
                  <small>{t("settings.duplicates.detectionHint")}</small>
                </span>
              </label>
            ))}
            <p className="safenote">
              <ShieldCheck />
              {t("settings.duplicates.recoveryJournal")}
            </p>
          </section>
        )}
        {p.tab === "security" && (
          <section>
            <div className="safenote"><ShieldCheck /><div><b>{t("settings.security.zipBombTitle")}</b><small>{t("settings.security.zipBombHint")}</small></div></div>
            <div className="formgrid securitygrid">
              <label>{t("settings.security.maxExpandedSize")}<input type="number" min="1" value={Math.round(p.security.maxExpandedBytes / 1073741824)} onChange={(e) => p.setSecurity({ ...p.security, maxExpandedBytes: Math.max(1, +e.target.value) * 1073741824 })} /></label>
              <label>{t("settings.security.maxFiles")}<input type="number" min="100" value={p.security.maxFiles} onChange={(e) => p.setSecurity({ ...p.security, maxFiles: Math.max(100, +e.target.value) })} /></label>
              <label>{t("settings.security.maxRatio")}<input type="number" min="10" value={p.security.maxRatio} onChange={(e) => p.setSecurity({ ...p.security, maxRatio: Math.max(10, +e.target.value) })} /></label>
              <label>{t("settings.security.maxDepth")}<input type="number" min="1" value={p.security.maxDepth} onChange={(e) => p.setSecurity({ ...p.security, maxDepth: Math.max(1, +e.target.value) })} /></label>
            </div>
            <button onClick={() => p.setSecurity(DEFAULT_SECURITY_LIMITS)}>{t("settings.security.resetDefaults")}</button>
          </section>
        )}
        {p.tab === "categories" && (
          <section>
            <h3>{t("settings.categories.builtIn")}</h3>
            <div className="categorychips">
              {DEFAULT_CATEGORIES.map((c) => (
                <span key={c.id}>
                  {c.name} <small>{c.extensions.length}</small>
                </span>
              ))}
            </div>
            <h3>{t("settings.categories.custom")}</h3>
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
                    name: t("settings.categories.newCategory"),
                    extensions: [],
                    custom: true,
                  },
                ])
              }
            >
              {t("settings.categories.create")}
            </button>
            <p>{t("settings.categories.unknownNote")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
