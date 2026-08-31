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
  HardDrive,
  XCircle,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import {
  ArchiveEntry,
  formatBytes,
  hashEntries,
  makeTar,
  makeTarGz,
  makeZip,
  readArchive,
} from "./archive-utils";
import { analyzeDestination, DestinationAnalysis, pickDestination, writeToDestination } from "./destination-utils";
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
const entryKey = (entry: ArchiveEntry) => `${entry.source}\u0000${entry.name}`;
type BulkOverride = { category?: string; folder?: string; prefix?: string };
type FolderArchive = { file: File; path: string; included: boolean };
type ProfileId = "custom" | "sig" | "documents" | "media" | "developer" | "cad" | "science";
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
const PROFILES: { id: ProfileId; name: string; category?: string; folder?: string; description: string }[] = [
  { id: "custom", name: "Personnalisé", description: "Vos catégories et règles actuelles" },
  { id: "sig", name: "SIG", category: "SIG", folder: "SIG", description: "Shapefiles, GeoJSON, GPKG, QGIS et données géographiques" },
  { id: "documents", name: "Documents", category: "Bureautique", folder: "Documents", description: "Documents, PDF, tableurs et présentations" },
  { id: "media", name: "Médias", category: "Audio et vidéo", folder: "Médias", description: "Images, audio, vidéo et fichiers associés" },
  { id: "developer", name: "Développeur", category: "Développement", folder: "Code", description: "Code source, configurations et documentation" },
  { id: "cad", name: "CAO / BIM", category: "CAO, BIM et scientifique", folder: "CAO-BIM", description: "Plans, modèles, maquettes et ressources techniques" },
  { id: "science", name: "Scientifique", category: "Données", folder: "Données-scientifiques", description: "Jeux de données, bases, mesures et résultats" },
];
const archivePattern = /\.(zip|tar|tar\.gz|tgz|gz|gzip|7z|rar)$/i;
const hiddenOrSystem = (path: string) => path.split("/").some((part) => part.startsWith(".") || ["__MACOSX", "node_modules", "$RECYCLE.BIN", "System Volume Information"].includes(part));
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
    [formatsOpen, setFormatsOpen] = useState(false),
    [tab, setTab] = useState("rules"),
    [query, setQuery] = useState(""),
    [rules, setRules] = useState<SmartRule[]>(DEFAULT_RULES),
    [cats, setCats] = useState<CategoryDef[]>([]),
    [rename, setRename] = useState<RenameOptions>(DEF),
    [policy, setPolicy] = useState<CollisionPolicy>("keep-both"),
    [classify, setClassify] = useState(false),
    [renameEnabled, setRenameEnabled] = useState(false),
    [destination, setDestination] = useState<FileSystemDirectoryHandle | null>(null),
    [destinationAnalysis, setDestinationAnalysis] = useState<DestinationAnalysis | null>(null),
    [destinationBusy, setDestinationBusy] = useState(false),
    [progress, setProgress] = useState<{ written: number; skipped: number; current: string } | null>(null),
    [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("name"),
    [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc"),
    [categoryFilter, setCategoryFilter] = useState("all"),
    [sourceFilter, setSourceFilter] = useState("all"),
    [selectionFilter, setSelectionFilter] = useState("all"),
    [minSize, setMinSize] = useState(""),
    [maxSize, setMaxSize] = useState(""),
    [filtersOpen, setFiltersOpen] = useState(false),
    [overrides, setOverrides] = useState<Record<string, BulkOverride>>({}),
    [bulkCategory, setBulkCategory] = useState(""),
    [bulkFolder, setBulkFolder] = useState(""),
    [bulkPrefix, setBulkPrefix] = useState(""),
    [folderMode, setFolderMode] = useState<"auto" | "choose">("choose"),
    [includeHidden, setIncludeHidden] = useState(false),
    [folderArchives, setFolderArchives] = useState<FolderArchive[]>([]),
    [preserveRoot, setPreserveRoot] = useState(true),
    [preserveEmpty, setPreserveEmpty] = useState(true),
    [profile, setProfile] = useState<ProfileId>("custom");
  const input = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    jsonInput = useRef<HTMLInputElement>(null),
    abortRef = useRef<AbortController | null>(null);
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
        setProfile(c.profile || "custom");
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
          profile,
        }),
      ),
    [rules, cats, rename, policy, classify, renameEnabled, profile],
  );
  const basePlanned = useMemo(
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
    planned = useMemo(() => basePlanned.map((entry) => {
      const override = overrides[entryKey(entry)];
      if (!override) return entry;
      const path = entry.planned || entry.name, parts = path.split("/"), file = parts.pop()!, renamed = override.prefix ? `${override.prefix}${file}` : file;
      return { ...entry, category: override.category || entry.category, planned: override.folder ? `${override.folder.replace(/^\/+|\/+$/g, "")}/${renamed}` : [...parts, renamed].join("/") };
    }), [basePlanned, overrides]),
    filtered = useMemo(() => planned.filter((e) => {
      const selected = !excluded.has(entryKey(e)), sizeMb = e.size / 1048576;
      return (e.planned || e.name).toLowerCase().includes(query.toLowerCase())
        && (categoryFilter === "all" || e.category === categoryFilter)
        && (sourceFilter === "all" || e.source === sourceFilter)
        && (selectionFilter === "all" || (selectionFilter === "selected" ? selected : !selected))
        && (!minSize || sizeMb >= Number(minSize)) && (!maxSize || sizeMb <= Number(maxSize));
    }).sort((a, b) => {
      const values = (e: SmartEntry) => sortBy === "size" ? e.size : sortBy === "date" ? (e.date?.getTime() || 0) : sortBy === "category" ? e.category : sortBy === "source" ? e.source : (e.planned || e.name).toLowerCase();
      const av = values(a), bv = values(b), result = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDirection === "asc" ? result : -result;
    }), [planned, excluded, query, categoryFilter, sourceFilter, selectionFilter, minSize, maxSize, sortBy, sortDirection]),
    selectedCount = planned.filter((e) => e.included !== false && !excluded.has(entryKey(e))).length,
    dupes = planned.filter((e) => e.collision).length,
    incomplete = planned.filter((e) => e.familyIncomplete).length,
    total = sources.reduce((s, f) => s + f.size, 0),
    tree = useMemo(() => {
      const m = new Map<string, SmartEntry[]>();
      for (const e of filtered) {
        const p = e.planned || e.name,
          f = p.includes("/") ? p.split("/").slice(0, -1).join("/") : "";
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
  async function processFolderArchives(items: FolderArchive[]) {
    const chosen = items.filter((item) => item.included);
    if (!chosen.length) { setError("Aucune archive sélectionnée dans ce dossier."); return; }
    setBusy(true); setError("");
    try {
      setSources(chosen.map((item) => item.file));
      const all: ArchiveEntry[] = [];
      for (const item of chosen) {
        const extracted = await readArchive(item.file);
        all.push(...extracted.map((entry) => ({ ...entry, source: item.path })));
      }
      setEntries(await hashEntries(all));
      setFolderArchives([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Analyse récursive impossible"); }
    finally { setBusy(false); }
  }
  async function addFolder(l: FileList | null) {
    if (!l?.length) return;
    const found = Array.from(l).map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, included: true }))
      .filter((item) => archivePattern.test(item.file.name) && (includeHidden || !hiddenOrSystem(item.path)));
    if (!found.length) { setError("Aucune archive compatible trouvée dans ce dossier."); return; }
    if (folderMode === "auto") await processFolderArchives(found);
    else setFolderArchives(found);
  }
  async function addCreateFolder(l: FileList | null) {
    if (!l?.length) return;
    setBusy(true); setError("");
    try {
      const files = Array.from(l), first = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || files[0].name;
      const rootName = first.split("/")[0];
      const imported = await Promise.all(files.map(async (file) => {
        const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const path = relative.split("/").slice(1).join("/");
        return { name: path || file.name, size: file.size, data: new Uint8Array(await file.arrayBuffer()), date: new Date(file.lastModified), source: rootName, rootless: !preserveRoot };
      }));
      setSources(files); setEntries(await hashEntries(imported));
    } catch (e) { setError(e instanceof Error ? e.message : "Importation du dossier impossible"); }
    finally { setBusy(false); }
  }
  async function pickCompleteCreateFolder() {
    const picker = (window as any).showDirectoryPicker as undefined | (() => Promise<FileSystemDirectoryHandle>);
    if (!picker) { folderInput.current?.click(); return; }
    try {
      const root = await picker(), files: File[] = [], imported: ArchiveEntry[] = [];
      const walk = async (dir: FileSystemDirectoryHandle, parts: string[]) => {
        if (preserveEmpty && parts.length) imported.push({ name: parts.join("/"), size: 0, data: new Uint8Array(), source: root.name, directory: true, rootless: !preserveRoot });
        for await (const [itemName, handle] of (dir as any).entries()) {
          if (handle.kind === "directory") await walk(handle, [...parts, itemName]);
          else {
            const file = await handle.getFile(); files.push(file);
            imported.push({ name: [...parts, itemName].join("/"), size: file.size, data: new Uint8Array(await file.arrayBuffer()), date: new Date(file.lastModified), source: root.name, rootless: !preserveRoot });
          }
        }
      };
      setBusy(true); setError(""); await walk(root, []);
      setSources(files); setEntries(await hashEntries(imported));
    } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Importation du dossier impossible"); }
    finally { setBusy(false); }
  }
  function reset(m?: Mode) {
    if (m) setMode(m);
    setSources([]);
    setEntries([]);
    setError("");
    setDestinationAnalysis(null);
    setExcluded(new Set());
    setOverrides({});
    setFolderArchives([]);
  }

  function applyBulk(kind: "category" | "folder" | "prefix") {
    const value = kind === "category" ? bulkCategory : kind === "folder" ? bulkFolder : bulkPrefix;
    if (!value.trim()) return;
    setOverrides((current) => {
      const next = { ...current };
      planned.filter((entry) => !excluded.has(entryKey(entry))).forEach((entry) => {
        next[entryKey(entry)] = { ...next[entryKey(entry)], [kind]: value.trim() };
      });
      return next;
    });
  }
  function applyProfile(id: ProfileId) {
    setProfile(id);
    if (id === "custom") return;
    const selected = PROFILES.find((item) => item.id === id)!;
    const profileCategories = id === "media" ? ["Images", "Audio et vidéo"] : id === "science" ? ["Données", "CAO, BIM et scientifique"] : [selected.category!];
    setClassify(true);
    setRules([
      ...profileCategories.map((category, index) => ({ id: `profile-${id}-${index}`, priority: index + 1, enabled: true, field: "category" as const, operator: "equals" as const, value: category, destination: `{projet}/${selected.folder}/{category}/{annee}` })),
      { id: `profile-${id}-other`, priority: 99, enabled: true, field: "name", operator: "contains", value: "", destination: `{projet}/Autres/{category}` },
    ]);
    setRename((current) => ({ ...current, project: selected.name }));
  }

  function setAllSelection(action: "all" | "none" | "invert") {
    setExcluded((current) => {
      if (action === "all") return new Set();
      if (action === "none") return new Set(planned.map(entryKey));
      return new Set(planned.filter((entry) => !current.has(entryKey(entry))).map(entryKey));
    });
  }
  function toggleEntry(entry: SmartEntry) {
    setExcluded((current) => {
      const next = new Set(current), key = entryKey(entry);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function toggleFolder(folder: string) {
    const children = planned.filter((entry) => {
      const path = entry.planned || entry.name;
      return folder ? path.startsWith(`${folder}/`) : !path.includes("/");
    });
    const exclude = children.some((entry) => !excluded.has(entryKey(entry)));
    setExcluded((current) => {
      const next = new Set(current);
      children.forEach((entry) => exclude ? next.add(entryKey(entry)) : next.delete(entryKey(entry)));
      return next;
    });
  }

  async function chooseDestination(runAfter = false) {
    setError("");
    try {
      const handle = await pickDestination();
      setDestination(handle);
      if (planned.length) {
        setDestinationBusy(true);
        setDestinationAnalysis(await analyzeDestination(handle, planned.filter((e) => e.included !== false && !excluded.has(entryKey(e)))));
      }
      if (runAfter) await produce(true, handle);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Dossier inaccessible");
    } finally { setDestinationBusy(false); }
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
  async function produce(folder = false, selected?: FileSystemDirectoryHandle) {
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
      const u = planned.filter((e) => e.included !== false && !excluded.has(entryKey(e)));
      if (folder) {
        const root = selected || destination;
        if (!root) { await chooseDestination(true); return; }
        const analysis = await analyzeDestination(root, u);
        setDestinationAnalysis(analysis);
        const dangerous = analysis.conflicts.filter((c) => c.kind !== "same-content-other-path");
        if (policy === "replace-confirm" && dangerous.length && !confirm(`Remplacer explicitement ${dangerous.length} fichier(s) existant(s) ?`)) return;
        const controller = new AbortController(); abortRef.current = controller;
        setProgress({ written: 0, skipped: 0, current: "Préparation" });
        const journal = { ...j, destination: root.name, written: 0, skipped: 0 };
        const result = await writeToDestination(root, u, policy, controller.signal, (written, skipped, current) => {
          setProgress({ written, skipped, current });
          localStorage.setItem("archiveflow-journal", JSON.stringify({ ...journal, status: "en cours", written, skipped, current }));
        });
        localStorage.setItem("archiveflow-journal", JSON.stringify({ ...journal, ...result, status: "terminé" }));
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
      const cancelled = e instanceof DOMException && e.name === "AbortError";
      setError(cancelled ? "Opération annulée. Les fichiers déjà écrits sont conservés dans le journal." : e instanceof Error ? e.message : "Opération impossible");
    } finally {
      abortRef.current = null;
      setProgress(null);
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
          <button className="formats" onClick={() => setFormatsOpen(true)} title="Voir la matrice complète des formats">
            <span>
              ZIP <b>Complet</b>
            </span>
            <span>
              TAR/GZIP <b>Complet</b>
            </span>
            <span>
              7Z/RAR <b>Extraction</b>
            </span>
            <small>Voir les détails</small>
          </button>
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
              <input ref={folderInput} hidden type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} onChange={(e) => mode === "create" ? addCreateFolder(e.target.files) : addFolder(e.target.files)} />
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
              {mode === "extract" && (
                <div className="folderimport">
                  <button onClick={() => folderInput.current?.click()}><FolderTree />Importer un dossier récursivement</button>
                  <label><input type="radio" checked={folderMode === "choose"} onChange={() => setFolderMode("choose")} /> Choisir les archives avant analyse</label>
                  <label><input type="radio" checked={folderMode === "auto"} onChange={() => setFolderMode("auto")} /> Analyser automatiquement</label>
                  <label title="Recommandé pour éviter les fichiers inutiles et sensibles"><input type="checkbox" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} /> Inclure les dossiers cachés et système</label>
                </div>
              )}
              {mode === "create" && (
                <div className="folderimport createfolder">
                  <button onClick={pickCompleteCreateFolder}><FolderTree />Importer un dossier complet</button>
                  <label><input type="checkbox" checked={preserveRoot} onChange={(e) => setPreserveRoot(e.target.checked)} /> Conserver le dossier racine</label>
                  <label><input type="checkbox" checked={preserveEmpty} onChange={(e) => setPreserveEmpty(e.target.checked)} /> Conserver les dossiers vides</label>
                  <small>Vous pourrez exclure les fichiers ou sous-dossiers dans la simulation.</small>
                </div>
              )}
              {folderArchives.length > 0 && (
                <div className="foldercandidates">
                  <b>{folderArchives.filter((item) => item.included).length} archive(s) sélectionnée(s)</b>
                  <div>{folderArchives.map((item, index) => <label key={item.path}><input type="checkbox" checked={item.included} onChange={() => setFolderArchives((current) => current.map((value, i) => i === index ? { ...value, included: !value.included } : value))} /><span>{item.path}</span></label>)}</div>
                  <footer><button onClick={() => setFolderArchives((current) => current.map((item) => ({ ...item, included: true })))}>Tout</button><button onClick={() => setFolderArchives([])}>Annuler</button><button onClick={() => processFolderArchives(folderArchives)}>Analyser la sélection</button></footer>
                </div>
              )}
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
              <label className="profilepicker">
                Profil métier
                <select value={profile} onChange={(e) => applyProfile(e.target.value as ProfileId)}>
                  {PROFILES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
                <small>{PROFILES.find((item) => item.id === profile)?.description}</small>
              </label>
              {profile !== "custom" && <div className="profileactive"><ShieldCheck /><span><b>Profil {PROFILES.find((item) => item.id === profile)?.name} actif</b><small>Règles appliquées automatiquement et modifiables.</small></span></div>}
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
              <div className="destinationchoice">
                <button className="destinationbtn" disabled={destinationBusy} onClick={() => chooseDestination(false)}><HardDrive />{destination ? `Dossier : ${destination.name}` : "Choisir le dossier maintenant"}</button>
                {destination && <button className="removedestination" title="Retirer le dossier choisi" onClick={() => { setDestination(null); setDestinationAnalysis(null); }}><XCircle /></button>}
              </div>
              {destination && <small className="destinationhint">Vous pourrez aussi le changer après la simulation.</small>}
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
              <button className={filtersOpen ? "on" : ""} onClick={() => setFiltersOpen(!filtersOpen)}><Filter />Filtres</button>
            </div>
            {filtersOpen && planned.length > 0 && (
              <div className="advancedfilters">
                <label>Tri<select value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="name">Nom</option><option value="size">Taille</option><option value="date">Date</option><option value="category">Catégorie</option><option value="source">Archive source</option></select></label>
                <label>Ordre<select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as "asc" | "desc")}><option value="asc">Croissant</option><option value="desc">Décroissant</option></select></label>
                <label>Catégorie<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">Toutes</option>{[...new Set(planned.map((e) => e.category))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>Archive<select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="all">Toutes</option>{[...new Set(planned.map((e) => e.source))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>Sélection<select value={selectionFilter} onChange={(e) => setSelectionFilter(e.target.value)}><option value="all">Tous</option><option value="selected">Inclus</option><option value="excluded">Exclus</option></select></label>
                <label>Taille min. (Mo)<input type="number" min="0" value={minSize} onChange={(e) => setMinSize(e.target.value)} /></label>
                <label>Taille max. (Mo)<input type="number" min="0" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} /></label>
                <button onClick={() => { setQuery(""); setCategoryFilter("all"); setSourceFilter("all"); setSelectionFilter("all"); setMinSize(""); setMaxSize(""); setSortBy("name"); setSortDirection("asc"); }}>Réinitialiser</button>
              </div>
            )}
            {planned.length > 0 && (
              <div className="selectionbar">
                <strong>{selectedCount} sur {planned.length} sélectionné(s)</strong>
                <button onClick={() => setAllSelection("all")}>Tout sélectionner</button>
                <button onClick={() => setAllSelection("none")}>Tout exclure</button>
                <button onClick={() => setAllSelection("invert")}>Inverser</button>
              </div>
            )}
            {planned.length > 0 && (
              <div className="bulkbar">
                <span><ArrowUpDown /><b>Modification en masse</b><small>sur les {selectedCount} éléments inclus</small></span>
                <div><select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}><option value="">Catégorie…</option>{[...DEFAULT_CATEGORIES, ...cats].map((category) => <option key={category.id}>{category.name}</option>)}</select><button onClick={() => applyBulk("category")}>Appliquer</button></div>
                <div><input placeholder="Déplacer vers le dossier…" value={bulkFolder} onChange={(e) => setBulkFolder(e.target.value)} /><button onClick={() => applyBulk("folder")}>Déplacer</button></div>
                <div><input placeholder="Préfixe de renommage…" value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} /><button onClick={() => applyBulk("prefix")}>Renommer</button></div>
              </div>
            )}
            {error && (
              <div className="v2error">
                <Info />
                {error}
              </div>
            )}
            {destination && planned.length > 0 && (
              <div className="destinationcheck">
                <HardDrive />
                <div>
                  <b>{destinationBusy ? "Analyse de la destination…" : `Destination vérifiée : ${destination.name}`}</b>
                  <small>{destinationAnalysis ? `${destinationAnalysis.conflicts.length} signalement(s) • ${formatBytes(destinationAnalysis.requiredBytes)} requis • espace libre non accessible par le navigateur` : "L’analyse sera effectuée avant toute écriture."}</small>
                </div>
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
                      <input
                        type="checkbox"
                        aria-label={`Inclure le dossier ${f || "Racine"}`}
                        checked={planned.filter((entry) => {
                          const path = entry.planned || entry.name;
                          return f ? path.startsWith(`${f}/`) : !path.includes("/");
                        }).every((entry) => !excluded.has(entryKey(entry)))}
                        onChange={() => toggleFolder(f)}
                      />
                      <FolderOpen />
                      {f ? f.replaceAll("/", " / ") : "Racine"}
                      <span>{is.length}</span>
                    </h3>
                    {is.map((e, i) => (
                      <Row e={e} excluded={excluded.has(entryKey(e))} toggle={() => toggleEntry(e)} key={i} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="tree listview">
                {filtered.map((e, i) => (
                  <Row e={e} excluded={excluded.has(entryKey(e))} toggle={() => toggleEntry(e)} key={i} />
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
                disabled={!selectedCount || busy}
                onClick={() => produce(true)}
              >
                {destination ? "Enregistrer dans ce dossier" : "Choisir un dossier"}
              </button>
              {busy && progress && <button className="cancelbtn" onClick={() => abortRef.current?.abort()}><XCircle />Annuler</button>}
              <button
                className="downloadbtn"
                disabled={!selectedCount || busy}
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
      {formatsOpen && (
        <div className="modalback formatmodalback" onClick={() => setFormatsOpen(false)}>
          <div className="formatpanel" onClick={(e) => e.stopPropagation()}>
            <header>
              <div><h2>Formats et limitations</h2><p>Ce que cette version gratuite peut réellement faire dans votre navigateur.</p></div>
              <button onClick={() => setFormatsOpen(false)}>×</button>
            </header>
            <div className="formatlegend"><span><i className="support-complet" />Complet</span><span><i className="support-partiel" />Partiel</span><span><i className="support-non" />Non disponible</span></div>
            <div className="formattablewrap">
              <table className="formattable">
                <thead><tr><th>Format</th><th>Extensions</th><th>Extraire</th><th>Créer</th><th>Chiffré</th><th>Limitation actuelle</th></tr></thead>
                <tbody>{FORMAT_MATRIX.map((item) => <tr key={item.format}><td><b>{item.format}</b></td><td><code>{item.extensions}</code></td><td><Support value={item.read} /></td><td><Support value={item.create} /></td><td>{item.encrypted}</td><td>{item.note}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="browserlimits"><Info /><div><b>Limites du mode web</b><p>Le traitement reste sur votre appareil. La mémoire disponible, la taille maximale et le choix direct d’un dossier dépendent du navigateur. Chrome et Edge offrent la meilleure prise en charge des dossiers ; sur mobile et les autres navigateurs, le téléchargement classique reste disponible.</p></div></div>
            <footer><span><ShieldCheck />Toutes les fonctions affichées sont gratuites.</span><button onClick={() => setFormatsOpen(false)}>J’ai compris</button></footer>
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
function Support({ value }: { value: FormatSupport["read"] }) {
  return <span className={`support support-${value.toLowerCase()}`}>{value === "Non" ? <XCircle /> : <CheckCircle2 />}{value}</span>;
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
function Row({ e, excluded, toggle }: { e: SmartEntry; excluded: boolean; toggle: () => void }) {
  const c: Record<string, string> = {
    "same-name-same-content": "Même nom et contenu",
    "same-name-different-content": "Même nom, contenu différent",
    "same-content-different-name": "Contenu identique",
  };
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
        <span className="dup">{c[e.collision]}</span>
      ) : e.contentMatch ? (
        <span className="shared">Identique dans une autre archive</span>
      ) : (
        <CheckCircle2 />
      )}
    </div>
  );
}
