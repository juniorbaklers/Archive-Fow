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
  included?: boolean;
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
    familyMap = new Map<string, Set<string>>();
  for (const e of entries) {
    const x = ext(e.name),
      stem = fileBase(e.name).toLowerCase();
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
      familyStem = fileBase(e.name).toLowerCase(),
      shape = familyMap.get(familyStem),
      family = shape ? `Shapefile : ${fileBase(e.name)}` : undefined,
      familyIncomplete =
        !!shape && !["shp", "shx", "dbf"].every((x) => shape.has(x)),
      original = fileBase(e.name),
      extension = ext(e.name),
      sourceRoot =
        e.source.replace(/\.(tar\.gz|tgz|zip|tar|gz|gzip|7z|rar)$/i, "") ||
        "Archive",
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
      renamePart = (part: string, isFile: boolean) => {
        const partExt = isFile ? ext(part) : "",
          stem = partExt ? part.slice(0, -partExt.length - 1) : part;
        vars.nom = stem;
        const next = cleanName(
          `${rename.prefix}${apply(rename.pattern)}${rename.suffix}`,
          rename,
        );
        return isFile && partExt && !next.toLowerCase().endsWith(`.${partExt}`)
          ? `${next}.${partExt}`
          : next;
      },
      internal = renameEnabled
        ? parts.map((part, i) => renamePart(part, i === parts.length - 1)).join("/")
        : parts.join("/"),
      folder = rule ? apply(rule.destination) : "",
      planned = (classify
        ? `${sourceRoot}/${folder}/${internal.split("/").pop()}`
        : `${sourceRoot}/${internal}`
      ).replace(/\/+/g, "/");
    let collision: SmartEntry["collision"];
    const sameName = names.get(planned.toLowerCase()),
      sameHash = e.hash ? hashes.get(e.hash) : undefined;
    if (sameName)
      collision =
        sameName.hash === e.hash
          ? "same-name-same-content"
          : "same-name-different-content";
    else if (sameHash) collision = "same-content-different-name";
    let final = planned,
      included = true;
    if (collision) {
      if (policy === "skip") included = false;
      else if (policy === "duplicates-folder") final = `Doublons/${planned}`;
      else if (policy === "rename" || policy === "keep-both") {
        const dot = planned.lastIndexOf("."),
          tag = ` (${index + 1})`;
        final =
          dot > planned.lastIndexOf("/")
            ? `${planned.slice(0, dot)}${tag}${planned.slice(dot)}`
            : `${planned}${tag}`;
      }
    }
    const out: SmartEntry = {
      ...e,
      planned: final,
      category,
      family,
      familyIncomplete,
      collision,
      included,
      explanation: rule
        ? `Règle ${rule.priority} appliquée : ${rule.field} ${rule.operator} « ${rule.value || "tous"} » → ${rule.destination}`
        : `Arborescence originale conservée dans « ${sourceRoot} »`,
    };
    names.set(final.toLowerCase(), out);
    if (e.hash) hashes.set(e.hash, out);
    return out;
  });
}
