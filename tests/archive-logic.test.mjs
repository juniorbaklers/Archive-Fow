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
