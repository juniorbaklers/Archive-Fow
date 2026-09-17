import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Pure-logic tests for the archive engine: run the real TS modules through a
// Vite SSR module loader (same approach as tests/ui-components.test.mjs) so
// no build step or browser is needed - CompressionStream, DecompressionStream
// and crypto.subtle are all available natively in this Node runtime.
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => {
  await vite.close();
});

const loadArchiveUtils = () => vite.ssrLoadModule("/app/archive-utils.ts");
const loadSmartEngine = () => vite.ssrLoadModule("/app/smart-engine.ts");
const loadDestinationUtils = () => vite.ssrLoadModule("/app/destination-utils.ts");

// A mock FileSystemDirectoryHandle that mimics the real File System Access
// API: getFileHandle() rejects with a TypeError for names containing
// characters that are illegal on real filesystems, exactly like Chrome does
// against a real destination folder.
class MockFileHandle {
  constructor(name) { this.kind = "file"; this.name = name; this._data = new Uint8Array(0); }
  async getFile() { return { name: this.name, size: this._data.length, arrayBuffer: async () => this._data.buffer }; }
  async createWritable() {
    const self = this;
    return {
      write: async (chunk) => { self._data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk); },
      close: async () => {},
    };
  }
}
class MockDirHandle {
  constructor(name) { this.kind = "directory"; this.name = name; this.children = new Map(); }
  async getFileHandle(name, opts) {
    if (/[:*?"<>|]/.test(name)) throw new TypeError(`Failed to execute 'getFileHandle': Name contains invalid characters: ${name}`);
    const existing = this.children.get(name);
    if (existing) return existing;
    if (opts && opts.create) { const h = new MockFileHandle(name); this.children.set(name, h); return h; }
    throw new DOMException("not found", "NotFoundError");
  }
  async getDirectoryHandle(name, opts) {
    const existing = this.children.get(name);
    if (existing) return existing;
    if (opts && opts.create) { const h = new MockDirHandle(name); this.children.set(name, h); return h; }
    throw new DOMException("not found", "NotFoundError");
  }
}

test("ZIP round-trip preserves content and path with deflate compression", async () => {
  const { makeZip, readArchive } = await loadArchiveUtils();
  const text = "Hello, ArchiveFlow! ".repeat(500);
  const data = new TextEncoder().encode(text);
  const entries = [{ name: "docs/readme.txt", size: data.length, data, source: "test" }];
  const zipBytes = await makeZip(entries, "deflate");
  const file = new File([zipBytes], "roundtrip.zip", { type: "application/zip" });
  const read = await readArchive(file);
  assert.equal(read.length, 1);
  assert.equal(read[0].name, "docs/readme.txt");
  assert.equal(new TextDecoder().decode(read[0].data), text);
});

test("ZIP round-trip preserves empty directory entries", async () => {
  const { makeZip, readArchive } = await loadArchiveUtils();
  const entries = [
    { name: "DCIM", size: 0, data: new Uint8Array(), source: "test", directory: true },
    { name: "docs/readme.txt", size: 5, data: new TextEncoder().encode("hello"), source: "test" },
  ];
  const zipBytes = await makeZip(entries, "deflate");
  const file = new File([zipBytes], "empty-folder.zip", { type: "application/zip" });
  const read = await readArchive(file);
  assert.equal(read.length, 2);
  const dcim = read.find((e) => e.name === "DCIM");
  assert.ok(dcim, "empty directory entry must survive the ZIP round-trip");
  assert.equal(dcim.directory, true);
});

test("TAR round-trip preserves empty directory entries", async () => {
  const { makeTar, readTarBytes } = await loadArchiveUtils();
  const entries = [
    { name: "DCIM", size: 0, data: new Uint8Array(), source: "test", directory: true },
    { name: "docs/readme.txt", size: 5, data: new TextEncoder().encode("hello"), source: "test" },
  ];
  const tarBytes = makeTar(entries);
  const read = readTarBytes(tarBytes, "test.tar");
  assert.equal(read.length, 2);
  const dcim = read.find((e) => e.name.replace(/\/$/, "") === "DCIM");
  assert.ok(dcim, "empty directory entry must survive the TAR round-trip");
  assert.equal(dcim.directory, true);
});

// Minimal hand-built TAR blocks to exercise the extensions real-world tar
// tools use for paths longer than the classic 100-byte name field, without
// depending on a system `tar` binary being available to the test runner.
function tarHeader({ name = "", size = 0, type = "0" }) {
  const h = new Uint8Array(512), enc = new TextEncoder();
  h.set(enc.encode(name.slice(0, 100)), 0);
  h.set(enc.encode(size.toString(8).padStart(11, "0") + "\0"), 124);
  h[156] = type.charCodeAt(0);
  return h;
}
function padTo512(bytes) {
  const out = new Uint8Array(Math.ceil(bytes.length / 512) * 512);
  out.set(bytes);
  return out;
}
function concatBytes(...chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0), out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}
function paxRecord(key, value) {
  const enc = new TextEncoder();
  let len = key.length + value.length + 4;
  for (;;) {
    const candidate = enc.encode(`${len} ${key}=${value}\n`);
    if (candidate.length === len) return candidate;
    len = candidate.length;
  }
}

test("TAR reader follows a GNU longname entry to recover a path over 100 bytes", async () => {
  const { readTarBytes } = await loadArchiveUtils();
  const longName = "un_dossier_avec_un_chemin_deliberement_tres_long_pour_depasser_la_limite/fichier_final.txt";
  const enc = new TextEncoder();
  const longNameData = enc.encode(`${longName}\0`);
  const longNameBlock = concatBytes(tarHeader({ name: "././@LongLink", size: longNameData.length, type: "L" }), padTo512(longNameData));
  const content = enc.encode("contenu");
  const realBlock = concatBytes(tarHeader({ name: longName.slice(0, 99), size: content.length, type: "0" }), padTo512(content));
  const tarBytes = concatBytes(longNameBlock, realBlock, new Uint8Array(1024));

  const read = readTarBytes(tarBytes, "test.tar");
  assert.equal(read.length, 1);
  assert.equal(read[0].name, longName);
  assert.equal(new TextDecoder().decode(read[0].data), "contenu");
});

test("TAR reader follows a PAX extended header to recover a long path with multi-byte characters", async () => {
  const { readTarBytes } = await loadArchiveUtils();
  // "été" is multi-byte in UTF-8 - the PAX record length is a byte count,
  // so this also guards against decoding the whole header to a string
  // before slicing by that length (which drifts out of sync as soon as a
  // multi-byte character appears before the end of the record).
  const longName = "dossier_projet/rapport_de_synthese_été_2026_" + "x".repeat(60) + ".txt";
  const record = paxRecord("path", longName);
  const paxBlock = concatBytes(tarHeader({ name: "PaxHeaders/x", size: record.length, type: "x" }), padTo512(record));
  const enc = new TextEncoder();
  const content = enc.encode("bonjour");
  const realBlock = concatBytes(tarHeader({ name: longName.slice(0, 99), size: content.length, type: "0" }), padTo512(content));
  const tarBytes = concatBytes(paxBlock, realBlock, new Uint8Array(1024));

  const read = readTarBytes(tarBytes, "test.tar");
  assert.equal(read.length, 1);
  assert.equal(read[0].name, longName);
  assert.equal(new TextDecoder().decode(read[0].data), "bonjour");
});

test("writeToDestination skips a file it cannot write instead of aborting the whole batch", async () => {
  const { writeToDestination } = await loadDestinationUtils();
  const root = new MockDirHandle("dest");
  const entries = [
    { name: "a.txt", planned: "a.txt", size: 3, data: new TextEncoder().encode("aaa"), source: "t" },
    { name: "bad:name.txt", planned: "bad:name.txt", size: 3, data: new TextEncoder().encode("bbb"), source: "t" },
    { name: "c.txt", planned: "c.txt", size: 3, data: new TextEncoder().encode("ccc"), source: "t" },
    { name: "d.txt", planned: "d.txt", size: 3, data: new TextEncoder().encode("ddd"), source: "t" },
  ];
  const result = await writeToDestination(root, entries, "keep-both", new AbortController().signal, () => {}, "fr");
  assert.equal(result.written, 3, "the 3 writable entries must still be written");
  assert.equal(result.skipped, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].path, "bad:name.txt");
  assert.deepEqual([...root.children.keys()].sort(), ["a.txt", "c.txt", "d.txt"]);
});

test("quarantines an entry with an abnormal compression ratio instead of decompressing it", async () => {
  const { makeZip, readZip, DEFAULT_SECURITY_LIMITS } = await loadArchiveUtils();
  const data = new Uint8Array(2_000_000); // all zeros: compresses far past the default 200:1 ratio limit
  const entries = [{ name: "big.bin", size: data.length, data, source: "test" }];
  const zipBytes = await makeZip(entries, "deflate");
  const file = new File([zipBytes], "bomb.zip", { type: "application/zip" });
  const read = await readZip(file, DEFAULT_SECURITY_LIMITS);
  assert.equal(read.length, 1);
  assert.equal(read[0].quarantined, true);
  assert.equal(read[0].data.length, 0);
  assert.match(read[0].quarantineReason, /ratio/);
});

test("blocks archives exceeding the configured file-count limit", async () => {
  const { makeZip, readZip } = await loadArchiveUtils();
  const mkEntry = (name) => {
    const data = new TextEncoder().encode(`content of ${name}`);
    return { name, size: data.length, data, source: "test" };
  };
  const zipBytes = await makeZip([mkEntry("a.txt"), mkEntry("b.txt"), mkEntry("c.txt")], "store");
  const file = new File([zipBytes], "many.zip", { type: "application/zip" });
  await assert.rejects(
    () => readZip(file, { maxExpandedBytes: 10 * 1024 ** 3, maxFiles: 2, maxRatio: 200, maxDepth: 20 }),
    /Archive bloquée par sécurité/,
  );
});

test("blocks archives exceeding the configured folder-depth limit", async () => {
  const { makeZip, readZip } = await loadArchiveUtils();
  const data = new TextEncoder().encode("deep");
  const deepName = `${Array.from({ length: 10 }, (_, i) => `level${i}`).join("/")}/file.txt`;
  const zipBytes = await makeZip([{ name: deepName, size: data.length, data, source: "test" }], "store");
  const file = new File([zipBytes], "deep.zip", { type: "application/zip" });
  await assert.rejects(
    () => readZip(file, { maxExpandedBytes: 10 * 1024 ** 3, maxFiles: 50000, maxRatio: 200, maxDepth: 5 }),
    /Archive bloquée par sécurité/,
  );
});

const baseRename = {
  pattern: "{nom}", project: "", prefix: "", suffix: "", caseMode: "none",
  removeAccents: false, spaces: "keep", search: "", replace: "", regex: false,
  maxLength: 200, windowsSafePaths: false, relativePathLimit: 500,
};

test("enrichEntries applies collision policies (skip / keep-both / duplicates-folder)", async () => {
  const { enrichEntries, DEFAULT_CATEGORIES } = await loadSmartEngine();
  const mk = (hash) => ({ name: "report.txt", size: 10, data: new Uint8Array(10), source: "root", hash });

  let out = enrichEntries([mk("h1"), mk("h2")], [], DEFAULT_CATEGORIES, baseRename, "skip", false, false);
  assert.equal(out[0].included, true);
  assert.equal(out[1].included, false);

  out = enrichEntries([mk("h1"), mk("h2")], [], DEFAULT_CATEGORIES, baseRename, "keep-both", false, false);
  assert.equal(out[0].included, true);
  assert.equal(out[1].included, true);
  assert.notEqual(out[0].planned, out[1].planned);

  out = enrichEntries([mk("h1"), mk("h2")], [], DEFAULT_CATEGORIES, baseRename, "duplicates-folder", false, false);
  assert.match(out[1].planned, /^Doublons\//);
});

test("path shortening only compacts folder segments, never the filename", async () => {
  const { enrichEntries, DEFAULT_CATEGORIES } = await loadSmartEngine();
  const rename = { ...baseRename, windowsSafePaths: true, relativePathLimit: 40 };
  const longFolder = "un-tres-long-nom-de-dossier-qui-depasse-largement-la-limite-configuree";
  const filename = "rapport-final-du-projet.pdf";
  const entry = { name: `${longFolder}/${filename}`, size: 5, data: new Uint8Array(5), source: "root" };
  const [out] = enrichEntries([entry], [], DEFAULT_CATEGORIES, rename, "keep-both", false, false);
  assert.equal(out.pathAdjusted, true);
  const segments = out.planned.split("/");
  assert.equal(segments.at(-1), filename);
  assert.ok(out.planned.length < `root/${longFolder}/${filename}`.length);
});

test("bucketBySize groups files into archives no larger than the limit", async () => {
  const { bucketBySize } = await loadArchiveUtils();
  const buckets = bucketBySize([{ size: 100 }, { size: 100 }, { size: 100 }, { size: 250 }], 250);
  assert.deepEqual(buckets.map((b) => b.length), [2, 1, 1]);
  for (const bucket of buckets) assert.ok(bucket.reduce((s, f) => s + f.size, 0) <= 250);
  assert.equal(bucketBySize([{ size: 10 }, { size: 20 }], 0).length, 1);
  assert.deepEqual(bucketBySize([], 100), []);
});

test("detectMultiPart reconstructs sequential parts and flags unsupported multi-volume sets", async () => {
  const { detectMultiPart } = await loadArchiveUtils();
  const f = (name, content) => new File([content], name);
  const files = [
    f("data.zip.001", "AAAA"), f("data.zip.002", "BBBB"), f("data.zip.003", "CCCC"),
    f("photos.z01", "x"), f("photos.z02", "x"), f("photos.zip", "x"),
    f("backup.part1.rar", "x"), f("backup.part2.rar", "x"),
    f("normal.txt", "hello"),
  ];
  const { groups, rest } = detectMultiPart(files);
  const concatGroup = groups.find((g) => g.kind === "concat");
  assert.ok(concatGroup);
  assert.equal(concatGroup.baseName, "data.zip");
  assert.equal(concatGroup.files.length, 3);
  assert.equal(groups.filter((g) => g.kind === "unsupported").length, 2);
  assert.equal(rest.length, 1);
  assert.equal(rest[0].name, "normal.txt");
});

test("extractNestedArchives opens an archive nested inside another archive", async () => {
  const { makeZip, extractNestedArchives, DEFAULT_SECURITY_LIMITS } = await loadArchiveUtils();
  const innerData = new TextEncoder().encode("nested content");
  const innerZip = await makeZip([{ name: "hello.txt", size: innerData.length, data: innerData, source: "inner" }], "store");
  const entries = [
    { name: "inner.zip", size: innerZip.length, data: innerZip, source: "outer" },
    { name: "top.txt", size: 3, data: new TextEncoder().encode("top"), source: "outer" },
  ];
  const result = await extractNestedArchives(entries, DEFAULT_SECURITY_LIMITS, 3);
  assert.deepEqual(result.map((e) => e.name).sort(), ["inner/hello.txt", "top.txt"]);
});

test("extractNestedArchives does not recurse when depth is exhausted", async () => {
  const { makeZip, extractNestedArchives, DEFAULT_SECURITY_LIMITS } = await loadArchiveUtils();
  const innerData = new TextEncoder().encode("nested content");
  const innerZip = await makeZip([{ name: "hello.txt", size: innerData.length, data: innerData, source: "inner" }], "store");
  const entries = [{ name: "inner.zip", size: innerZip.length, data: innerZip, source: "outer" }];
  const result = await extractNestedArchives(entries, DEFAULT_SECURITY_LIMITS, 0);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "inner.zip");
});

test("estimateProcessing distinguishes compressible content from already-compressed content", async () => {
  const { estimateProcessing } = await loadArchiveUtils();
  const files = [{ name: "notes.txt", size: 1000 }, { name: "photo.jpg", size: 1000 }];
  const withoutCompression = estimateProcessing(files, false);
  assert.equal(withoutCompression.estimatedOutputBytes, 2000);
  const withCompression = estimateProcessing(files, true);
  assert.ok(withCompression.estimatedOutputBytes < 2000);
  assert.ok(withCompression.estimatedSeconds >= 0);
});

test("i18n covers the same keys in French and English, with a working fallback", async () => {
  const { translate } = await vite.ssrLoadModule("/app/i18n.ts");
  assert.equal(translate("fr", "nav.home"), "Accueil");
  assert.equal(translate("en", "nav.home"), "Home");
  assert.notEqual(translate("fr", "nav.home"), translate("en", "nav.home"));
});

test("localizedFsErrorMessage translates native browser/file-system errors instead of leaking their English text", async () => {
  const { localizedFsErrorMessage } = await loadArchiveUtils();
  const notFound = new DOMException("A requested file or directory could not be found at the time an operation was processed.", "NotFoundError");
  assert.equal(localizedFsErrorMessage(notFound, "fr"), "Fichier ou dossier introuvable au moment du traitement (déplacé, renommé ou supprimé entre-temps).");
  assert.equal(localizedFsErrorMessage(notFound, "en"), "File or folder not found while processing it (moved, renamed, or deleted in the meantime).");

  const badName = new TypeError("Failed to execute 'getFileHandle' on 'FileSystemDirectoryHandle': Name is not allowed.");
  assert.match(localizedFsErrorMessage(badName, "fr"), /caractère non autorisé/);

  // Our own already-translated errors must pass through unchanged, not get
  // wrapped in a "browser technical error" prefix meant only for native ones.
  const ownError = new Error("Contrôle d’intégrité échoué : le nombre d’éléments traités ne correspond pas à la sélection.");
  assert.equal(localizedFsErrorMessage(ownError, "fr"), ownError.message);
});
