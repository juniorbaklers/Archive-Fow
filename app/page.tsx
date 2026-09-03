"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileArchive,
  FolderOpen,
  FolderTree,
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
  DEFAULT_SECURITY_LIMITS,
  SecurityLimits,
  ZipCompression,
  formatBytes,
  hashEntries,
  makeGzip,
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
import { TopBar } from "@/components/archive/TopBar";
import { EntryRow } from "@/components/archive/EntryRow";
import { FormatMatrixModal } from "@/components/archive/FormatMatrixModal";
import { HistoryPanel, HistoryEntry } from "@/components/archive/HistoryPanel";
import { SettingsModal, SettingsTab } from "@/components/archive/SettingsModal";
type Mode = "extract" | "create";
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
  windowsSafePaths: false,
  relativePathLimit: 180,
};
const entryKey = (entry: ArchiveEntry) => `${entry.source}\u0000${entry.name}`;
type BulkOverride = { category?: string; folder?: string; prefix?: string };
type FolderArchive = { file: File; path: string; included: boolean };
type SaveReport = { detected: number; selected: number; saved: number; skipped: number; complete: boolean };
type ArchiveReport = { id: string; name: string; root: string; count: number; status: "ok" | "empty" | "error"; message?: string };
type PathDecision = "ask" | "shorten" | "preserve";
type ProfileId = "custom" | "sig" | "documents" | "media" | "developer" | "cad" | "science";
const PROFILES: { id: ProfileId; name: string; category?: string; folder?: string; description: string; policy?: CollisionPolicy; security?: Partial<SecurityLimits> }[] = [
  { id: "custom", name: "Personnalisé", description: "Vos catégories et règles actuelles" },
  { id: "sig", name: "SIG", category: "SIG", folder: "SIG", description: "Shapefiles, GeoJSON, GPKG, QGIS et données géographiques", policy: "keep-both", security: { maxDepth: 30 } },
  { id: "documents", name: "Documents", category: "Bureautique", folder: "Documents", description: "Documents, PDF, tableurs et présentations", policy: "keep-both" },
  { id: "media", name: "Médias", category: "Audio et vidéo", folder: "Médias", description: "Images, audio, vidéo et fichiers associés", policy: "keep-both", security: { maxFiles: 100000, maxExpandedBytes: 30 * 1024 ** 3 } },
  { id: "developer", name: "Développeur", category: "Développement", folder: "Code", description: "Code source, configurations et documentation", policy: "keep-both", security: { maxFiles: 100000 } },
  { id: "cad", name: "CAO / BIM", category: "CAO, BIM et scientifique", folder: "CAO-BIM", description: "Plans, modèles, maquettes et ressources techniques", policy: "keep-both", security: { maxExpandedBytes: 50 * 1024 ** 3 } },
  { id: "science", name: "Scientifique", category: "Données", folder: "Données-scientifiques", description: "Jeux de données, bases, mesures et résultats", policy: "keep-both", security: { maxFiles: 200000, maxExpandedBytes: 50 * 1024 ** 3 } },
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
    [entries, setEntries] = useState<ArchiveEntry[]>([]),
    [output, setOutput] = useState("ZIP"),
    [zipCompression, setZipCompression] = useState<ZipCompression>("deflate"),
    [name, setName] = useState("archive-organisee"),
    [view, setView] = useState<"tree" | "list">("tree"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [historyOpen, setHistoryOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [formatsOpen, setFormatsOpen] = useState(false),
    [preserveAll, setPreserveAll] = useState(true),
    [lastReport, setLastReport] = useState<SaveReport | null>(null),
    [archiveReports, setArchiveReports] = useState<ArchiveReport[]>([]),
    [pathDecision, setPathDecision] = useState<PathDecision>("ask"),
    [security, setSecurity] = useState<SecurityLimits>(DEFAULT_SECURITY_LIMITS),
    [tab, setTab] = useState<SettingsTab>("rules"),
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
    [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null),
    [nameWarning, setNameWarning] = useState(""),
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
        setPreserveAll(c.preserveAll !== false);
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
          preserveAll,
        }),
      ),
    [rules, cats, rename, policy, classify, renameEnabled, profile, preserveAll],
  );
  const effectivePolicy: CollisionPolicy = preserveAll && policy === "skip" ? "keep-both" : policy;
  const basePlanned = useMemo(
      () =>
        enrichEntries(
          entries,
          rules,
          [...DEFAULT_CATEGORIES, ...cats],
          { ...rename, windowsSafePaths: mode === "create" ? false : pathDecision === "shorten" },
          effectivePolicy,
          classify,
          mode === "create" ? false : renameEnabled,
        ),
      [entries, rules, cats, rename, effectivePolicy, classify, renameEnabled, pathDecision, mode],
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
    shortenedPaths = planned.filter((e) => e.pathAdjusted).length,
    protectedFiles = planned.filter((e) => e.integrityProtected).length,
    unsafeProtectedPaths = planned.filter((e) => e.pathUnsafe).length,
    longPathCandidates = planned.filter((e) => e.needsPathDecision).length,
    quarantinedCount = planned.filter((e) => e.quarantined).length,
    selectableFileCount = planned.filter((e) => e.included !== false && !excluded.has(entryKey(e)) && !e.directory).length,
    total = entries.reduce((s, e) => s + (e.directory ? 0 : e.size), 0),
    tree = useMemo(() => {
      const m = new Map<string, SmartEntry[]>();
      for (const e of filtered) {
        const p = e.planned || e.name,
          f = p.includes("/") ? p.split("/").slice(0, -1).join("/") : "";
        m.set(f, [...(m.get(f) || []), e]);
      }
      return [...m];
    }, [filtered]),
    sourceGroups = useMemo(() => {
      const m = new Map<string, { count: number; size: number }>();
      for (const e of entries) {
        if (e.directory) continue;
        const g = m.get(e.source) || { count: 0, size: 0 };
        g.count += 1;
        g.size += e.size;
        m.set(e.source, g);
      }
      return [...m].map(([source, g]) => ({ source, ...g }));
    }, [entries]);
  async function loadEntries(list: ArchiveEntry[]) {
    const hashed = await hashEntries(list);
    setEntries(hashed);
    const quarantinedKeys = hashed.filter((e) => e.quarantined).map(entryKey);
    if (quarantinedKeys.length) setExcluded((prev) => new Set([...prev, ...quarantinedKeys]));
    return hashed;
  }
  async function addFiles(l: FileList | null) {
    if (!l?.length) return;
    setBusy(true);
    setError("");
    setNameWarning("");
    setLastReport(null);
    setPathDecision("ask");
    setAnalyzeProgress({ done: 0, total: l.length });
    try {
      const fs = Array.from(l);
      let all: ArchiveEntry[] = [];
      if (mode === "extract") {
        setEntries([]);
        const baseNames = fs.map((file) => file.name.replace(/\.(tar\.gz|tgz|zip|tar|gz|gzip|7z|rar)$/i, "") || "Archive"), totals = new Map<string, number>();
        baseNames.forEach((base) => totals.set(base.toLowerCase(), (totals.get(base.toLowerCase()) || 0) + 1));
        const seen = new Map<string, number>(), reports: ArchiveReport[] = [];
        for (let index = 0; index < fs.length; index += 1) {
          const f = fs[index], base = baseNames[index], key = base.toLowerCase(), occurrence = (seen.get(key) || 0) + 1;
          seen.set(key, occurrence);
          const root = (totals.get(key) || 0) > 1 ? `${base}__archive_${occurrence}` : base;
          try {
            const extracted = await readArchive(f, security), identified = extracted.map((entry) => ({ ...entry, source: root }));
            all.push(...identified);
            reports.push({ id: `${f.name}-${index}`, name: f.name, root, count: identified.length, status: identified.length ? "ok" : "empty", message: identified.length ? undefined : "Aucun fichier trouvé" });
          } catch (archiveError) {
            reports.push({ id: `${f.name}-${index}`, name: f.name, root, count: 0, status: "error", message: archiveError instanceof Error ? archiveError.message : "Lecture impossible" });
          }
          setAnalyzeProgress({ done: index + 1, total: fs.length });
        }
        setArchiveReports(reports);
        const failures = reports.filter((report) => report.status !== "ok");
        if (failures.length) setError(`${failures.length} archive(s) n’ont pas été entièrement analysées. Consultez le bilan par archive ci-dessous.`);
        const duplicateBases = [...new Set(baseNames.filter((base) => (totals.get(base.toLowerCase()) || 0) > 1))];
        if (duplicateBases.length) setNameWarning(`Attention : plusieurs archives sélectionnées portent le même nom (${duplicateBases.join(", ")}). Elles ont été numérotées automatiquement pour éviter toute confusion — vérifiez qu’il ne s’agit pas d’une erreur de sélection. Vous pouvez tout de même continuer.`);
      } else {
        setArchiveReports([]);
        const existingNames = new Set(entries.filter((e) => !e.directory).map((e) => e.name.toLowerCase()));
        const duplicateNames = [...new Set(fs.filter((f) => existingNames.has(f.name.toLowerCase())).map((f) => f.name))];
        if (duplicateNames.length) setNameWarning(`Attention : ${duplicateNames.length > 1 ? "des fichiers portent des noms déjà ajoutés" : "un fichier porte un nom déjà ajouté"} (${duplicateNames.join(", ")}). Vérifiez qu’il ne s’agit pas d’une sélection en double. Vous pouvez tout de même continuer.`);
        let done = 0;
        const added = await Promise.all(
          fs.map(async (f) => {
            const entry = {
              name: f.name,
              size: f.size,
              data: new Uint8Array(await f.arrayBuffer()),
              date: new Date(f.lastModified),
              source: "Fichiers ajoutés",
            };
            done += 1;
            setAnalyzeProgress({ done, total: fs.length });
            return entry;
          }),
        );
        all = [...entries, ...added];
      }
      await loadEntries(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse impossible");
    } finally {
      setBusy(false);
      setAnalyzeProgress(null);
    }
  }
  async function processFolderArchives(items: FolderArchive[]) {
    const chosen = items.filter((item) => item.included);
    if (!chosen.length) { setError("Aucune archive sélectionnée dans ce dossier."); return; }
    setBusy(true); setError(""); setNameWarning(""); setAnalyzeProgress({ done: 0, total: chosen.length });
    try {
      setEntries([]);
      const bases = chosen.map((item) => item.path.replace(/\.(tar\.gz|tgz|zip|tar|gz|gzip|7z|rar)$/i, "")), totals = new Map<string, number>();
      bases.forEach((base) => totals.set(base.toLowerCase(), (totals.get(base.toLowerCase()) || 0) + 1));
      const seen = new Map<string, number>(), roots: string[] = [];
      for (const base of bases) {
        const key = base.toLowerCase(), occurrence = (seen.get(key) || 0) + 1;
        seen.set(key, occurrence);
        roots.push((totals.get(key) || 0) > 1 ? `${base}__archive_${occurrence}` : base);
      }
      const all: ArchiveEntry[] = [], reports: ArchiveReport[] = [];
      for (let index = 0; index < chosen.length; index += 1) {
        const item = chosen[index], root = roots[index];
        try {
          const extracted = await readArchive(item.file, security), identified = extracted.map((entry) => ({ ...entry, source: root }));
          all.push(...identified);
          reports.push({ id: `${item.path}-${index}`, name: item.path, root, count: identified.length, status: identified.length ? "ok" : "empty" });
        } catch (archiveError) {
          reports.push({ id: `${item.path}-${index}`, name: item.path, root, count: 0, status: "error", message: archiveError instanceof Error ? archiveError.message : "Lecture impossible" });
        }
        setAnalyzeProgress({ done: index + 1, total: chosen.length });
      }
      setArchiveReports(reports);
      await loadEntries(all);
      setFolderArchives([]);
      const duplicateBases = [...new Set(bases.filter((base) => (totals.get(base.toLowerCase()) || 0) > 1))];
      if (duplicateBases.length) setNameWarning(`Attention : plusieurs archives du dossier portent le même nom (${duplicateBases.join(", ")}). Elles ont été numérotées automatiquement pour éviter toute confusion — vérifiez qu’il ne s’agit pas d’une erreur de sélection. Vous pouvez tout de même continuer.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Analyse récursive impossible"); }
    finally { setBusy(false); setAnalyzeProgress(null); }
  }
  async function addFolder(l: FileList | null) {
    if (!l?.length) return;
    const found = Array.from(l).map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, included: true }))
      .filter((item) => archivePattern.test(item.file.name) && (includeHidden || !hiddenOrSystem(item.path)));
    if (!found.length) { setError("Aucune archive compatible trouvée dans ce dossier."); return; }
    if (folderMode === "auto") await processFolderArchives(found);
    else setFolderArchives(found);
  }
  function uniqueSourceName(base: string) {
    const used = new Set(entries.map((e) => e.source.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    setNameWarning(`Attention : un dossier nommé « ${base} » a déjà été ajouté. Le nouveau a été numéroté pour éviter toute confusion — vérifiez qu’il ne s’agit pas d’une sélection en double. Vous pouvez tout de même continuer.`);
    for (let n = 2; ; n += 1) {
      const candidate = `${base} (${n})`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
  }
  async function addCreateFolder(l: FileList | null) {
    if (!l?.length) return;
    setBusy(true); setError(""); setNameWarning(""); setAnalyzeProgress({ done: 0, total: l.length });
    try {
      const files = Array.from(l), first = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || files[0].name;
      const rootName = uniqueSourceName(first.split("/")[0]);
      let done = 0;
      const imported = await Promise.all(files.map(async (file) => {
        const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const path = relative.split("/").slice(1).join("/");
        const entry = { name: path || file.name, size: file.size, data: new Uint8Array(await file.arrayBuffer()), date: new Date(file.lastModified), source: rootName, rootless: !preserveRoot };
        done += 1;
        setAnalyzeProgress({ done, total: files.length });
        return entry;
      }));
      await loadEntries([...entries, ...imported]);
    } catch (e) { setError(e instanceof Error ? e.message : "Importation du dossier impossible"); }
    finally { setBusy(false); setAnalyzeProgress(null); }
  }
  async function pickCompleteCreateFolder() {
    const picker = (window as any).showDirectoryPicker as undefined | (() => Promise<FileSystemDirectoryHandle>);
    if (!picker) { folderInput.current?.click(); return; }
    try {
      const root = await picker();
      setNameWarning("");
      const rootName = uniqueSourceName(root.name), files: File[] = [], imported: ArchiveEntry[] = [];
      const walk = async (dir: FileSystemDirectoryHandle, parts: string[]) => {
        if (preserveEmpty && parts.length) imported.push({ name: parts.join("/"), size: 0, data: new Uint8Array(), source: rootName, directory: true, rootless: !preserveRoot });
        for await (const [itemName, handle] of (dir as any).entries()) {
          if (handle.kind === "directory") await walk(handle, [...parts, itemName]);
          else {
            const file = await handle.getFile(); files.push(file);
            imported.push({ name: [...parts, itemName].join("/"), size: file.size, data: new Uint8Array(await file.arrayBuffer()), date: new Date(file.lastModified), source: rootName, rootless: !preserveRoot });
            setAnalyzeProgress({ done: files.length, total: 0 });
          }
        }
      };
      setBusy(true); setError(""); setAnalyzeProgress({ done: 0, total: 0 }); await walk(root, []);
      await loadEntries([...entries, ...imported]);
    } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Importation du dossier impossible"); }
    finally { setBusy(false); setAnalyzeProgress(null); }
  }
  function reset(m?: Mode) {
    if (m) setMode(m);
    setEntries([]);
    setError("");
    setNameWarning("");
    setDestinationAnalysis(null);
    setExcluded(new Set());
    setOverrides({});
    setFolderArchives([]);
    setLastReport(null);
    setArchiveReports([]);
    setPathDecision("ask");
  }
  function removeSource(source: string) {
    setEntries((prev) => prev.filter((e) => e.source !== source));
    setArchiveReports((prev) => prev.filter((r) => r.root !== source));
    const prefix = `${source}\u0000`;
    setExcluded((prev) => new Set([...prev].filter((key) => !key.startsWith(prefix))));
    setOverrides((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(prefix))));
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
    if (selected.policy) setPolicy(selected.policy);
    if (selected.security) setSecurity((current) => ({ ...current, ...selected.security }));
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
  async function verifyProduced(data: Uint8Array, filename: string, mime: string, expectedCount: number, expectedBytes: number) {
    try {
      const reread = await readArchive(new File([data as BlobPart], filename, { type: mime }), security);
      const actualBytes = reread.reduce((sum, e) => sum + e.size, 0);
      return reread.length === expectedCount && actualBytes === expectedBytes;
    } catch {
      return false;
    }
  }
  async function produce(folder = false, selected?: FileSystemDirectoryHandle) {
    if (!planned.length) return;
    if (mode === "extract" && longPathCandidates && pathDecision === "ask") {
      setError("Choisissez d’abord comment traiter les chemins trop longs. Aucun nom ne sera raccourci sans votre autorisation.");
      return;
    }
    const failedArchives = archiveReports.filter((report) => report.status !== "ok");
    if (failedArchives.length) {
      setError(`Opération bloquée : ${failedArchives.length} archive(s) n’ont pas été correctement analysées. Aucun résultat incomplet ne sera créé.`);
      return;
    }
    const selectedEntries = planned.filter((e) => e.included !== false && !excluded.has(entryKey(e)));
    const outputFiles = selectedEntries.filter((e) => !e.directory), outputPaths = new Set(outputFiles.map((e) => (e.planned || e.name).toLowerCase()));
    setLastReport(null);
    if (outputPaths.size !== outputFiles.length) {
      setError(`Opération bloquée : ${outputFiles.length - outputPaths.size} fichier(s) partageraient encore le même chemin de sortie. Aucun fichier n’a été créé.`);
      return;
    }
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
        effectivePolicy === "replace-confirm" &&
        dupes &&
        !confirm("Confirmer le remplacement des conflits ?")
      )
        return;
      const u = selectedEntries;
      if (folder) {
        const root = selected || destination;
        if (!root) { await chooseDestination(false); return; }
        const analysis = await analyzeDestination(root, u);
        setDestinationAnalysis(analysis);
        const structural = analysis.conflicts.filter((c) => c.kind === "file-vs-folder" || c.kind === "folder-vs-file");
        if (structural.length) {
          setError(`Opération bloquée avant écriture : ${structural.length} conflit(s) fichier/dossier empêcheraient de conserver tous les éléments. Choisissez une autre destination ou renommez le dossier en conflit.`);
          return;
        }
        const dangerous = analysis.conflicts.filter((c) => c.kind !== "same-content-other-path");
        if (effectivePolicy === "replace-confirm" && dangerous.length && !confirm(`Remplacer explicitement ${dangerous.length} fichier(s) existant(s) ?`)) return;
        const controller = new AbortController(); abortRef.current = controller;
        setProgress({ written: 0, skipped: 0, current: "Préparation" });
        const journal = { ...j, destination: root.name, written: 0, skipped: 0 };
        const result = await writeToDestination(root, u, effectivePolicy, controller.signal, (written, skipped, current) => {
          setProgress({ written, skipped, current });
          localStorage.setItem("archiveflow-journal", JSON.stringify({ ...journal, status: "en cours", written, skipped, current }));
        });
        if (result.written + result.skipped !== u.length) throw Error("Contrôle d’intégrité échoué : le nombre d’éléments traités ne correspond pas à la sélection.");
        const savedFiles = Math.max(0, outputFiles.length - result.skipped);
        setLastReport({ detected: entries.filter((e) => !e.directory).length, selected: outputFiles.length, saved: savedFiles, skipped: result.skipped, complete: result.skipped === 0 && savedFiles === outputFiles.length });
        localStorage.setItem("archiveflow-journal", JSON.stringify({ ...journal, ...result, expected: u.length, status: result.skipped ? "terminé avec exclusions" : "terminé" }));
        if (result.skipped) setError(`${result.skipped} élément(s) n’ont pas été écrits en raison de la politique choisie ou d’un conflit de destination. Consultez la simulation avant de recommencer.`);
        hist("Organisation", "Dossier");
      } else {
        let d: Uint8Array, n: string, m: string;
        if (output === "GZIP") {
          if (outputFiles.length !== 1) {
            setError("GZIP ne peut compresser qu’un seul fichier à la fois. Choisissez TAR.GZ pour plusieurs fichiers.");
            return;
          }
          d = await makeGzip(outputFiles[0]);
          n = `${name}.gz`;
          m = "application/gzip";
        } else if (output === "TAR") {
          d = makeTar(u);
          n = `${name}.tar`;
          m = "application/x-tar";
        } else if (output === "TAR.GZ") {
          d = await makeTarGz(u);
          n = `${name}.tar.gz`;
          m = "application/gzip";
        } else {
          d = await makeZip(u, zipCompression);
          n = `${name}.zip`;
          m = "application/zip";
        }
        const expectedBytes = outputFiles.reduce((sum, e) => sum + e.size, 0);
        const verified = await verifyProduced(d, n, m, outputFiles.length, expectedBytes);
        if (!verified) throw Error("Contrôle d’intégrité échoué après la création : le contenu relu ne correspond pas à la sélection. Aucun fichier n’a été proposé au téléchargement.");
        dl(d, n, m);
        setLastReport({ detected: entries.filter((e) => !e.directory).length, selected: outputFiles.length, saved: outputFiles.length, skipped: 0, complete: true });
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
      <TopBar onOpenHistory={() => setHistoryOpen(true)} onOpenSettings={() => setSettings(true)} />
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
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
              />
              <input ref={folderInput} hidden type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} onChange={(e) => { (mode === "create" ? addCreateFolder(e.target.files) : addFolder(e.target.files)); e.target.value = ""; }} />
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
                  <small>Répétez « Ajouter des fichiers » ou « Importer un dossier complet » pour combiner plusieurs dossiers ou fichiers dans la même archive. Vous pourrez exclure les fichiers ou sous-dossiers dans la simulation.</small>
                </div>
              )}
              {folderArchives.length > 0 && (
                <div className="foldercandidates">
                  <b>{folderArchives.filter((item) => item.included).length} archive(s) sélectionnée(s)</b>
                  <div>{folderArchives.map((item, index) => <label key={item.path}><input type="checkbox" checked={item.included} onChange={() => setFolderArchives((current) => current.map((value, i) => i === index ? { ...value, included: !value.included } : value))} /><span>{item.path}</span></label>)}</div>
                  <footer><button onClick={() => setFolderArchives((current) => current.map((item) => ({ ...item, included: true })))}>Tout</button><button onClick={() => setFolderArchives([])}>Annuler</button><button onClick={() => processFolderArchives(folderArchives)}>Analyser la sélection</button></footer>
                </div>
              )}
              {sourceGroups.length > 0 && (
                <>
                  {sourceGroups.length > 1 && (
                    <div className="source-summary">
                      <b>{sourceGroups.length}</b>
                      <span>
                        éléments au total<small>{formatBytes(total)}</small>
                      </span>
                      <button title="Tout retirer" onClick={() => reset()}>
                        <Trash2 />
                      </button>
                    </div>
                  )}
                  {sourceGroups.map((g) => (
                    <div className="source-summary" key={g.source}>
                      <b>{g.count}</b>
                      <span>
                        {g.source}<small>{formatBytes(g.size)}</small>
                      </span>
                      <button title="Retirer" onClick={() => removeSource(g.source)}>
                        <Trash2 />
                      </button>
                    </div>
                  ))}
                </>
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
              {profile !== "custom" && <div className="profileactive"><ShieldCheck /><span><b>Profil {PROFILES.find((item) => item.id === profile)?.name} actif</b><small>Règles, politique de doublons et seuils de sécurité appliqués automatiquement — modifiables dans Paramètres.</small></span></div>}
              <label className="optioncheck">
                <input
                  type="checkbox"
                  checked={classify}
                  onChange={(e) => setClassify(e.target.checked)}
                />
                Activer le classement intelligent
              </label>
              {mode === "extract" && (
                <>
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
                </>
              )}
              {mode === "create" && (
                <small className="why">Les noms de fichiers et de dossiers restent identiques lors de la création d’une archive.</small>
              )}
              <button className="enginebtn" onClick={() => setSettings(true)}>
                <Settings2 />
                Configurer les règles
              </button>
            </section>
            <section>
              <h2>
                <span>3</span>Destination
              </h2>
              {mode === "create" && (
                <>
                  <label>
                    Nom
                    <input value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <div className="formatselect">
                    {["ZIP", "TAR", "TAR.GZ", "GZIP"].map((f) => (
                      <button
                        className={output === f ? "on" : ""}
                        key={f}
                        disabled={f === "GZIP" && selectableFileCount !== 1}
                        title={f === "GZIP" && selectableFileCount !== 1 ? "GZIP ne compresse qu’un seul fichier à la fois" : undefined}
                        onClick={() => setOutput(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  {output === "ZIP" && (
                    <label className="optioncheck">
                      <input
                        type="checkbox"
                        checked={zipCompression === "deflate"}
                        onChange={(e) => setZipCompression(e.target.checked ? "deflate" : "store")}
                      />
                      Compresser le ZIP (plus lent, fichier plus petit)
                    </label>
                  )}
                </>
              )}
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
                  groupes incomplets • {shortenedPaths} chemins sécurisés
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
            {nameWarning && (
              <div className="pathwarning">
                <Info />
                <div>
                  <b>Doublon possible</b>
                  <small>{nameWarning}</small>
                </div>
                <button title="Fermer" onClick={() => setNameWarning("")} style={{ marginLeft: "auto", border: 0, background: "none", color: "inherit", fontSize: 16, cursor: "pointer" }}>×</button>
              </div>
            )}
            {archiveReports.length > 0 && (
              <div className="archivereports"><header><b>{archiveReports.length} archive(s) reçue(s)</b><small>{archiveReports.reduce((sum, report) => sum + report.count, 0)} fichier(s) détecté(s) au total</small></header>{archiveReports.map((report) => <div className={report.status} key={report.id}><FileArchive /><span><b>{report.name}</b><small>Dossier de sortie : {report.root}</small></span><strong>{report.status === "ok" ? `${report.count} fichiers` : report.message || "Archive vide"}</strong><button title="Retirer cette archive" onClick={() => removeSource(report.root)}><Trash2 /></button></div>)}</div>
            )}
            {mode === "extract" && longPathCandidates > 0 && pathDecision === "ask" && (
              <div className="pathdecision"><Info /><div><b>{longPathCandidates} chemin(s) potentiellement trop long(s)</b><small>ArchiveFlow ne renomme jamais un fichier. Vous choisissez si les noms de dossiers peuvent être raccourcis.</small><span><button onClick={() => setPathDecision("shorten")}>Raccourcir les dossiers (fichiers inchangés)</button><button onClick={() => setPathDecision("preserve")}>Conserver tous les noms originaux</button><button onClick={() => reset()}>Annuler</button></span></div></div>
            )}
            {mode === "extract" && longPathCandidates > 0 && pathDecision === "preserve" && (
              <div className="pathwarning"><ShieldCheck /><div><b>Noms originaux conservés</b><small>Choisissez une destination courte, par exemple C:\\SIG, afin d’éviter l’erreur Windows.</small></div></div>
            )}
            {mode === "extract" && longPathCandidates > 0 && pathDecision === "shorten" && (
              <div className="pathwarning"><ShieldCheck /><div><b>Dossiers raccourcis, fichiers inchangés</b><small>Seuls les noms de dossiers sont raccourcis ; aucun fichier n’est renommé. Vérifiez les liens internes si un projet SIG est concerné.</small></div></div>
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
            {shortenedPaths > 0 && (
              <div className="pathwarning"><ShieldCheck /><div><b>{shortenedPaths} chemin(s) trop long(s) corrigé(s)</b><small>Les noms sont raccourcis de façon stable, les extensions et les familles de fichiers restent cohérentes.</small></div></div>
            )}
            {protectedFiles > 0 && (
              <div className="integritynotice"><ShieldCheck /><div><b>Projet SIG protégé : {protectedFiles} élément(s)</b><small>Les noms internes sont conservés pour ne pas casser les liens des couches QGIS/ArcGIS.{unsafeProtectedPaths ? ` ${unsafeProtectedPaths} chemin(s) reste(nt) long(s) : choisissez un dossier de destination proche de la racine, par exemple C:\\SIG.` : ""}</small></div></div>
            )}
            {quarantinedCount > 0 && (
              <div className="v2error"><Info /><div><b>{quarantinedCount} élément(s) mis en quarantaine</b><small> — ratio de compression anormal (signature de bombe zip). Ils sont exclus par défaut ; ouvrez la fiche de chaque fichier pour les inclure quand même si vous êtes certain de leur origine.</small></div></div>
            )}
            {lastReport && (
              <div className={lastReport.complete ? "savereport complete" : "savereport incomplete"}><CheckCircle2 /><div><b>{lastReport.complete ? "Enregistrement complet" : "Enregistrement incomplet"}</b><small>{lastReport.detected} détecté(s) • {lastReport.selected} sélectionné(s) • {lastReport.saved} enregistré(s) • {lastReport.skipped} non enregistré(s)</small></div></div>
            )}
            {busy ? (
              <div className="v2empty">
                <RefreshCcw className="spin" />
                <b>Analyse en cours…</b>
                {analyzeProgress && analyzeProgress.total > 0 && (
                  <p>{Math.round((analyzeProgress.done / analyzeProgress.total) * 100)}% ({analyzeProgress.done}/{analyzeProgress.total})</p>
                )}
                {analyzeProgress && analyzeProgress.total === 0 && analyzeProgress.done > 0 && (
                  <p>{analyzeProgress.done} fichier(s) analysé(s)</p>
                )}
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
                      <EntryRow e={e} excluded={excluded.has(entryKey(e))} toggle={() => toggleEntry(e)} key={i} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="tree listview">
                {filtered.map((e, i) => (
                  <EntryRow e={e} excluded={excluded.has(entryKey(e))} toggle={() => toggleEntry(e)} key={i} />
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
              {mode === "create" && destination && (
                <label className="renamebeforesave">
                  Nom du fichier <small>(facultatif)</small>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="archive-organisee" />
                </label>
              )}
              <button
                className="folderbtn"
                disabled={!selectedCount || busy}
                onClick={() => (destination ? produce(true) : chooseDestination(false))}
              >
                {destination ? "Enregistrer dans ce dossier" : "Choisir un dossier"}
              </button>
              {busy && progress && <button className="cancelbtn" onClick={() => abortRef.current?.abort()}><XCircle />Annuler</button>}
              {mode === "create" && (
                <button
                  className="downloadbtn"
                  disabled={!selectedCount || busy}
                  onClick={() => produce()}
                >
                  <Download />
                  Télécharger
                </button>
              )}
            </div>
          </section>
        </div>
      </section>
      {historyOpen && (
        <HistoryPanel
          history={history}
          onClose={() => setHistoryOpen(false)}
          onClear={() => {
            setHistory([]);
            localStorage.removeItem("archiveflow-history");
          }}
        />
      )}
      {formatsOpen && <FormatMatrixModal onClose={() => setFormatsOpen(false)} />}
      {settings && (
        <SettingsModal
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
          preserveAll={preserveAll}
          setPreserveAll={setPreserveAll}
          exportJson={exportJson}
          importJson={importJson}
          jsonInput={jsonInput}
          security={security}
          setSecurity={setSecurity}
        />
      )}
    </main>
  );
}
