#!/usr/bin/env python3
"""Builds the ZIP fixtures used by tests/e2e-workflows.test.mjs.

Usage: make-e2e-fixtures.py <output-dir>
Writes:
  bomb.zip              - one entry that compresses at a huge ratio (zip-bomb signature)
  dup/a/rapport.zip      \\  two archives that share the exact filename "rapport.zip"
  dup/b/rapport.zip      /   but different content, to exercise the duplicate-name warning
  many/f0000.txt..f0099.txt - 100 tiny files, zipped into many.zip, to give a folder-write
                               operation enough steps to cancel mid-way
"""
import io
import os
import sys
import tarfile
import zipfile

out_dir = sys.argv[1]


def write_zip(path, entries):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with zipfile.ZipFile(path, "w") as z:
        for name, content in entries:
            z.writestr(name, content, compress_type=zipfile.ZIP_DEFLATED)


# Zip-bomb signature: a large all-zero payload compresses far past any
# reasonable ratio threshold with plain DEFLATE.
write_zip(os.path.join(out_dir, "bomb.zip"), [("big.bin", b"\x00" * 3_000_000)])

# Two archives with the identical filename "rapport.zip" but different content.
write_zip(os.path.join(out_dir, "dup", "a", "rapport.zip"), [("a.txt", "content A")])
write_zip(os.path.join(out_dir, "dup", "b", "rapport.zip"), [("b.txt", "content B")])

# Many small files, so a folder-write operation has enough steps to cancel mid-way.
write_zip(
    os.path.join(out_dir, "many.zip"),
    [(f"f{i:04d}.txt", f"file number {i}") for i in range(100)],
)

# A real TAR archive saved under a .rar extension. detectFormat() picks the
# reader by extension, but libarchive (used for actual RAR/7Z, and as the
# ZIP fallback) auto-detects the real format from content - so this exercises
# exactly the same libarchive.js/WASM integration a genuine .rar file would,
# without needing WinRAR's proprietary (non-free) encoder to build one.
os.makedirs(out_dir, exist_ok=True)
with tarfile.open(os.path.join(out_dir, "not-really-rar.rar"), "w") as tar:
    for name, content in [("bonjour.txt", b"bonjour ArchiveFlow"), ("dossier/notes.txt", b"deuxieme fichier")]:
        info = tarfile.TarInfo(name=name)
        info.size = len(content)
        tar.addfile(info, io.BytesIO(content))

print("fixtures written to", out_dir)
