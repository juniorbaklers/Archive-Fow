import { ArchiveEntry, ext } from "./archive-utils";
export type CategoryDef = {
  id: string;
  name: string;
  extensions: string[];
  custom?: boolean;
};
export type SmartRule = {
  id: string;
  priority: number;
  enabled: boolean;
  field:
    "name" | "extension" | "category" | "source" | "size" | "regex" | "keyword";
  operator: "contains" | "equals" | "greater" | "less" | "matches";
  value: string;
  destination: string;
};
export type RenameOptions = {
  pattern: string;
  project: string;
  prefix: string;
  suffix: string;
  caseMode: "none" | "upper" | "lower";
  removeAccents: boolean;
  spaces: "keep" | "underscore" | "dash";
  search: string;
  replace: string;
  regex: boolean;
  maxLength: number;
  windowsSafePaths: boolean;
  relativePathLimit: number;
};
export type CollisionPolicy =
  "keep-both" | "skip" | "rename" | "duplicates-folder" | "replace-confirm";
export type SmartEntry = ArchiveEntry & {
  category: string;
  family?: string;
  familyIncomplete?: boolean;
  explanation: string;
  collision?:
    | "same-name-same-content"
    | "same-name-different-content"
    | "same-content-different-name";
  contentMatch?: boolean;
  included?: boolean;
  pathAdjusted?: boolean;
  originalPlanned?: string;
  integrityProtected?: boolean;
  pathUnsafe?: boolean;
};
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {
    id: "sig",
    name: "SIG",
    extensions: [
      "shp",
      "shx",
      "dbf",
      "prj",
      "cpg",
      "qix",
      "sbn",
      "sbx",
      "geojson",
      "gpkg",
      "kml",
      "kmz",
      "gpx",
      "tif",
      "tiff",
      "las",
      "laz",
      "qgs",
      "qgz",
    ],
  },
  {
    id: "office",
    name: "Bureautique",
    extensions: [
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "pdf",
      "csv",
      "odt",
      "ods",
      "odp",
      "rtf",
      "txt",
    ],
  },
  {
    id: "data",
    name: "Données",
    extensions: [
      "json",
      "xml",
      "yaml",
      "yml",
      "sqlite",
      "db",
      "sql",
      "parquet",
    ],
  },
  {
    id: "images",
    name: "Images",
    extensions: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "svg",
      "tif",
      "tiff",
      "heic",
      "raw",
      "cr2",
      "nef",
    ],
  },
  {
    id: "media",
    name: "Audio et vidéo",
    extensions: [
      "mp3",
      "wav",
      "flac",
      "aac",
      "ogg",
      "mp4",
      "mov",
      "mkv",
      "webm",
      "avi",
      "srt",
      "vtt",
      "ass",
    ],
  },
  {
    id: "dev",
    name: "Développement",
    extensions: [
      "html",
      "htm",
      "css",
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "h",
      "cs",
      "sql",
      "md",
      "toml",
      "ini",
      "env",
      "lock",
    ],
  },
  {
    id: "cad",
    name: "CAO, BIM et scientifique",
    extensions: [
      "dwg",
      "dxf",
      "ifc",
      "rvt",
      "step",
      "stp",
      "iges",
      "igs",
      "blend",
      "mat",
      "nc",
      "hdf5",
    ],
  },
  {
    id: "fonts",
    name: "Polices",
    extensions: ["ttf", "otf", "woff", "woff2", "eot"],
  },
  {
    id: "archives",
    name: "Archives",
    extensions: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"],
  },
  {
    id: "executables",
    name: "Exécutables et scripts",
    extensions: [
      "exe",
      "msi",
      "apk",
      "app",
      "bat",
      "cmd",
      "ps1",
      "sh",
      "dll",
      "so",
    ],
  },
  {
    id: "system",
    name: "Fichiers système",
    extensions: ["sys", "tmp", "bak", "lnk", "ds_store"],
  },
];
export const DEFAULT_RULES: SmartRule[] = [
  {
    id: "sig",
    priority: 1,
    enabled: true,
    field: "category",
    operator: "equals",
    value: "SIG",
    destination: "{projet}/SIG/{annee}",
  },
  {
    id: "dev",
    priority: 2,
    enabled: true,
    field: "category",
    operator: "equals",
    value: "Développement",
    destination: "{projet}/Code/{category}",
  },
  {
    id: "default",
    priority: 99,
    enabled: true,
    field: "name",
    operator: "contains",
    value: "",
    destination: "{projet}/{category}/{annee}/{mois}",
  },
];
const fileBase = (n: string) => {
  const b = n.split("/").pop() || n,
    e = ext(b);
  return e ? b.slice(0, -e.length - 1) : b;
};
const familyKeyFor = (entry: ArchiveEntry) => {
  const normalized = entry.name.replace(/\\/g, "/"), folder = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
  return `${entry.source}/${folder}/${fileBase(entry.name)}`.toLowerCase();
};
export function categoryFor(name: string, categories: CategoryDef[]) {
  const x = ext(name);
  return (
    categories.find((c) => c.extensions.map((v) => v.toLowerCase()).includes(x))
      ?.name || "Autres"
  );
}
function matches(e: ArchiveEntry, category: string, r: SmartRule) {
  const values: { [k: string]: string | number } = {
    name: e.name,
    extension: ext(e.name),
    category,
    source: e.source,
    size: e.size,
    regex: e.name,
    keyword: e.name,
  };
  const actual = values[r.field];
  if (r.field === "regex" || r.operator === "matches") {
    try {
      return new RegExp(r.value, "i").test(String(actual));
    } catch {
      return false;
    }
  }
  if (r.operator === "greater") return Number(actual) > Number(r.value);
  if (r.operator === "less") return Number(actual) < Number(r.value);
  if (r.operator === "equals")
    return String(actual).toLowerCase() === r.value.toLowerCase();
  return String(actual).toLowerCase().includes(r.value.toLowerCase());
}
function cleanName(value: string, o: RenameOptions) {
  let n = value;
  if (o.removeAccents) n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (o.search) {
    try {
      n = n.replace(o.regex ? new RegExp(o.search, "g") : o.search, o.replace);
    } catch {}
  }
  if (o.spaces === "underscore") n = n.replace(/\s+/g, "_");
  if (o.spaces === "dash") n = n.replace(/\s+/g, "-");
  if (o.caseMode === "upper") n = n.toUpperCase();
  if (o.caseMode === "lower") n = n.toLowerCase();
  n = n.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/[. ]+$/g, "");
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reserved.test(n)) n = `_${n}`;
  return n.slice(0, Math.max(12, o.maxLength || 120)) || "fichier";
}
function compactHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}
function compactSegment(value: string, max: number) {
  if (value.length <= max) return value;
  const suffix = `~${compactHash(value)}`;
  return `${value.slice(0, Math.max(4, max - suffix.length))}${suffix}`;
}
function makeWindowsSafePath(path: string, limit: number, familyBases: Map<string, string>, preserveInternal = false) {
  if (path.length <= limit && path.split("/").every((part) => part.length <= 90)) return path;
  const originalParts = path.split("/"), parts = [...originalParts];
  if (preserveInternal) {
    parts[0] = compactSegment(parts[0], 36);
    return parts.join("/");
  }
  for (let i = 0; i < parts.length - 1; i += 1) parts[i] = compactSegment(parts[i], 36);
  const file = parts.at(-1) || "fichier", extension = ext(file), stem = extension ? file.slice(0, -extension.length - 1) : file;
  const folderKey = originalParts.slice(0, -1).join("/").toLowerCase(), familyKey = `${folderKey}/${stem.toLowerCase()}`;
  let safeStem = familyBases.get(familyKey);
  if (!safeStem) {
    safeStem = compactSegment(stem, 46);
    familyBases.set(familyKey, safeStem);
  }
  parts[parts.length - 1] = extension ? `${safeStem}.${extension}` : safeStem;
  if (parts.join("/").length > limit) {
    for (let i = 1; i < parts.length - 1; i += 1) parts[i] = compactSegment(parts[i], 18);
  }
  if (parts.join("/").length > limit && parts.length > 3) {
    const middle = originalParts.slice(1, -2).join("/");
    parts.splice(1, parts.length - 3, `_chemin_${compactHash(middle)}`);
  }
  const current = parts.join("/"), overflow = current.length - limit;
  if (overflow > 0) {
    const last = parts.at(-1)!, lastExt = ext(last), lastStem = lastExt ? last.slice(0, -lastExt.length - 1) : last;
    const finalStem = compactSegment(lastStem, Math.max(12, lastStem.length - overflow));
    parts[parts.length - 1] = lastExt ? `${finalStem}.${lastExt}` : finalStem;
  }
  return parts.join("/");
}
export function enrichEntries(
  entries: ArchiveEntry[],
  rules: SmartRule[],
  categories: CategoryDef[],
  rename: RenameOptions,
  policy: CollisionPolicy,
  classify = false,
  renameEnabled = false,
): SmartEntry[] {
  const sorted = [...rules]
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority),
    hashes = new Map<string, SmartEntry>(),
    names = new Map<string, SmartEntry>(),
    familyMap = new Map<string, Set<string>>(),
    renamedFolders = new Map<string, string>(),
    safeFamilyBases = new Map<string, string>(),
    renamedFamilyBases = new Map<string, string>(),
    protectedSources = new Set(entries.filter((entry) => ["qgs", "qgz"].includes(ext(entry.name))).map((entry) => entry.source));
  let folderCounter = 0;
  for (const e of entries) {
    const x = ext(e.name),
      stem = familyKeyFor(e);
    if (["shp", "shx", "dbf", "prj", "cpg", "qix", "sbn", "sbx"].includes(x)) {
      const set = familyMap.get(stem) || new Set();
      set.add(x);
      familyMap.set(stem, set);
    }
  }
  return entries.map((e, index) => {
    const category = categoryFor(e.name, categories),
      date = e.date || new Date(),
      rule = classify ? sorted.find((r) => matches(e, category, r)) : undefined,
      familyStem = familyKeyFor(e),
      shape = familyMap.get(familyStem),
      family = shape ? `Shapefile : ${fileBase(e.name)}` : undefined,
      familyIncomplete =
        !!shape && !["shp", "shx", "dbf"].every((x) => shape.has(x)),
      integrityProtected = protectedSources.has(e.source),
      original = fileBase(e.name),
      extension = ext(e.name),
      sourceRoot =
        e.rootless
          ? ""
          : e.source.replace(/\.(tar\.gz|tgz|zip|tar|gz|gzip|7z|rar)$/i, "") || "Archive",
      vars: { [k: string]: string } = {
        nom: original,
        source: sourceRoot,
        projet: rename.project || "Projet",
        category,
        extension,
        date: date.toISOString().slice(0, 10),
        annee: String(date.getFullYear()),
        mois: String(date.getMonth() + 1).padStart(2, "0"),
        numero: String(index + 1).padStart(3, "0"),
        compteur: String(index + 1),
      },
      apply = (template: string) =>
        template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`),
      parts = e.name.replace(/\\/g, "/").split("/").filter(Boolean),
      renamePart = (part: string, isFile: boolean, folderKey = "") => {
        if (integrityProtected) return part;
        if (!isFile && renamedFolders.has(folderKey))
          return renamedFolders.get(folderKey)!;
        const partExt = isFile ? ext(part) : "",
          stem = partExt ? part.slice(0, -partExt.length - 1) : part;
        vars.nom = stem;
        if (!isFile) {
          folderCounter += 1;
          vars.numero = String(folderCounter).padStart(3, "0");
          vars.compteur = String(folderCounter);
        } else {
          vars.numero = String(index + 1).padStart(3, "0");
          vars.compteur = String(index + 1);
        }
        const familyRenameKey = `${e.source}/${parts.slice(0, -1).join("/")}/${stem}`.toLowerCase();
        if (isFile && shape && renamedFamilyBases.has(familyRenameKey))
          return `${renamedFamilyBases.get(familyRenameKey)}.${partExt}`;
        const next = cleanName(
          `${rename.prefix}${apply(rename.pattern)}${rename.suffix}`,
          rename,
        );
        const result = isFile && partExt && !next.toLowerCase().endsWith(`.${partExt}`)
          ? `${next}.${partExt}`
          : next;
        if (!isFile) renamedFolders.set(folderKey, result);
        if (isFile && shape) renamedFamilyBases.set(familyRenameKey, next);
        return result;
      },
      internal = renameEnabled
        ? parts.map((part, i) =>
            renamePart(
              part,
              i === parts.length - 1,
              `${sourceRoot}/${parts.slice(0, i + 1).join("/")}`.toLowerCase(),
            ),
          ).join("/")
        : parts.join("/"),
      folder = rule ? apply(rule.destination) : "",
      planned = (classify
        ? `${sourceRoot}/${folder}/${internal}`
        : `${sourceRoot}/${internal}`
      ).replace(/\/+/g, "/").replace(/^\/+/, "");
    const safePlanned = rename.windowsSafePaths === false
        ? planned
        : makeWindowsSafePath(planned, Math.max(100, rename.relativePathLimit || 180), safeFamilyBases, integrityProtected),
      pathAdjusted = safePlanned !== planned,
      pathUnsafe = integrityProtected && (safePlanned.length > Math.max(100, rename.relativePathLimit || 180) || safePlanned.split("/").some((part) => part.length > 240));
    let collision: SmartEntry["collision"],
      contentMatch = false;
    const sameName = names.get(safePlanned.toLowerCase()),
      sameHash = e.hash ? hashes.get(e.hash) : undefined;
    if (sameName)
      collision =
        sameName.hash === e.hash
          ? "same-name-same-content"
          : "same-name-different-content";
    else if (sameHash) contentMatch = true;
    let final = safePlanned,
      included = true;
    if (collision) {
      if (policy === "skip") included = false;
      else if (policy === "duplicates-folder") final = `Doublons/${safePlanned}`;
      else if (policy === "rename" || policy === "keep-both" || policy === "replace-confirm") {
        const dot = safePlanned.lastIndexOf("."),
          tag = ` (${index + 1})`;
        final =
          dot > safePlanned.lastIndexOf("/")
            ? `${safePlanned.slice(0, dot)}${tag}${safePlanned.slice(dot)}`
            : `${safePlanned}${tag}`;
      }
      if (rename.windowsSafePaths !== false)
        final = makeWindowsSafePath(final, Math.max(100, rename.relativePathLimit || 180), safeFamilyBases, integrityProtected);
    }
    if (included) {
      const originalFinal = final;
      for (let copy = 2; names.has(final.toLowerCase()); copy += 1) {
        const dot = originalFinal.lastIndexOf("."), slash = originalFinal.lastIndexOf("/"), tag = `__copie_${copy}`;
        final = dot > slash ? `${originalFinal.slice(0, dot)}${tag}${originalFinal.slice(dot)}` : `${originalFinal}${tag}`;
      }
    }
    const out: SmartEntry = {
      ...e,
      planned: final,
      category,
      family,
      familyIncomplete,
      collision,
      contentMatch,
      included,
      pathAdjusted,
      originalPlanned: pathAdjusted ? planned : undefined,
      integrityProtected,
      pathUnsafe,
      explanation: rule
        ? `Règle ${rule.priority} appliquée dans « ${sourceRoot} » sans déplacer le fichier hors de son dossier d’origine : ${rule.destination}${integrityProtected ? " • noms protégés pour conserver les liens du projet SIG" : pathAdjusted ? " • chemin raccourci pour Windows" : ""}`
        : `Arborescence originale conservée dans « ${sourceRoot} »${integrityProtected ? " • noms protégés pour conserver les liens du projet SIG" : pathAdjusted ? " • chemin raccourci pour Windows" : ""}`,
    };
    names.set(final.toLowerCase(), out);
    if (e.hash) hashes.set(e.hash, out);
    return out;
  });
}
