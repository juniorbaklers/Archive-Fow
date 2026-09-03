export type ArchiveEntry = {
  name: string;
  size: number;
  data: Uint8Array;
  date?: Date;
  source: string;
  hash?: string;
  duplicate?: boolean;
  planned?: string;
  directory?: boolean;
  rootless?: boolean;
  quarantined?: boolean;
  quarantineReason?: string;
};
export type ZipCompression = "store" | "deflate";
export type SecurityLimits = {
  maxExpandedBytes: number;
  maxFiles: number;
  maxRatio: number;
  maxDepth: number;
};
export const DEFAULT_SECURITY_LIMITS: SecurityLimits = {
  maxExpandedBytes: 10 * 1024 * 1024 * 1024,
  maxFiles: 50000,
  maxRatio: 200,
  maxDepth: 20,
};
function securityError(detail: string) {
  throw Error(`Archive bloquée par sécurité : ${detail}. Modifiez les limites avancées seulement si vous faites confiance à cette archive.`);
}
function checkSecurity(name: string, count: number, total: number, compressed: number, limits: SecurityLimits) {
  const depth = safe(name).split("/").filter(Boolean).length;
  if (count > limits.maxFiles) securityError(`plus de ${limits.maxFiles.toLocaleString("fr-FR")} fichiers`);
  if (total > limits.maxExpandedBytes) securityError(`taille extraite supérieure à ${formatBytes(limits.maxExpandedBytes)}`);
  if (depth > limits.maxDepth) securityError(`profondeur supérieure à ${limits.maxDepth} dossiers`);
  const ratio = compressed > 0 ? total / compressed : total > 0 ? Infinity : 0;
  if (ratio > limits.maxRatio) securityError(`ratio de compression ${Math.round(ratio)}:1 supérieur à ${limits.maxRatio}:1`);
}
const u16 = (v: DataView, o: number) => v.getUint16(o, true),
  u32 = (v: DataView, o: number) => v.getUint32(o, true);
const safe = (n: string) =>
  n
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p && p !== ".." && p !== ".")
    .join("/");
const base = (n: string) => n.split("/").pop() || n;
export const ext = (n: string) => {
  const b = base(n),
    i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i + 1).toLowerCase() : "";
};
export function formatBytes(n: number) {
  if (n < 1024) return `${n} o`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} Ko`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} Mo`;
  return `${(n / 1073741824).toFixed(1)} Go`;
}
// Rough compression ratios by extension, used only for the pre-processing
// estimate shown to the user - never for the actual archive (which is built
// from the real bytes). Already-compressed formats barely shrink further;
// plain text/markup compresses well; anything unlisted gets a middle guess.
const COMPRESSIBILITY: Record<string, number> = {
  zip: 0.98, rar: 0.98, "7z": 0.98, gz: 0.98, tgz: 0.98, xz: 0.98, bz2: 0.98, "7zip": 0.98,
  jpg: 0.99, jpeg: 0.99, png: 0.98, gif: 0.98, webp: 0.99, avif: 0.99, heic: 0.99,
  mp3: 0.99, aac: 0.99, ogg: 0.99, flac: 0.97,
  mp4: 0.99, mov: 0.99, avi: 0.97, mkv: 0.99, webm: 0.99,
  pdf: 0.92,
  docx: 0.9, xlsx: 0.9, pptx: 0.9, odt: 0.9, ods: 0.9,
  doc: 0.6, xls: 0.6, ppt: 0.6,
  txt: 0.35, csv: 0.3, tsv: 0.3, json: 0.25, xml: 0.3, log: 0.3,
  html: 0.35, css: 0.35, js: 0.4, ts: 0.4, jsx: 0.4, tsx: 0.4, md: 0.4, sql: 0.3, yml: 0.3, yaml: 0.3,
};
const DEFAULT_COMPRESSIBILITY_RATIO = 0.7;
export type ProcessingEstimate = { totalBytes: number; estimatedOutputBytes: number; estimatedSeconds: number };
// Purely a heuristic to help the user gauge scale before launching a large
// job - never treated as exact, and never used to decide whether to proceed.
export function estimateProcessing(entries: { size: number; name: string; directory?: boolean }[], compress: boolean): ProcessingEstimate {
  const files = entries.filter((e) => !e.directory);
  const totalBytes = files.reduce((sum, e) => sum + e.size, 0);
  const estimatedOutputBytes = !compress
    ? totalBytes
    : Math.round(
        files.reduce((sum, e) => {
          const ext = e.name.toLowerCase().split(".").pop() || "";
          return sum + e.size * (COMPRESSIBILITY[ext] ?? DEFAULT_COMPRESSIBILITY_RATIO);
        }, 0),
      );
  // ~50 Mo/s is a conservative order-of-magnitude figure for in-browser
  // hashing + reading + compressing on typical hardware; real throughput
  // varies a lot by device, so this is only ever shown as an estimate.
  const estimatedSeconds = totalBytes / (50 * 1024 * 1024);
  return { totalBytes, estimatedOutputBytes, estimatedSeconds };
}
// Greedy bucketing for "split into archives of at most N Mo" - this produces
// several independent, self-contained archives (archive_part1.zip, _part2, ...),
// not an official spanned/multi-volume format (.z01+.zip, .partN.rar): each
// part opens on its own with any standard tool. A single file bigger than the
// limit gets its own bucket anyway, since a file can't be split mid-content.
export function bucketBySize<T extends { size: number }>(files: T[], maxBytes: number): T[][] {
  if (maxBytes <= 0) return files.length ? [files] : [];
  const buckets: T[][] = [];
  let current: T[] = [], currentBytes = 0;
  for (const file of files) {
    if (current.length && currentBytes + file.size > maxBytes) {
      buckets.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }
  if (current.length) buckets.push(current);
  return buckets;
}
export function formatDuration(seconds: number) {
  if (seconds < 1) return "< 1 s";
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
export function detectFormat(f: File) {
  const n = f.name.toLowerCase();
  if (n.endsWith(".tar.gz") || n.endsWith(".tgz")) return "TAR.GZ";
  if (n.endsWith(".zip")) return "ZIP";
  if (n.endsWith(".tar")) return "TAR";
  if (n.endsWith(".gz") || n.endsWith(".gzip")) return "GZIP";
  if (n.endsWith(".7z")) return "7Z";
  if (n.endsWith(".rar")) return "RAR";
  return "INCONNU";
}
async function decompress(data: Uint8Array, format: "deflate-raw" | "gzip") {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function compress(data: Uint8Array, format: "gzip" | "deflate-raw") {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function readZip(file: File, limits: SecurityLimits = DEFAULT_SECURITY_LIMITS) {
  const b = new Uint8Array(await file.arrayBuffer()),
    v = new DataView(b.buffer);
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (u32(v, i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("ZIP invalide ou incomplet.");
  let cur = u32(v, end + 16);
  const out: ArchiveEntry[] = [],
    dec = new TextDecoder();
  const entryCount = u16(v, end + 10);
  if (entryCount > limits.maxFiles) securityError(`plus de ${limits.maxFiles.toLocaleString("fr-FR")} fichiers`);
  let expandedTotal = 0, compressedTotal = 0;
  for (let i = 0; i < entryCount; i++) {
    if (u32(v, cur) !== 0x02014b50) throw Error("Structure ZIP non reconnue.");
    const method = u16(v, cur + 10),
      cs = u32(v, cur + 20),
      size = u32(v, cur + 24),
      nl = u16(v, cur + 28),
      el = u16(v, cur + 30),
      cl = u16(v, cur + 32),
      external = u32(v, cur + 38),
      lo = u32(v, cur + 42),
      name = safe(dec.decode(b.slice(cur + 46, cur + 46 + nl))),
      start = lo + 30 + u16(v, lo + 26) + u16(v, lo + 28),
      packed = b.slice(start, start + cs),
      unixType = (external >>> 16) & 0xf000,
      isDirectory =
        name.endsWith("/") || (external & 0x10) !== 0 || unixType === 0x4000;
    const entryRatio = cs > 0 ? size / cs : size > 0 ? Infinity : 0,
      suspicious = !isDirectory && entryRatio > limits.maxRatio;
    // A suspicious entry is quarantined instead of decompressed, so its claimed
    // size never counts against the aggregate limits below - it isn't actually
    // materialized in memory, so it can't contribute to a real bomb.
    if (!suspicious) {
      expandedTotal += size;
      compressedTotal += cs;
      checkSecurity(name, i + 1, expandedTotal, compressedTotal, limits);
    }
    if (!isDirectory) {
      if (suspicious) {
        out.push({
          name,
          size,
          data: new Uint8Array(),
          source: file.name,
          quarantined: true,
          quarantineReason: `ratio de compression ${Math.round(entryRatio)}:1 supérieur à ${limits.maxRatio}:1`,
        });
      } else {
        if (method !== 0 && method !== 8)
          throw Error(`Compression ZIP non prise en charge : ${name}`);
        out.push({
          name,
          size,
          data: method === 0 ? packed : await decompress(packed, "deflate-raw"),
          source: file.name,
        });
      }
    }
    cur += 46 + nl + el + cl;
  }
  return out;
}
function octal(bytes: Uint8Array) {
  return (
    parseInt(
      new TextDecoder().decode(bytes).replace(/\0.*$/, "").trim() || "0",
      8,
    ) || 0
  );
}
export function readTarBytes(bytes: Uint8Array, source: string) {
  const out: ArchiveEntry[] = [],
    dec = new TextDecoder();
  for (let o = 0; o + 512 <= bytes.length;) {
    if (bytes.slice(o, o + 512).every((x) => x === 0)) break;
    const name = safe(dec.decode(bytes.slice(o, o + 100)).replace(/\0.*$/, "")),
      size = octal(bytes.slice(o + 124, o + 136)),
      mtime = octal(bytes.slice(o + 136, o + 148)),
      type = bytes[o + 156];
    o += 512;
    if (name && type !== 53)
      out.push({
        name,
        size,
        data: bytes.slice(o, o + size),
        date: mtime ? new Date(mtime * 1000) : undefined,
        source,
      });
    o += Math.ceil(size / 512) * 512;
  }
  return out;
}
async function readWithLibarchive(file: File, limits: SecurityLimits): Promise<ArchiveEntry[]> {
  const { Archive } = await import("libarchive.js");
  Archive.init({
    workerUrl: `${import.meta.env.BASE_URL}libarchive/worker-bundle.js`,
  });
  const archive = await Archive.open(file);
  if (await archive.hasEncryptedData()) {
    const password = window.prompt(
      `L’archive ${file.name} est protégée. Saisissez son mot de passe :`,
    );
    if (!password) {
      await archive.close();
      throw Error("Extraction annulée : mot de passe requis.");
    }
    await archive.usePassword(password);
  }
  await archive.extractFiles();
  const files = await archive.getFilesArray();
  const out: ArchiveEntry[] = [];
  let total = 0;
  for (const item of files) {
    if (!(item.file instanceof File)) continue;
    const name = safe(`${item.path || ""}${item.file.name}`);
    total += item.file.size;
    checkSecurity(name, out.length + 1, total, file.size, limits);
    out.push({
      name,
      size: item.file.size,
      data: new Uint8Array(await item.file.arrayBuffer()),
      date: item.file.lastModified
        ? new Date(item.file.lastModified)
        : undefined,
      source: file.name,
    });
  }
  await archive.close();
  return out;
}
export async function readArchive(file: File, limits: SecurityLimits = DEFAULT_SECURITY_LIMITS) {
  const format = detectFormat(file),
    bytes = new Uint8Array(await file.arrayBuffer());
  if (format === "ZIP") {
    try {
      const files = await readZip(file, limits);
      if (files.length) return files;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Archive bloquée par sécurité")) throw error;
    }
    return readWithLibarchive(file, limits);
  }
  if (format === "TAR") return readTarBytes(bytes, file.name);
  if (format === "TAR.GZ")
    return readTarBytes(await decompress(bytes, "gzip"), file.name);
  if (format === "GZIP") {
    const name = file.name.replace(/\.(gz|gzip)$/i, "") || "fichier";
    const data = await decompress(bytes, "gzip");
    return [{ name, size: data.length, data, source: file.name }];
  }
  if (format === "7Z" || format === "RAR") return readWithLibarchive(file, limits);
  throw Error("Format non reconnu.");
}
function crc32(d: Uint8Array) {
  let c = 0xffffffff;
  for (const b of d) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function joinBytes(chunks: Uint8Array[], size: number) {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
export async function makeZip(entries: ArchiveEntry[], compression: ZipCompression = "store") {
  const enc = new TextEncoder(),
    local: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let localSize = 0,
    centralSize = 0;
  for (const f of entries) {
    const data = f.directory ? new Uint8Array() : f.data,
      cleanName = safe(f.planned || f.name) + (f.directory ? "/" : ""),
      name = enc.encode(cleanName),
      crc = crc32(data),
      shouldCompress = compression === "deflate" && !f.directory && data.length > 0,
      packed = shouldCompress ? await compress(data, "deflate-raw") : data,
      method = shouldCompress ? 8 : 0,
      localHeader = new Uint8Array(30),
      lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x800, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, packed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    const entryOffset = localSize;
    local.push(localHeader, name, packed);
    localSize += localHeader.length + name.length + packed.length;
    const centralHeader = new Uint8Array(46),
      cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    if (f.directory) cv.setUint32(38, 0x10, true);
    cv.setUint32(42, entryOffset, true);
    central.push(centralHeader, name);
    centralSize += centralHeader.length + name.length;
  }
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, localSize, true);
  return joinBytes(
    [...local, ...central, end],
    localSize + centralSize + end.length,
  );
}
function textField(text: string, length: number) {
  const b = new TextEncoder().encode(text),
    out = new Uint8Array(length);
  out.set(b.slice(0, length));
  return out;
}
export function makeTar(entries: ArchiveEntry[]) {
  const blocks: Uint8Array[] = [];
  for (const e of entries) {
    const data = e.directory ? new Uint8Array() : e.data,
      h = new Uint8Array(512),
      name = safe(e.planned || e.name) + (e.directory ? "/" : "");
    h.set(textField(name, 100), 0);
    h.set(textField("0000644\0", 8), 100);
    h.set(textField("0000000\0", 8), 108);
    h.set(textField("0000000\0", 8), 116);
    h.set(textField(data.length.toString(8).padStart(11, "0") + "\0", 12), 124);
    h.set(
      textField(
        Math.floor((e.date || new Date()).getTime() / 1000)
          .toString(8)
          .padStart(11, "0") + "\0",
        12,
      ),
      136,
    );
    h.fill(32, 148, 156);
    h[156] = e.directory ? 53 : 48;
    h.set(textField("ustar\0", 6), 257);
    h.set(textField("00", 2), 263);
    const sum = h.reduce((a, b) => a + b, 0);
    h.set(textField(sum.toString(8).padStart(6, "0") + "\0 ", 8), 148);
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const size = blocks.reduce((s, b) => s + b.length, 0),
    out = new Uint8Array(size);
  let o = 0;
  for (const b of blocks) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}
export async function makeTarGz(entries: ArchiveEntry[]) {
  return compress(makeTar(entries), "gzip");
}
export async function makeGzip(entry: ArchiveEntry) {
  return compress(entry.data, "gzip");
}
export async function hashEntries(entries: ArchiveEntry[]) {
  const seen = new Map<string, number>();
  return Promise.all(
    entries.map(async (e) => {
      if (e.directory) return { ...e, hash: undefined, duplicate: false };
      const digest = await crypto.subtle.digest(
          "SHA-256",
          e.data as BufferSource,
        ),
        hash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const count = seen.get(hash) || 0;
      seen.set(hash, count + 1);
      return { ...e, hash, duplicate: count > 0 };
    }),
  );
}
export function planEntries(
  entries: ArchiveEntry[],
  pattern: string,
  organize: boolean,
) {
  return entries.map((e, i) => {
    const extension = ext(e.name),
      raw = base(e.name),
      stem = extension ? raw.slice(0, -extension.length - 1) : raw,
      date = e.date || new Date(),
      renamed = (pattern || "{nom}.{extension}")
        .replaceAll("{nom}", stem)
        .replaceAll("{extension}", extension)
        .replaceAll("{date}", date.toISOString().slice(0, 10))
        .replaceAll("{numero}", String(i + 1).padStart(3, "0"))
        .replace(/\.$/, "");
    let folder = "";
    if (organize) {
      const types: { [k: string]: string } = {
        jpg: "Images",
        jpeg: "Images",
        png: "Images",
        gif: "Images",
        pdf: "Documents",
        doc: "Documents",
        docx: "Documents",
        txt: "Documents",
        xls: "Tableurs",
        xlsx: "Tableurs",
        csv: "Tableurs",
        mp3: "Audio",
        wav: "Audio",
        mp4: "Vidéos",
        mov: "Vidéos",
        zip: "Archives",
        tar: "Archives",
        gz: "Archives",
      };
      folder = `${types[extension] || "Autres"}/${date.getFullYear()}`;
    }
    return { ...e, planned: safe(folder ? `${folder}/${renamed}` : renamed) };
  });
}
export async function saveToFolder(entries: ArchiveEntry[]) {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker)
    throw Error(
      "L’enregistrement direct n’est pas disponible dans ce navigateur.",
    );
  const root = await picker();
  for (const e of entries) {
    const parts = (e.planned || e.name).split("/"),
      file = parts.pop()!;
    let dir = root;
    for (const p of parts)
      dir = await dir.getDirectoryHandle(p, { create: true });
    const handle = await dir.getFileHandle(file, { create: true }),
      writer = await handle.createWritable();
    await writer.write(e.data as FileSystemWriteChunkType);
    await writer.close();
  }
}
