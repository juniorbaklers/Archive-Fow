import { ArchiveEntry } from "./archive-utils";
import { CollisionPolicy } from "./smart-engine";

export type DestinationConflictKind = "file-vs-folder" | "folder-vs-file" | "same-path-same-content" | "same-path-different-content" | "same-content-other-path";
export type DestinationConflict = { entryPath: string; existingPath: string; kind: DestinationConflictKind };
export type DestinationAnalysis = { conflicts: DestinationConflict[]; requiredBytes: number; scannedFiles: number; spaceStatus: "unknown" };

const clean = (value: string) => value.replace(/\\/g, "/").split("/").filter((part) => part && part !== "." && part !== "..");
async function digest(data: BufferSource) {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function existingKind(dir: FileSystemDirectoryHandle, name: string) {
  try { return { kind: "file" as const, handle: await dir.getFileHandle(name) }; }
  catch (error) { if (error instanceof DOMException && error.name !== "NotFoundError" && error.name !== "TypeMismatchError") throw error; }
  try { return { kind: "directory" as const, handle: await dir.getDirectoryHandle(name) }; }
  catch (error) { if (error instanceof DOMException && error.name !== "NotFoundError" && error.name !== "TypeMismatchError") throw error; }
  return null;
}
async function scanFiles(dir: FileSystemDirectoryHandle, prefix = "", out: { path: string; hash: string }[] = []) {
  for await (const [name, handle] of (dir as any).entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") await scanFiles(handle, path, out);
    else out.push({ path, hash: await digest(await (await handle.getFile()).arrayBuffer()) });
  }
  return out;
}
export async function pickDestination() {
  const picker = (window as any).showDirectoryPicker as undefined | (() => Promise<FileSystemDirectoryHandle>);
  if (!picker) throw Error("La sélection d’un dossier nécessite Chrome ou Edge sur ordinateur.");
  return picker();
}
export async function analyzeDestination(root: FileSystemDirectoryHandle, entries: ArchiveEntry[]): Promise<DestinationAnalysis> {
  const existing = await scanFiles(root), hashes = new Map<string, string[]>(), conflicts: DestinationConflict[] = [];
  existing.forEach((item) => hashes.set(item.hash, [...(hashes.get(item.hash) || []), item.path]));
  for (const entry of entries) {
    const parts = clean(entry.planned || entry.name); let dir = root, blocked = false;
    for (let i = 0; i < parts.length - 1; i++) {
      const found = await existingKind(dir, parts[i]);
      if (found?.kind === "file") { conflicts.push({ entryPath: parts.join("/"), existingPath: parts.slice(0, i + 1).join("/"), kind: "folder-vs-file" }); blocked = true; break; }
      if (found?.kind === "directory") dir = found.handle; else break;
    }
    if (blocked) continue;
    const final = await existingKind(dir, parts.at(-1)!);
    if (entry.directory) {
      if (final?.kind === "file") conflicts.push({ entryPath: parts.join("/"), existingPath: parts.join("/"), kind: "folder-vs-file" });
      continue;
    }
    if (final?.kind === "directory") conflicts.push({ entryPath: parts.join("/"), existingPath: parts.join("/"), kind: "file-vs-folder" });
    else if (final?.kind === "file") {
      const same = (entry.hash || await digest(entry.data as BufferSource)) === await digest(await (await final.handle.getFile()).arrayBuffer());
      conflicts.push({ entryPath: parts.join("/"), existingPath: parts.join("/"), kind: same ? "same-path-same-content" : "same-path-different-content" });
    } else if (entry.hash) {
      const other = hashes.get(entry.hash)?.find((path) => path !== parts.join("/"));
      if (other) conflicts.push({ entryPath: parts.join("/"), existingPath: other, kind: "same-content-other-path" });
    }
  }
  return { conflicts, requiredBytes: entries.reduce((sum, entry) => sum + entry.size, 0), scannedFiles: existing.length, spaceStatus: "unknown" };
}
async function uniqueFileName(dir: FileSystemDirectoryHandle, name: string) {
  const dot = name.lastIndexOf("."), stem = dot > 0 ? name.slice(0, dot) : name, extension = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let index = 2; await existingKind(dir, candidate); index++) candidate = `${stem} (${index})${extension}`;
  return candidate;
}
export async function writeToDestination(root: FileSystemDirectoryHandle, entries: ArchiveEntry[], policy: CollisionPolicy, signal: AbortSignal, onProgress: (written: number, skipped: number, current: string) => void) {
  let written = 0, skipped = 0;
  for (const entry of entries) {
    if (signal.aborted) throw new DOMException("Opération annulée", "AbortError");
    const parts = clean(entry.planned || entry.name); let dir = root, impossible = false;
    for (const part of parts.slice(0, -1)) {
      const found = await existingKind(dir, part);
      if (found?.kind === "file") { impossible = true; break; }
      dir = found?.kind === "directory" ? found.handle : await dir.getDirectoryHandle(part, { create: true });
    }
    if (impossible) { skipped++; onProgress(written, skipped, parts.join("/")); continue; }
    if (entry.directory) {
      const folder = parts.at(-1)!;
      const found = await existingKind(dir, folder);
      if (!found) await dir.getDirectoryHandle(folder, { create: true });
      else if (found.kind === "file") { skipped++; onProgress(written, skipped, parts.join("/")); continue; }
      written++; onProgress(written, skipped, parts.join("/")); continue;
    }
    let filename = parts.at(-1)!; const found = await existingKind(dir, filename);
    if (found) {
      if (found.kind === "directory" || policy === "skip") { skipped++; onProgress(written, skipped, parts.join("/")); continue; }
      if (policy === "keep-both" || policy === "rename") filename = await uniqueFileName(dir, filename);
      if (policy === "duplicates-folder") { dir = await root.getDirectoryHandle("Doublons", { create: true }); filename = await uniqueFileName(dir, filename); }
    }
    const writer = await (await dir.getFileHandle(filename, { create: true })).createWritable();
    await writer.write(entry.data as FileSystemWriteChunkType); await writer.close();
    written++; onProgress(written, skipped, parts.join("/"));
  }
  return { written, skipped };
}
