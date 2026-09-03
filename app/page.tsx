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
  bucketBySize,
  detectMultiPart,
  estimateProcessing,
  extractNestedArchives,
  formatBytes,
  formatDuration,
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
import { HomeScreen } from "@/components/archive/HomeScreen";
import { SettingsModal, SettingsTab } from "@/components/archive/SettingsModal";
import { Locale, TranslationKey, translate } from "./i18n";
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
export type ProfileId = "custom" | "sig" | "documents" | "media" | "developer" | "cad" | "science";
export const PROFILES: { id: ProfileId; nameKey: TranslationKey; category?: string; folder?: string; descriptionKey: TranslationKey; policy?: CollisionPolicy; security?: Partial<SecurityLimits> }[] = [
  { id: "custom", nameKey: "profile.custom.name", descriptionKey: "profile.custom.desc" },
  { id: "sig", nameKey: "profile.sig.name", category: "SIG", folder: "SIG", descriptionKey: "profile.sig.desc", policy: "keep-both", security: { maxDepth: 30 } },
  { id: "documents", nameKey: "profile.documents.name", category: "Bureautique", folder: "Documents", descriptionKey: "profile.documents.desc", policy: "keep-both" },
  { id: "media", nameKey: "profile.media.name", category: "Audio et vidéo", folder: "Médias", descriptionKey: "profile.media.desc", policy: "keep-both", security: { maxFiles: 100000, maxExpandedBytes: 30 * 1024 ** 3 } },
  { id: "developer", nameKey: "profile.developer.name", category: "Développement", folder: "Code", descriptionKey: "profile.developer.desc", policy: "keep-both", security: { maxFiles: 100000 } },
  { id: "cad", nameKey: "profile.cad.name", category: "CAO, BIM et scientifique", folder: "CAO-BIM", descriptionKey: "profile.cad.desc", policy: "keep-both", security: { maxExpandedBytes: 50 * 1024 ** 3 } },
  { id: "science", nameKey: "profile.science.name", category: "Données", folder: "Données-scientifiques", descriptionKey: "profile.science.desc", policy: "keep-both", security: { maxFiles: 200000, maxExpandedBytes: 50 * 1024 ** 3 } },
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
function spaceStatusText(status: DestinationAnalysis["spaceStatus"], t: (key: TranslationKey, vars?: Record<string, string | number>) => string) {
  if (status.kind === "unknown") return t("space.unknown");
  const label = t("space.available", { size: formatBytes(status.availableBytes) });
  return status.kind === "low" ? `${label}${t("space.lowSuffix")}` : label;
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
    [theme, setTheme] = useState<"light" | "dark">("light"),
    [locale, setLocale] = useState<Locale>("fr"),
    [screen, setScreen] = useState<"home" | "workspace">("home"),
    [maxArchiveSizeMb, setMaxArchiveSizeMb] = useState(""),
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
    [extractNested, setExtractNested] = useState(false),
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
      const storedTheme = localStorage.getItem("archiveflow-theme");
      if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
      else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
      const storedLocale = localStorage.getItem("archiveflow-locale");
      if (storedLocale === "fr" || storedLocale === "en") setLocale(storedLocale);
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
  useEffect(() => {
    try { localStorage.setItem("archiveflow-theme", theme); } catch {}
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem("archiveflow-locale", locale); } catch {}
  }, [locale]);
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
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
          locale,
        ),
      [entries, rules, cats, rename, effectivePolicy, classify, renameEnabled, pathDecision, mode, locale],
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
    selectedFiles = planned.filter((e) => e.included !== false && !excluded.has(entryKey(e)) && !e.directory),
    selectableFileCount = selectedFiles.length,
    total = entries.reduce((s, e) => s + (e.directory ? 0 : e.size), 0),
    estimate = useMemo(
      () => estimateProcessing(selectedFiles, mode === "create" && (output === "ZIP" ? zipCompression === "deflate" : output !== "TAR")),
      [selectedFiles, mode, output, zipCompression],
    ),
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
      const rawFiles = Array.from(l);
      let all: ArchiveEntry[] = [];
      if (mode === "extract") {
        setEntries([]);
        const { groups, rest } = detectMultiPart(rawFiles, locale);
        const unsupportedReports: ArchiveReport[] = groups
          .filter((g) => g.kind === "unsupported")
          .map((g, i) => ({ id: `multipart-${i}`, name: g.files.map((f) => f.name).join(", "), root: g.files[0].name, count: 0, status: "error" as const, message: g.reason }));
        const reconstructed = groups
          .filter((g): g is Extract<typeof g, { kind: "concat" }> => g.kind === "concat")
          .map((g) => new File(g.files, g.baseName));
        const fs = [...rest, ...reconstructed];
        const baseNames = fs.map((file) => file.name.replace(/\.(tar\.gz|tgz|zip|tar|gz|gzip|7z|rar)$/i, "") || "Archive"), totals = new Map<string, number>();
        baseNames.forEach((base) => totals.set(base.toLowerCase(), (totals.get(base.toLowerCase()) || 0) + 1));
        const seen = new Map<string, number>(), reports: ArchiveReport[] = [...unsupportedReports];
        for (let index = 0; index < fs.length; index += 1) {
          const f = fs[index], base = baseNames[index], key = base.toLowerCase(), occurrence = (seen.get(key) || 0) + 1;
          seen.set(key, occurrence);
          const root = (totals.get(key) || 0) > 1 ? `${base}__archive_${occurrence}` : base;
          try {
            const extracted = await readArchive(f, security, locale);
            let identified = extracted.map((entry) => ({ ...entry, source: root }));
            if (extractNested) identified = await extractNestedArchives(identified, security);
            all.push(...identified);
            reports.push({ id: `${f.name}-${index}`, name: f.name, root, count: identified.length, status: identified.length ? "ok" : "empty", message: identified.length ? undefined : t("msg.noFileFoundInArchive") });
          } catch (archiveError) {
            reports.push({ id: `${f.name}-${index}`, name: f.name, root, count: 0, status: "error", message: archiveError instanceof Error ? archiveError.message : t("msg.readImpossible") });
          }
          setAnalyzeProgress({ done: index + 1, total: fs.length });
        }
        setArchiveReports(reports);
        const failures = reports.filter((report) => report.status !== "ok");
        if (failures.length) setError(t("msg.archivesNotFullyAnalyzed", { count: failures.length }));
        const duplicateBases = [...new Set(baseNames.filter((base) => (totals.get(base.toLowerCase()) || 0) > 1))];
        if (duplicateBases.length) setNameWarning(t("msg.duplicateArchiveNames", { names: duplicateBases.join(", ") }));
      } else {
        setArchiveReports([]);
        const existingNames = new Set(entries.filter((e) => !e.directory).map((e) => e.name.toLowerCase()));
        const duplicateNames = [...new Set(rawFiles.filter((f) => existingNames.has(f.name.toLowerCase())).map((f) => f.name))];
        if (duplicateNames.length) setNameWarning(t("msg.duplicateFileNames", { which: t(duplicateNames.length > 1 ? "msg.duplicateFileNamesPlural" : "msg.duplicateFileNameSingular"), names: duplicateNames.join(", ") }));
        let done = 0;
        const added = await Promise.all(
          rawFiles.map(async (f) => {
            const entry = {
              name: f.name,
              size: f.size,
              data: new Uint8Array(await f.arrayBuffer()),
              date: new Date(f.lastModified),
              source: t("sources.addedFilesGroup"),
            };
            done += 1;
            setAnalyzeProgress({ done, total: rawFiles.length });
            return entry;
          }),
        );
        all = [...entries, ...added];
      }
      await loadEntries(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("msg.analysisImpossible"));
    } finally {
      setBusy(false);
      setAnalyzeProgress(null);
    }
  }
  async function processFolderArchives(items: FolderArchive[]) {
    const chosen = items.filter((item) => item.included);
    if (!chosen.length) { setError(t("msg.noArchiveSelectedInFolder")); return; }
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
          const extracted = await readArchive(item.file, security, locale);
          let identified = extracted.map((entry) => ({ ...entry, source: root }));
          if (extractNested) identified = await extractNestedArchives(identified, security);
          all.push(...identified);
          reports.push({ id: `${item.path}-${index}`, name: item.path, root, count: identified.length, status: identified.length ? "ok" : "empty" });
        } catch (archiveError) {
          reports.push({ id: `${item.path}-${index}`, name: item.path, root, count: 0, status: "error", message: archiveError instanceof Error ? archiveError.message : t("msg.readImpossible") });
        }
        setAnalyzeProgress({ done: index + 1, total: chosen.length });
      }
      setArchiveReports(reports);
      await loadEntries(all);
      setFolderArchives([]);
      const duplicateBases = [...new Set(bases.filter((base) => (totals.get(base.toLowerCase()) || 0) > 1))];
      if (duplicateBases.length) setNameWarning(t("msg.duplicateFolderArchiveNames", { names: duplicateBases.join(", ") }));
    } catch (e) { setError(e instanceof Error ? e.message : t("msg.recursiveAnalysisImpossible")); }
    finally { setBusy(false); setAnalyzeProgress(null); }
  }
  async function addFolder(l: FileList | null) {
    if (!l?.length) return;
    const found = Array.from(l).map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, included: true }))
      .filter((item) => archivePattern.test(item.file.name) && (includeHidden || !hiddenOrSystem(item.path)));
    if (!found.length) { setError(t("msg.noCompatibleArchiveInFolder")); return; }
    if (folderMode === "auto") await processFolderArchives(found);
    else setFolderArchives(found);
  }
  function uniqueSourceName(base: string) {
    const used = new Set(entries.map((e) => e.source.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    setNameWarning(t("msg.duplicateFolderName", { name: base }));
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
    setRename((current) => ({ ...current, project: t(selected.nameKey) }));
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
      const handle = await pickDestination(locale);
      setDestination(handle);
      if (planned.length) {
        setDestinationBusy(true);
        setDestinationAnalysis(await analyzeDestination(handle, planned.filter((e) => e.included !== false && !excluded.has(entryKey(e)))));
      }
      if (runAfter) await produce(true, handle);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : t("msg.folderInaccessible"));
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
      const reread = await readArchive(new File([data as BlobPart], filename, { type: mime }), security, locale);
      const actualBytes = reread.reduce((sum, e) => sum + e.size, 0);
      return reread.length === expectedCount && actualBytes === expectedBytes;
    } catch {
      return false;
    }
  }
  async function produce(folder = false, selected?: FileSystemDirectoryHandle) {
    if (!planned.length) return;
    if (mode === "extract" && longPathCandidates && pathDecision === "ask") {
      setError(t("msg.choosePathDecisionFirst"));
      return;
    }
    const failedArchives = archiveReports.filter((report) => report.status !== "ok");
    if (failedArchives.length) {
      setError(t("msg.archivesNotCorrectlyAnalyzed", { count: failedArchives.length }));
      return;
    }
    const selectedEntries = planned.filter((e) => e.included !== false && !excluded.has(entryKey(e)));
    const outputFiles = selectedEntries.filter((e) => !e.directory), outputPaths = new Set(outputFiles.map((e) => (e.planned || e.name).toLowerCase()));
    setLastReport(null);
    if (outputPaths.size !== outputFiles.length) {
      setError(t("msg.duplicateOutputPaths", { count: outputFiles.length - outputPaths.size }));
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
        !confirm(t("msg.confirmReplaceConflicts"))
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
          setError(t("msg.structuralConflicts", { count: structural.length }));
          return;
        }
        const dangerous = analysis.conflicts.filter((c) => c.kind !== "same-content-other-path");
        if (effectivePolicy === "replace-confirm" && dangerous.length && !confirm(t("msg.confirmReplaceExplicit", { count: dangerous.length }))) return;
        const controller = new AbortController(); abortRef.current = controller;
        setProgress({ written: 0, skipped: 0, current: "Préparation" });
        const journal = { ...j, destination: root.name, written: 0, skipped: 0 };
        const result = await writeToDestination(root, u, effectivePolicy, controller.signal, (written, skipped, current) => {
          setProgress({ written, skipped, current });
          localStorage.setItem("archiveflow-journal", JSON.stringify({ ...journal, status: "en cours", written, skipped, current }));
        }, locale);
        if (result.written + result.skipped !== u.length) throw Error(t("msg.integrityCheckFailedWrite"));
        const savedFiles = Math.max(0, outputFiles.length - result.skipped);
        setLastReport({ detected: entries.filter((e) => !e.directory).length, selected: outputFiles.length, saved: savedFiles, skipped: result.skipped, complete: result.skipped === 0 && savedFiles === outputFiles.length });
        localStorage.setItem("archiveflow-journal", JSON.stringify({ ...journal, ...result, expected: u.length, status: result.skipped ? "terminé avec exclusions" : "terminé" }));
        if (result.skipped) setError(t("msg.someItemsNotWritten", { count: result.skipped }));
        hist("Organisation", "Dossier");
      } else {
        async function buildArchive(archiveEntries: ArchiveEntry[], archiveFiles: ArchiveEntry[], baseName: string) {
          if (output === "GZIP") {
            if (archiveFiles.length !== 1) throw Error(t("msg.gzipSingleFileOnly"));
            return { data: await makeGzip(archiveFiles[0]), filename: `${baseName}.gz`, mime: "application/gzip" };
          }
          if (output === "TAR") return { data: makeTar(archiveEntries), filename: `${baseName}.tar`, mime: "application/x-tar" };
          if (output === "TAR.GZ") return { data: await makeTarGz(archiveEntries), filename: `${baseName}.tar.gz`, mime: "application/gzip" };
          return { data: await makeZip(archiveEntries, zipCompression), filename: `${baseName}.zip`, mime: "application/zip" };
        }
        const maxBytes = output !== "GZIP" ? Number(maxArchiveSizeMb) * 1024 * 1024 : 0;
        const buckets = maxBytes > 0 ? bucketBySize(outputFiles, maxBytes) : [outputFiles];
        const multi = buckets.length > 1;
        if (multi) {
          const oversized = buckets.filter((bucket) => bucket.length === 1 && bucket[0].size > maxBytes).length;
          if (oversized) setError(t("msg.oversizedFilesInVolumes", { count: oversized }));
        }
        const directoryEntries = selectedEntries.filter((e) => e.directory);
        let saved = 0;
        for (let i = 0; i < buckets.length; i++) {
          const bucketFiles = buckets[i], baseName = multi ? `${name}_part${i + 1}` : name;
          const built = await buildArchive(multi ? [...directoryEntries, ...bucketFiles] : u, bucketFiles, baseName);
          const expectedBytes = bucketFiles.reduce((sum, e) => sum + e.size, 0);
          const verified = await verifyProduced(built.data, built.filename, built.mime, bucketFiles.length, expectedBytes);
          if (!verified) throw Error(t("msg.integrityCheckFailedCreate", { filename: built.filename }));
          dl(built.data, built.filename, built.mime);
          saved += bucketFiles.length;
        }
        setLastReport({ detected: entries.filter((e) => !e.directory).length, selected: outputFiles.length, saved, skipped: 0, complete: true });
        hist(mode === "extract" ? "Extraction" : "Création", multi ? `${output} (${buckets.length} archives)` : output);
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
      setError(cancelled ? t("msg.operationCancelled") : e instanceof Error ? e.message : t("msg.operationImpossible"));
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
      setError(t("msg.invalidJson"));
    }
  }
  return (
    <main className="v2" data-theme={theme}>
      <TopBar
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={() => setSettings(true)}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        screen={screen}
        onNavigateHome={() => setScreen("home")}
        onNavigateWorkspace={() => setScreen("workspace")}
        locale={locale}
        onChangeLocale={setLocale}
        t={t}
      />
      {screen === "home" && (
        <HomeScreen
          t={t}
          locale={locale}
          history={history}
          profiles={PROFILES.filter((p) => p.id !== "custom")}
          onStart={(startMode) => { setMode(startMode); setScreen("workspace"); }}
          onSelectProfile={(id) => { applyProfile(id as ProfileId); setScreen("workspace"); }}
        />
      )}
      {screen === "workspace" && (
      <section className="v2wrap">
        <div className="v2title">
          <div>
            <em>{t("workspace.eyebrow").toUpperCase()}</em>
            <h1>{t("workspace.title")}</h1>
            <p>{t("workspace.subtitle")}</p>
          </div>
          <button className="formats" onClick={() => setFormatsOpen(true)} title={t("formats.title")}>
            <span>
              ZIP <b>{t("formats.zipComplete")}</b>
            </span>
            <span>
              TAR/GZIP <b>{t("formats.tarGzipComplete")}</b>
            </span>
            <span>
              7Z/RAR <b>{t("formats.sevenZipRarExtraction")}</b>
            </span>
            <small>{t("formats.seeDetails")}</small>
          </button>
        </div>
        <div className="v2tabs">
          <button
            className={mode === "extract" ? "on" : ""}
            onClick={() => reset("extract")}
          >
            <FolderOpen />
            {t("mode.extract")}
          </button>
          <button
            className={mode === "create" ? "on" : ""}
            onClick={() => reset("create")}
          >
            <FileArchive />
            {t("mode.create")}
          </button>
        </div>
        <div className="dashboard">
          <aside className="controls">
            <section>
              <h2>
                <span>1</span>{t("sources.heading")}
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
                <strong>{t("sources.addFiles")}</strong>
                <small>{t("sources.dragOrBrowse")}</small>
              </button>
              {mode === "extract" && (
                <div className="folderimport">
                  <button onClick={() => folderInput.current?.click()}><FolderTree />{t("sources.importFolderRecursive")}</button>
                  <label><input type="radio" checked={folderMode === "choose"} onChange={() => setFolderMode("choose")} /> {t("sources.chooseBeforeAnalysis")}</label>
                  <label><input type="radio" checked={folderMode === "auto"} onChange={() => setFolderMode("auto")} /> {t("sources.analyzeAutomatically")}</label>
                  <label title={t("sources.includeHiddenTitle")}><input type="checkbox" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} /> {t("sources.includeHidden")}</label>
                  <label title={t("sources.extractNestedTitle")}><input type="checkbox" checked={extractNested} onChange={(e) => setExtractNested(e.target.checked)} /> {t("sources.extractNested")}</label>
                </div>
              )}
              {mode === "create" && (
                <div className="folderimport createfolder">
                  <button onClick={pickCompleteCreateFolder}><FolderTree />{t("sources.importFullFolder")}</button>
                  <label><input type="checkbox" checked={preserveRoot} onChange={(e) => setPreserveRoot(e.target.checked)} /> {t("sources.preserveRoot")}</label>
                  <label><input type="checkbox" checked={preserveEmpty} onChange={(e) => setPreserveEmpty(e.target.checked)} /> {t("sources.preserveEmpty")}</label>
                  <small>{t("sources.createFolderHint")}</small>
                </div>
              )}
              {folderArchives.length > 0 && (
                <div className="foldercandidates">
                  <b>{t("sources.selectedArchives", { count: folderArchives.filter((item) => item.included).length })}</b>
                  <div>{folderArchives.map((item, index) => <label key={item.path}><input type="checkbox" checked={item.included} onChange={() => setFolderArchives((current) => current.map((value, i) => i === index ? { ...value, included: !value.included } : value))} /><span>{item.path}</span></label>)}</div>
                  <footer><button onClick={() => setFolderArchives((current) => current.map((item) => ({ ...item, included: true })))}>{t("sources.selectAll")}</button><button onClick={() => setFolderArchives([])}>{t("sources.cancel")}</button><button onClick={() => processFolderArchives(folderArchives)}>{t("sources.analyzeSelection")}</button></footer>
                </div>
              )}
              {sourceGroups.length > 0 && (
                <>
                  {sourceGroups.length > 1 && (
                    <div className="source-summary">
                      <b>{sourceGroups.length}</b>
                      <span>
                        {t("sources.totalItems")}<small>{formatBytes(total)}</small>
                      </span>
                      <button title={t("sources.removeAll")} onClick={() => reset()}>
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
                      <button title={t("sources.remove")} onClick={() => removeSource(g.source)}>
                        <Trash2 />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </section>
            <section>
              <h2>
                <span>2</span>{t("engine.heading")}
              </h2>
              <label className="preserve-note">
                <ShieldCheck />
                <span>
                  <b>{t("engine.originalTreeKept")}</b>
                  <small>{t("engine.oneFolderPerArchive")}</small>
                </span>
              </label>
              <label className="profilepicker">
                {t("engine.businessProfile")}
                <select value={profile} onChange={(e) => applyProfile(e.target.value as ProfileId)}>
                  {PROFILES.map((item) => <option value={item.id} key={item.id}>{t(item.nameKey)}</option>)}
                </select>
                <small>{t(PROFILES.find((item) => item.id === profile)!.descriptionKey)}</small>
              </label>
              {profile !== "custom" && <div className="profileactive"><ShieldCheck /><span><b>{t("engine.profileActive", { name: t(PROFILES.find((item) => item.id === profile)!.nameKey) })}</b><small>{t("engine.profileActiveHint")}</small></span></div>}
              <label className="optioncheck">
                <input
                  type="checkbox"
                  checked={classify}
                  onChange={(e) => setClassify(e.target.checked)}
                />
                {t("engine.enableClassification")}
              </label>
              {mode === "extract" && (
                <>
                  <label className="optioncheck">
                    <input
                      type="checkbox"
                      checked={renameEnabled}
                      onChange={(e) => setRenameEnabled(e.target.checked)}
                    />
                    {t("engine.renameFilesAndFolders")}
                  </label>
                  <label>
                    {t("engine.pattern")}
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
                <small className="why">{t("engine.createModeNamesUnchanged")}</small>
              )}
              <button className="enginebtn" onClick={() => setSettings(true)}>
                <Settings2 />
                {t("engine.configureRules")}
              </button>
            </section>
            <section>
              <h2>
                <span>3</span>{t("destination.heading")}
              </h2>
              {mode === "create" && (
                <>
                  <label>
                    {t("destination.name")}
                    <input value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <div className="formatselect">
                    {["ZIP", "TAR", "TAR.GZ", "GZIP"].map((f) => (
                      <button
                        className={output === f ? "on" : ""}
                        key={f}
                        disabled={f === "GZIP" && selectableFileCount !== 1}
                        title={f === "GZIP" && selectableFileCount !== 1 ? t("destination.gzipSingleFileOnly") : undefined}
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
                      {t("destination.compressZip")}
                    </label>
                  )}
                  <label>
                    {t("destination.maxArchiveSize")} <small>{t("destination.maxArchiveSizeUnit")}</small>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      placeholder={t("destination.maxArchiveSizeUnlimited")}
                      value={maxArchiveSizeMb}
                      disabled={output === "GZIP"}
                      onChange={(e) => setMaxArchiveSizeMb(e.target.value)}
                    />
                  </label>
                  {Number(maxArchiveSizeMb) > 0 && (
                    <small className="why">
                      {t("destination.maxArchiveSizeHint", { name })}
                    </small>
                  )}
                </>
              )}
              {selectableFileCount > 0 && (
                <div className="estimatebox">
                  <Layers3 />
                  <div>
                    <b>{t("destination.estimateHeading")}</b>
                    <small>
                      {t("destination.estimateToProcess", { size: formatBytes(estimate.totalBytes) })}
                      {mode === "create" && estimate.estimatedOutputBytes !== estimate.totalBytes
                        ? t("destination.estimateCompressed", { size: formatBytes(estimate.estimatedOutputBytes) })
                        : ""}
                      {t("destination.estimateDuration", { duration: formatDuration(estimate.estimatedSeconds) })}
                    </small>
                  </div>
                </div>
              )}
              <div className="destinationchoice">
                <button className="destinationbtn" disabled={destinationBusy} onClick={() => chooseDestination(false)}><HardDrive />{destination ? t("destination.folderLabel", { name: destination.name }) : t("destination.chooseNow")}</button>
                {destination && <button className="removedestination" title={t("destination.removeChosen")} onClick={() => { setDestination(null); setDestinationAnalysis(null); }}><XCircle /></button>}
              </div>
              {destination && <small className="destinationhint">{t("destination.hintChangeAfter")}</small>}
            </section>
          </aside>
          <section className="preview">
            <div className="previewhead">
              <div>
                <h2>{t("preview.simulationTitle")}</h2>
                <p>
                  {t("preview.summary", { count: planned.length, conflicts: dupes, incomplete, shortened: shortenedPaths })}
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
                placeholder={t("preview.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className={filtersOpen ? "on" : ""} onClick={() => setFiltersOpen(!filtersOpen)}><Filter />{t("preview.filters")}</button>
            </div>
            {filtersOpen && planned.length > 0 && (
              <div className="advancedfilters">
                <label>{t("preview.sort")}<select value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="name">{t("preview.sortName")}</option><option value="size">{t("preview.sortSize")}</option><option value="date">{t("preview.sortDate")}</option><option value="category">{t("preview.sortCategory")}</option><option value="source">{t("preview.sortSource")}</option></select></label>
                <label>{t("preview.order")}<select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as "asc" | "desc")}><option value="asc">{t("preview.orderAsc")}</option><option value="desc">{t("preview.orderDesc")}</option></select></label>
                <label>{t("preview.category")}<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">{t("preview.categoryAll")}</option>{[...new Set(planned.map((e) => e.category))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>{t("preview.archive")}<select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="all">{t("preview.archiveAll")}</option>{[...new Set(planned.map((e) => e.source))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>{t("preview.selection")}<select value={selectionFilter} onChange={(e) => setSelectionFilter(e.target.value)}><option value="all">{t("preview.selectionAll")}</option><option value="selected">{t("preview.selectionIncluded")}</option><option value="excluded">{t("preview.selectionExcluded")}</option></select></label>
                <label>{t("preview.minSize")}<input type="number" min="0" value={minSize} onChange={(e) => setMinSize(e.target.value)} /></label>
                <label>{t("preview.maxSize")}<input type="number" min="0" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} /></label>
                <button onClick={() => { setQuery(""); setCategoryFilter("all"); setSourceFilter("all"); setSelectionFilter("all"); setMinSize(""); setMaxSize(""); setSortBy("name"); setSortDirection("asc"); }}>{t("preview.reset")}</button>
              </div>
            )}
            {planned.length > 0 && (
              <div className="selectionbar">
                <strong>{t("preview.selectedOf", { selected: selectedCount, total: planned.length })}</strong>
                <button onClick={() => setAllSelection("all")}>{t("preview.selectAll")}</button>
                <button onClick={() => setAllSelection("none")}>{t("preview.selectNone")}</button>
                <button onClick={() => setAllSelection("invert")}>{t("preview.invert")}</button>
              </div>
            )}
            {planned.length > 0 && (
              <div className="bulkbar">
                <span><ArrowUpDown /><b>{t("preview.bulkEdit")}</b><small>{t("preview.bulkEditHint", { count: selectedCount })}</small></span>
                <div><select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}><option value="">{t("preview.bulkCategoryPlaceholder")}</option>{[...DEFAULT_CATEGORIES, ...cats].map((category) => <option key={category.id}>{category.name}</option>)}</select><button onClick={() => applyBulk("category")}>{t("preview.apply")}</button></div>
                <div><input placeholder={t("preview.moveToFolderPlaceholder")} value={bulkFolder} onChange={(e) => setBulkFolder(e.target.value)} /><button onClick={() => applyBulk("folder")}>{t("preview.move")}</button></div>
                <div><input placeholder={t("preview.renamePrefixPlaceholder")} value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} /><button onClick={() => applyBulk("prefix")}>{t("preview.rename")}</button></div>
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
                  <b>{t("preview.duplicateWarningTitle")}</b>
                  <small>{nameWarning}</small>
                </div>
                <button title={t("preview.closeWarning")} onClick={() => setNameWarning("")} style={{ marginLeft: "auto", border: 0, background: "none", color: "inherit", fontSize: 16, cursor: "pointer" }}>×</button>
              </div>
            )}
            {archiveReports.length > 0 && (
              <div className="archivereports"><header><b>{t("preview.archivesReceived", { count: archiveReports.length })}</b><small>{t("preview.filesDetectedTotal", { count: archiveReports.reduce((sum, report) => sum + report.count, 0) })}</small></header>{archiveReports.map((report) => <div className={report.status} key={report.id}><FileArchive /><span><b>{report.name}</b><small>{t("preview.outputFolder", { root: report.root })}</small></span><strong>{report.status === "ok" ? t("preview.filesCount", { count: report.count }) : report.message || t("preview.emptyArchive")}</strong><button title={t("preview.removeArchive")} onClick={() => removeSource(report.root)}><Trash2 /></button></div>)}</div>
            )}
            {mode === "extract" && longPathCandidates > 0 && pathDecision === "ask" && (
              <div className="pathdecision"><Info /><div><b>{t("preview.longPathsTitle", { count: longPathCandidates })}</b><small>{t("preview.longPathsHint")}</small><span><button onClick={() => setPathDecision("shorten")}>{t("preview.shortenFolders")}</button><button onClick={() => setPathDecision("preserve")}>{t("preview.keepOriginalNames")}</button><button onClick={() => reset()}>{t("sources.cancel")}</button></span></div></div>
            )}
            {mode === "extract" && longPathCandidates > 0 && pathDecision === "preserve" && (
              <div className="pathwarning"><ShieldCheck /><div><b>{t("preview.originalNamesKeptTitle")}</b><small>{t("preview.originalNamesKeptHint")}</small></div></div>
            )}
            {mode === "extract" && longPathCandidates > 0 && pathDecision === "shorten" && (
              <div className="pathwarning"><ShieldCheck /><div><b>{t("preview.foldersShortenedTitle")}</b><small>{t("preview.foldersShortenedHint")}</small></div></div>
            )}
            {destination && planned.length > 0 && (
              <div className={destinationAnalysis?.spaceStatus.kind === "low" ? "destinationcheck low" : "destinationcheck"}>
                <HardDrive />
                <div>
                  <b>{destinationBusy ? t("preview.destinationAnalyzing") : t("preview.destinationVerified", { name: destination.name })}</b>
                  <small>
                    {destinationAnalysis
                      ? t("preview.destinationReports", { count: destinationAnalysis.conflicts.length, size: formatBytes(destinationAnalysis.requiredBytes), space: spaceStatusText(destinationAnalysis.spaceStatus, t) })
                      : t("preview.destinationPending")}
                  </small>
                </div>
              </div>
            )}
            {shortenedPaths > 0 && (
              <div className="pathwarning"><ShieldCheck /><div><b>{t("preview.pathsFixedTitle", { count: shortenedPaths })}</b><small>{t("preview.pathsFixedHint")}</small></div></div>
            )}
            {protectedFiles > 0 && (
              <div className="integritynotice"><ShieldCheck /><div><b>{t("preview.sigProtectedTitle", { count: protectedFiles })}</b><small>{t("preview.sigProtectedHint")}{unsafeProtectedPaths ? t("preview.sigProtectedPathsRemain", { count: unsafeProtectedPaths }) : ""}</small></div></div>
            )}
            {quarantinedCount > 0 && (
              <div className="v2error"><Info /><div><b>{t("preview.quarantinedTitle", { count: quarantinedCount })}</b><small>{t("preview.quarantinedHint")}</small></div></div>
            )}
            {lastReport && (
              <div className={lastReport.complete ? "savereport complete" : "savereport incomplete"}><CheckCircle2 /><div><b>{lastReport.complete ? t("preview.saveCompleteTitle") : t("preview.saveIncompleteTitle")}</b><small>{t("preview.saveReportSummary", { detected: lastReport.detected, selected: lastReport.selected, saved: lastReport.saved, skipped: lastReport.skipped })}</small></div></div>
            )}
            {busy ? (
              <div className="v2empty">
                <RefreshCcw className="spin" />
                <b>{t("preview.analyzing")}</b>
                {analyzeProgress && analyzeProgress.total > 0 && (
                  <p>{t("preview.analyzeProgressPercent", { percent: Math.round((analyzeProgress.done / analyzeProgress.total) * 100), done: analyzeProgress.done, total: analyzeProgress.total })}</p>
                )}
                {analyzeProgress && analyzeProgress.total === 0 && analyzeProgress.done > 0 && (
                  <p>{t("preview.analyzeProgressCount", { count: analyzeProgress.done })}</p>
                )}
              </div>
            ) : !planned.length ? (
              <div className="v2empty">
                <FolderTree />
                <b>{t("preview.nothingToPreview")}</b>
              </div>
            ) : view === "tree" ? (
              <div className="tree">
                {tree.map(([f, is]) => (
                  <div className="treegroup" key={f}>
                    <h3>
                      <input
                        type="checkbox"
                        aria-label={t("preview.includeFolder", { name: f || t("preview.root") })}
                        checked={planned.filter((entry) => {
                          const path = entry.planned || entry.name;
                          return f ? path.startsWith(`${f}/`) : !path.includes("/");
                        }).every((entry) => !excluded.has(entryKey(entry)))}
                        onChange={() => toggleFolder(f)}
                      />
                      <FolderOpen />
                      {f ? f.replaceAll("/", " / ") : t("preview.root")}
                      <span>{is.length}</span>
                    </h3>
                    {is.map((e, i) => (
                      <EntryRow e={e} excluded={excluded.has(entryKey(e))} toggle={() => toggleEntry(e)} key={i} t={t} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="tree listview">
                {filtered.map((e, i) => (
                  <EntryRow e={e} excluded={excluded.has(entryKey(e))} toggle={() => toggleEntry(e)} key={i} t={t} />
                ))}
              </div>
            )}
            <div className="resultbar">
              <div>
                <span>
                  <CheckCircle2 />
                  {t("preview.simulationDone")}
                </span>
                <small>{t("preview.noSilentOverwrite")}</small>
              </div>
              {mode === "create" && destination && (
                <label className="renamebeforesave">
                  {t("preview.fileNameOptional")} <small>{t("preview.optional")}</small>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="archive-organisee" />
                </label>
              )}
              <button
                className="folderbtn"
                disabled={!selectedCount || busy}
                onClick={() => (destination ? produce(true) : chooseDestination(false))}
              >
                {destination ? t("preview.saveToFolder") : t("preview.chooseFolder")}
              </button>
              {busy && progress && <button className="cancelbtn" onClick={() => abortRef.current?.abort()}><XCircle />{t("preview.cancelOperation")}</button>}
              {mode === "create" && (
                <button
                  className="downloadbtn"
                  disabled={!selectedCount || busy}
                  onClick={() => produce()}
                >
                  <Download />
                  {t("preview.download")}
                </button>
              )}
            </div>
          </section>
        </div>
      </section>
      )}
      {historyOpen && (
        <HistoryPanel
          history={history}
          onClose={() => setHistoryOpen(false)}
          onClear={() => {
            setHistory([]);
            localStorage.removeItem("archiveflow-history");
          }}
          locale={locale}
          t={t}
        />
      )}
      {formatsOpen && <FormatMatrixModal onClose={() => setFormatsOpen(false)} t={t} />}
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
          t={t}
        />
      )}
    </main>
  );
}
