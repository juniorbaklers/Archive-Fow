"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Download,
  File,
  FileArchive,
  FolderOpen,
  FolderTree,
  History,
  Info,
  Layers3,
  ListTree,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  ArchiveEntry,
  formatBytes,
  hashEntries,
  makeTar,
  makeTarGz,
  makeZip,
  readArchive,
  saveToFolder,
} from "./archive-utils";
import {
  CategoryDef,
  CollisionPolicy,
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  enrichEntries,
  RenameOptions,
  SmartEntry,
  SmartRule,
} from "./smart-engine";
type Mode = "extract" | "create";
type H = {
  id: number;
  date: string;
  action: string;
  count: number;
  format: string;
};
const DEF: RenameOptions = {
  pattern: "{nom}_{numero}",
  project: "Projet",
  prefix: "",
  suffix: "",
  caseMode: "none",
  removeAccents: false,
  spaces: "underscore",
  search: "",
  replace: "",
  regex: false,
  maxLength: 120,
};
function dl(data: Uint8Array, name: string, type: string) {
  const u = URL.createObjectURL(new Blob([data as BlobPart], { type })),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export default function Home() {
  const [mode, setMode] = useState<Mode>("extract"),
    [sources, setSources] = useState<File[]>([]),
    [entries, setEntries] = useState<ArchiveEntry[]>([]),
    [output, setOutput] = useState("ZIP"),
    [name, setName] = useState("archive-organisee"),
    [view, setView] = useState<"tree" | "list">("tree"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<H[]>([]),
    [historyOpen, setHistoryOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [tab, setTab] = useState("rules"),
    [query, setQuery] = useState(""),
    [rules, setRules] = useState<SmartRule[]>(DEFAULT_RULES),
    [cats, setCats] = useState<CategoryDef[]>([]),
    [rename, setRename] = useState<RenameOptions>(DEF),
    [policy, setPolicy] = useState<CollisionPolicy>("keep-both"),
    [classify, setClassify] = useState(false),
    [renameEnabled, setRenameEnabled] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    jsonInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      setHistory(
        JSON.parse(localStorage.getItem("archiveflow-history") || "[]"),
      );
      const c = JSON.parse(
        localStorage.getItem("archiveflow-config") || "null",
      );
      if (c) {
        setRules(c.rules || DEFAULT_RULES);
        setCats(c.categories || []);
        setRename({ ...DEF, ...c.rename });
        setPolicy(c.policy || "keep-both");
        setClassify(c.classify || false);
        setRenameEnabled(c.renameEnabled || false);
      }
    } catch {}
  }, []);
  useEffect(
    () =>
      localStorage.setItem(
        "archiveflow-config",
        JSON.stringify({
          rules,
          categories: cats,
          rename,
          policy,
          classify,
          renameEnabled,
        }),
      ),
    [rules, cats, rename, policy, classify, renameEnabled],
  );
  const planned = useMemo(
      () =>
        enrichEntries(
          entries,
          rules,
          [...DEFAULT_CATEGORIES, ...cats],
          rename,
          policy,
          classify,
          renameEnabled,
        ),
      [entries, rules, cats, rename, policy, classify, renameEnabled],
    ),
    filtered = planned.filter((e) =>
      (e.planned || e.name).toLowerCase().includes(query.toLowerCase()),
    ),
    dupes = planned.filter((e) => e.collision).length,
    incomplete = planned.filter((e) => e.familyIncomplete).length,
    total = sources.reduce((s, f) => s + f.size, 0),
    tree = useMemo(() => {
      const m = new Map<string, SmartEntry[]>();
      for (const e of filtered) {
        const p = e.planned || e.name,
          f = p.includes("/")
            ? p.split("/").slice(0, -1).join(" / ")
            : "Racine";
        m.set(f, [...(m.get(f) || []), e]);
      }
      return [...m];
    }, [filtered]);
  async function addFiles(l: FileList | null) {
    if (!l?.length) return;
    setBusy(true);
    setError("");
    try {
      const fs = Array.from(l);
      setSources((p) => (mode === "create" ? [...p, ...fs] : fs));
      let all: ArchiveEntry[] = [];
      if (mode === "extract")
        for (const f of fs) all.push(...(await readArchive(f)));
      else
        all = [
          ...entries,
          ...(await Promise.all(
            fs.map(async (f) => ({
              name: f.name,
              size: f.size,
              data: new Uint8Array(await f.arrayBuffer()),
              date: new Date(f.lastModified),
              source: "Fichiers ajoutés",
            })),
          )),
        ];
      setEntries(await hashEntries(all));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse impossible");
    } finally {
      setBusy(false);
    }
  }
  function reset(m?: Mode) {
    if (m) setMode(m);
    setSources([]);
    setEntries([]);
    setError("");
  }
  function hist(a: string, f: string) {
    const n = [
      {
        id: Date.now(),
        date: new Date().toISOString(),
        action: a,
        count: planned.length,
        format: f,
      },
      ...history,
    ].slice(0, 25);
    setHistory(n);
    localStorage.setItem("archiveflow-history", JSON.stringify(n));
  }
  async function produce(folder = false) {
    if (!planned.length) return;
    setBusy(true);
    const j = {
      id: Date.now(),
      status: "en cours",
      files: planned.map((e) => ({
        source: e.name,
        destination: e.planned,
        collision: e.collision,
      })),
    };
    localStorage.setItem("archiveflow-journal", JSON.stringify(j));
    try {
      if (
        policy === "replace-confirm" &&
        dupes &&
        !confirm("Confirmer le remplacement des conflits ?")
      )
        return;
      const u = planned.filter((e) => e.included !== false);
      if (folder) {
        await saveToFolder(u);
        hist("Organisation", "Dossier");
      } else {
        let d: Uint8Array, n: string, m: string;
        if (output === "TAR") {
          d = makeTar(u);
          n = `${name}.tar`;
          m = "application/x-tar";
        } else if (output === "TAR.GZ") {
          d = await makeTarGz(u);
          n = `${name}.tar.gz`;
          m = "application/gzip";
        } else {
          d = makeZip(u);
          n = `${name}.zip`;
          m = "application/zip";
        }
        dl(d, n, m);
        hist(mode === "extract" ? "Extraction" : "Création", output);
      }
      localStorage.setItem(
        "archiveflow-journal",
        JSON.stringify({ ...j, status: "terminé" }),
      );
    } catch (e) {
      localStorage.setItem(
        "archiveflow-journal",
        JSON.stringify({ ...j, status: "erreur" }),
      );
      setError(e instanceof Error ? e.message : "Opération impossible");
    } finally {
      setBusy(false);
    }
  }
  const exportJson = () =>
    dl(
      new TextEncoder().encode(
        JSON.stringify(
          {
            version: 2,
            rules,
            categories: cats,
            rename,
            policy,
            classify,
            renameEnabled,
          },
          null,
          2,
        ),
      ),
      "archiveflow-regles.json",
      "application/json",
    );
  async function importJson(f?: File) {
    if (!f) return;
    try {
      const c = JSON.parse(await f.text());
      setRules(c.rules || DEFAULT_RULES);
      setCats(c.categories || []);
      setRename({ ...DEF, ...c.rename });
      setPolicy(c.policy || "keep-both");
      setClassify(c.classify || false);
      setRenameEnabled(c.renameEnabled || false);
    } catch {
      setError("JSON invalide");
    }
  }
  return (
    <main className="v2">
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
          <button onClick={() => setHistoryOpen(true)}>
            <History />
            Historique
          </button>
          <button onClick={() => setSettings(true)}>
            <Settings2 />
            Paramètres
          </button>
        </nav>
        <strong>
          <ShieldCheck />
          Traitement local
        </strong>
      </header>
      <section className="v2wrap">
        <div className="v2title">
          <div>
            <em>ESPACE DE TRAVAIL</em>
            <h1>Organisez vos archives en toute confiance.</h1>
            <p>
              Classement intelligent, renommage, familles et collisions
              sécurisées.
            </p>
          </div>
          <div className="formats">
            <span>
              ZIP <b>Complet</b>
            </span>
            <span>
              TAR/GZIP <b>Complet</b>
            </span>
            <span>
              7Z/RAR <b>Extraction</b>
            </span>
          </div>
        </div>
        <div className="v2tabs">
          <button
            className={mode === "extract" ? "on" : ""}
            onClick={() => reset("extract")}
          >
            <FolderOpen />
            Extraire & organiser
          </button>
          <button
            className={mode === "create" ? "on" : ""}
            onClick={() => reset("create")}
          >
            <FileArchive />
            Créer une archive
          </button>
        </div>
        <div className="dashboard">
          <aside className="controls">
            <section>
              <h2>
                <span>1</span>Fichiers sources
              </h2>
              <input
                ref={input}
                hidden
                type="file"
                multiple
                accept={
                  mode === "extract" ? ".zip,.tar,.gz,.tgz,.7z,.rar" : undefined
                }
                onChange={(e) => addFiles(e.target.files)}
              />
              <button
                className="dropmini"
                onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
              >
                <UploadCloud />
                <strong>Ajouter des fichiers</strong>
                <small>Glissez-déposez ou parcourez</small>
              </button>
              {sources.length > 0 && (
                <div className="source-summary">
                  <b>{sources.length}</b>
                  <span>
                    éléments<small>{formatBytes(total)}</small>
                  </span>
                  <button onClick={() => reset()}>
                    <Trash2 />
                  </button>
                </div>
              )}
            </section>
            <section>
              <h2>
                <span>2</span>Moteur intelligent
              </h2>
              <label className="preserve-note">
                <ShieldCheck />
                <span>
                  <b>Arborescence originale conservée</b>
                  <small>Un dossier séparé par archive</small>
                </span>
              </label>
              <label className="optioncheck">
                <input
                  type="checkbox"
                  checked={classify}
                  onChange={(e) => setClassify(e.target.checked)}
                />
                Activer le classement intelligent
              </label>
              <label className="optioncheck">
                <input
                  type="checkbox"
                  checked={renameEnabled}
                  onChange={(e) => setRenameEnabled(e.target.checked)}
                />
                Renommer les fichiers et les dossiers
              </label>
              <label>
                Modèle
                <input
                  disabled={!renameEnabled}
                  value={rename.pattern}
                  onChange={(e) =>
                    setRename({ ...rename, pattern: e.target.value })
                  }
                />
                <small>{"{nom} {projet} {category} {date} {numero}"}</small>
              </label>
              <button className="enginebtn" onClick={() => setSettings(true)}>
                <Settings2 />
                Configurer les règles
              </button>
            </section>
            <section>
              <h2>
                <span>3</span>Destination
              </h2>
              <label>
                Nom
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="formatselect">
                {["ZIP", "TAR", "TAR.GZ"].map((f) => (
                  <button
                    className={output === f ? "on" : ""}
                    key={f}
                    onClick={() => setOutput(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </section>
          </aside>
          <section className="preview">
            <div className="previewhead">
              <div>
                <h2>Simulation du résultat</h2>
                <p>
                  {planned.length} fichiers • {dupes} conflits • {incomplete}{" "}
                  groupes incomplets
                </p>
              </div>
              <div className="viewbuttons">
                <button
                  className={view === "tree" ? "on" : ""}
                  onClick={() => setView("tree")}
                >
                  <ListTree />
                </button>
                <button
                  className={view === "list" ? "on" : ""}
                  onClick={() => setView("list")}
                >
                  <Layers3 />
                </button>
              </div>
            </div>
            <div className="search">
              <Search />
              <input
                placeholder="Rechercher…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {error && (
              <div className="v2error">
                <Info />
                {error}
              </div>
            )}
            {busy ? (
              <div className="v2empty">
                <RefreshCcw className="spin" />
                <b>Analyse en cours…</b>
              </div>
            ) : !planned.length ? (
              <div className="v2empty">
                <FolderTree />
                <b>Aucun fichier à prévisualiser</b>
              </div>
            ) : view === "tree" ? (
              <div className="tree">
                {tree.map(([f, is]) => (
                  <div className="treegroup" key={f}>
                    <h3>
                      <FolderOpen />
                      {f}
                      <span>{is.length}</span>
                    </h3>
                    {is.map((e, i) => (
                      <Row e={e} key={i} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="tree listview">
                {filtered.map((e, i) => (
                  <Row e={e} key={i} />
                ))}
              </div>
            )}
            <div className="resultbar">
              <div>
                <span>
                  <CheckCircle2 />
                  Simulation terminée
                </span>
                <small>Aucun écrasement silencieux.</small>
              </div>
              <button
                className="folderbtn"
                disabled={!planned.length || busy}
                onClick={() => produce(true)}
              >
                Choisir un dossier
              </button>
              <button
                className="downloadbtn"
                disabled={!planned.length || busy}
                onClick={() => produce()}
              >
                <Download />
                Télécharger
              </button>
            </div>
          </section>
        </div>
      </section>
      {historyOpen && (
        <div className="modalback" onClick={() => setHistoryOpen(false)}>
          <div className="historypanel" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2>Historique local</h2>
              <button onClick={() => setHistoryOpen(false)}>×</button>
            </div>
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
          </div>
        </div>
      )}
      {settings && (
        <Panel
          close={() => setSettings(false)}
          tab={tab}
          setTab={setTab}
          rules={rules}
          setRules={setRules}
          cats={cats}
          setCats={setCats}
          rename={rename}
          setRename={setRename}
          policy={policy}
          setPolicy={setPolicy}
          exportJson={exportJson}
          importJson={importJson}
          jsonInput={jsonInput}
        />
      )}
    </main>
  );
}
function Panel(p: any) {
  const upd = (id: string, x: any) =>
    p.setRules(
      p.rules.map((r: SmartRule) => (r.id === id ? { ...r, ...x } : r)),
    );
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
          {[
            ["rules", "Règles"],
            ["rename", "Renommage"],
            ["duplicates", "Doublons"],
            ["categories", "Catégories"],
          ].map((x) => (
            <button
              key={x[0]}
              className={p.tab === x[0] ? "on" : ""}
              onClick={() => p.setTab(x[0])}
            >
              {x[1]}
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
            {p.rules.map((r: SmartRule, i: number) => (
              <article className="rulecard" key={r.id}>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => upd(r.id, { enabled: e.target.checked })}
                />
                <b>#{r.priority}</b>
                <select
                  value={r.field}
                  onChange={(e) => upd(r.id, { field: e.target.value })}
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
                  onChange={(e) => upd(r.id, { operator: e.target.value })}
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
                      q.forEach((v: any, j: number) => (v.priority = j + 1));
                      p.setRules(q);
                    }
                  }}
                >
                  ↑
                </button>
                <button
                  onClick={() =>
                    p.setRules(p.rules.filter((x: any) => x.id !== r.id))
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
            {[
              ["project", "Projet"],
              ["pattern", "Modèle"],
              ["prefix", "Préfixe"],
              ["suffix", "Suffixe"],
              ["search", "Rechercher"],
              ["replace", "Remplacer"],
            ].map(([k, l]) => (
              <label key={k}>
                {l}
                <input
                  value={p.rename[k]}
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
                  p.setRename({ ...p.rename, caseMode: e.target.value })
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
                  p.setRename({ ...p.rename, spaces: e.target.value })
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
            <h3>Politique globale</h3>
            {[
              ["keep-both", "Conserver les deux"],
              ["rename", "Renommer automatiquement"],
              ["skip", "Ignorer"],
              ["duplicates-folder", "Déplacer dans Doublons"],
              ["replace-confirm", "Remplacer après confirmation"],
            ].map((x) => (
              <label className="policy" key={x[0]}>
                <input
                  type="radio"
                  checked={p.policy === x[0]}
                  onChange={() => p.setPolicy(x[0])}
                />
                <span>
                  <b>{x[1]}</b>
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
            {p.cats.map((c: CategoryDef) => (
              <article className="customcat" key={c.id}>
                <input
                  value={c.name}
                  onChange={(e) =>
                    p.setCats(
                      p.cats.map((x: any) =>
                        x.id === c.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  value={c.extensions.join(", ")}
                  onChange={(e) =>
                    p.setCats(
                      p.cats.map((x: any) =>
                        x.id === c.id
                          ? {
                              ...x,
                              extensions: e.target.value
                                .split(",")
                                .map((v: string) => v.trim()),
                            }
                          : x,
                      ),
                    )
                  }
                />
                <button
                  onClick={() =>
                    p.setCats(p.cats.filter((x: any) => x.id !== c.id))
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
function Row({ e }: { e: SmartEntry }) {
  const c: Record<string, string> = {
    "same-name-same-content": "Même nom et contenu",
    "same-name-different-content": "Même nom, contenu différent",
    "same-content-different-name": "Contenu identique",
  };
  return (
    <div
      className={`v2row ${e.collision ? "duplicate" : ""}`}
      title={e.explanation}
    >
      <i>
        <File />
      </i>
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
        <span className="dup">{c[e.collision]}</span>
      ) : e.contentMatch ? (
        <span className="shared">Identique dans une autre archive</span>
      ) : (
        <CheckCircle2 />
      )}
    </div>
  );
}
