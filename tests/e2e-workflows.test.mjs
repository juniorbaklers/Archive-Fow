import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

// Browser-level regression tests for the flows the spec calls out explicitly
// (§22): zip-bomb quarantine, multi-archive name collisions, cancellation of
// an in-progress folder write, and the disk-space status display. These run
// against the real production build (already produced by `npm run build`,
// which the "test" script runs before this file) served by `vinext start`,
// driven by the same headless Chromium used for manual verification during
// development.
const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = 4180;
const BASE_URL = `http://localhost:${PORT}`;
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let serverProcess;
let browser;
let fixturesDir;

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server at ${url} did not become ready in time: ${lastError}`);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

before(async () => {
  fixturesDir = mkdtempSync(path.join(tmpdir(), "archiveflow-e2e-"));
  execFileSync("python3", [path.join(root, "tests", "fixtures", "make-e2e-fixtures.py"), fixturesDir]);

  serverProcess = spawn("npx", ["vinext", "start", "-p", String(PORT)], {
    cwd: root,
    stdio: "pipe",
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler-e2e.log" },
  });
  await withTimeout(waitForServer(BASE_URL), 60000, "waitForServer");

  browser = await withTimeout(
    chromium.launch({ executablePath: CHROMIUM_PATH, args: ["--no-sandbox"] }),
    60000,
    "chromium.launch",
  );
}, { timeout: 150000 });

after(async () => {
  if (browser) await withTimeout(browser.close(), 8000, "browser.close").catch(() => {});
  if (serverProcess) {
    const exited = new Promise((resolve) => serverProcess.once("exit", resolve));
    serverProcess.kill("SIGTERM");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
  }
  if (fixturesDir) rmSync(fixturesDir, { recursive: true, force: true });
  // Playwright/vinext can leave a handle open (e.g. a CDP pipe to the killed
  // browser process) that keeps the event loop alive even after everything
  // above has been closed or killed. node --test isolates each test file in
  // its own process, so forcing exit here - after our own cleanup and after
  // all this file's results have already been reported - is safe and just
  // avoids an indefinite hang.
  process.exit(0);
}, { timeout: 15000 });

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  return { page, consoleErrors };
}

// A minimal in-memory FileSystemDirectoryHandle/showDirectoryPicker polyfill,
// injected before the app loads. Headless Chromium has no real OS directory
// picker, so this stands in for it in the folder-write tests below. `delay`
// slows each simulated write just enough to leave a window for a mid-flight
// cancel click.
function directoryPickerMockScript(delayMs) {
  return `(() => {
    class MockFileHandle {
      constructor(name) { this.kind = "file"; this.name = name; this._data = new Uint8Array(0); }
      async getFile() {
        const data = this._data;
        return { name: this.name, size: data.length, lastModified: Date.now(), arrayBuffer: async () => data.buffer };
      }
      async createWritable() {
        const self = this;
        const chunks = [];
        return {
          write: async (chunk) => {
            await new Promise((r) => setTimeout(r, ${delayMs}));
            chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
          },
          close: async () => {
            const total = chunks.reduce((sum, c) => sum + c.length, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) { merged.set(c, offset); offset += c.length; }
            self._data = merged;
          },
        };
      }
    }
    class MockDirHandle {
      constructor(name) { this.kind = "directory"; this.name = name; this.children = new Map(); }
      async getFileHandle(name, opts) {
        const existing = this.children.get(name);
        if (existing) { if (existing.kind !== "file") throw new DOMException("mismatch", "TypeMismatchError"); return existing; }
        if (opts && opts.create) { const h = new MockFileHandle(name); this.children.set(name, h); return h; }
        throw new DOMException("not found", "NotFoundError");
      }
      async getDirectoryHandle(name, opts) {
        const existing = this.children.get(name);
        if (existing) { if (existing.kind !== "directory") throw new DOMException("mismatch", "TypeMismatchError"); return existing; }
        if (opts && opts.create) { const h = new MockDirHandle(name); this.children.set(name, h); return h; }
        throw new DOMException("not found", "NotFoundError");
      }
      async *entries() { for (const pair of this.children) yield pair; }
    }
    window.__mockRoot = new MockDirHandle("dossier-test");
    window.showDirectoryPicker = async () => window.__mockRoot;
  })();`;
}

test("quarantines a zip-bomb-style entry instead of extracting it", { timeout: 90000 }, async () => {
  const { page, consoleErrors } = await openPage();
  await page.locator(".homeaction", { hasText: "Extraire" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(path.join(fixturesDir, "bomb.zip"));
  await page.waitForTimeout(1000);

  const quarantineBanner = await page.locator(".v2error", { hasText: "quarantaine" }).count();
  assert.ok(quarantineBanner > 0, "expected a quarantine banner to be shown");
  const quarantineBadge = await page.locator(".integritybadge.unsafe", { hasText: "Quarantaine" }).count();
  assert.ok(quarantineBadge > 0, "expected a quarantine badge on the entry row");

  assert.deepEqual(consoleErrors, []);
  await page.close();
});

test("warns about duplicate archive names and still processes both under distinct roots", { timeout: 90000 }, async () => {
  const { page, consoleErrors } = await openPage();
  await page.locator(".homeaction", { hasText: "Extraire" }).click();
  await page.locator('input[type="file"]').first().setInputFiles([
    path.join(fixturesDir, "dup", "a", "rapport.zip"),
    path.join(fixturesDir, "dup", "b", "rapport.zip"),
  ]);
  await page.waitForTimeout(1000);

  const warningText = await page.locator(".pathwarning", { hasText: "Doublon possible" }).innerText();
  assert.match(warningText, /portent le même nom/);
  assert.match(warningText, /rapport/);

  const reportRoots = await page.locator(".archivereports span b").allInnerTexts();
  assert.equal(reportRoots.length, 2);
  assert.ok(reportRoots.every((name) => name === "rapport.zip"));

  const outputFolders = await page.locator(".archivereports small").allInnerTexts();
  assert.ok(outputFolders.some((t) => t.includes("rapport__archive_1")));
  assert.ok(outputFolders.some((t) => t.includes("rapport__archive_2")));

  assert.deepEqual(consoleErrors, []);
  await page.close();
});

test("cancelling a folder write stops it and reports the cancellation", { timeout: 90000 }, async () => {
  const { page, consoleErrors } = await openPage();
  await page.addInitScript({ content: directoryPickerMockScript(40) });
  await page.reload({ waitUntil: "networkidle" });

  await page.locator(".homeaction", { hasText: "Extraire" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(path.join(fixturesDir, "many.zip"));
  await page.waitForTimeout(1000);

  await page.locator(".folderbtn").click(); // choose (mocked) destination
  await page.waitForTimeout(500);
  await page.locator(".folderbtn").click(); // start writing
  await page.waitForSelector(".cancelbtn", { timeout: 20000 });
  await page.locator(".cancelbtn").click();

  await page.waitForFunction(
    () => !!document.querySelector(".v2error") && document.querySelector(".v2error").textContent.includes("annulée"),
    { timeout: 20000 },
  );
  const errorText = await page.locator(".v2error").innerText();
  assert.match(errorText, /annulée/);

  assert.deepEqual(consoleErrors, []);
  await page.close();
});

test("shows a disk-space estimate once a destination is analyzed", { timeout: 90000 }, async () => {
  const { page, consoleErrors } = await openPage();
  await page.addInitScript({ content: directoryPickerMockScript(0) });
  await page.reload({ waitUntil: "networkidle" });

  await page.locator(".homeaction", { hasText: "Extraire" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(path.join(fixturesDir, "many.zip"));
  await page.waitForTimeout(1000);

  await page.locator(".folderbtn").click();
  await page.waitForSelector(".destinationcheck", { timeout: 20000 });
  const statusText = await page.locator(".destinationcheck small").innerText();
  assert.match(statusText, /stockage (estimé disponible|non estimable)/);

  assert.deepEqual(consoleErrors, []);
  await page.close();
});
