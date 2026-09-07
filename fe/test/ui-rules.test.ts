/**
 * The two UI conventions from fe/CLAUDE.md, enforced instead of remembered.
 *
 * Both are the kind of rule that is easy to agree to and easy to break weeks
 * later in a hurry, and neither is something a linter checks. A failing test
 * names the file, so the fix takes seconds.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

/**
 * Walked by hand rather than with `fs.glob`: that is still experimental, and
 * @types/node 20 does not declare it, so it fails typecheck even where it runs.
 */
function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(relative(ROOT, full));
  }
  return found;
}

function sourceFiles(): string[] {
  return [...walk(join(ROOT, "app")), ...walk(join(ROOT, "src"))];
}

describe("no em dash in UI text", () => {
  it("finds none anywhere in app/ or src/", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const lines = readFileSync(join(ROOT, file), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        // Comments are exempt: the ban is about what a user reads on screen.
        const withoutComment = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (/[—–]/.test(withoutComment)) {
          offenders.push(`${file}:${index + 1} ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

describe("UI text is English", () => {
  // Not a language detector. A short list of Indonesian words common enough in
  // this team's writing that one slipping into a label is the realistic
  // failure, and rare enough in English to not fire on anything else.
  const INDONESIAN =
    /\b(dan|atau|yang|tidak|belum|sudah|dengan|untuk|dari|kamu|anda|silakan|daftar|masuk|keluar|simpan|batal|kembali|lanjut|pilih|cari|kirim|hapus|ubah|tambah|gagal|berhasil|sedang|harus|bisa)\b/i;

  it("finds no Indonesian in a JSX text node or user-facing string", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const lines = readFileSync(join(ROOT, file), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const withoutComment = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        // Only lines that carry rendered text: JSX children, or a string in a
        // prop that ends up on screen.
        const rendered = />([^<>{}]+)</.exec(withoutComment);
        const labelled = /(aria-label|placeholder|title|alt)=\{?["']([^"']+)["']/.exec(
          withoutComment,
        );
        const text = rendered?.[1] ?? labelled?.[2];
        if (text && INDONESIAN.test(text)) {
          offenders.push(`${file}:${index + 1} ${text.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

describe("no raw design values in components", () => {
  it("uses tokens rather than hex colours", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      // tokens.css is the one place hex belongs, and it is not a .ts/.tsx file.
      const lines = readFileSync(join(ROOT, file), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const withoutComment = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (/#[0-9a-fA-F]{3,8}\b/.test(withoutComment)) {
          offenders.push(`${file}:${index + 1} ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

describe("no custom property points at itself", () => {
  /**
   * `--radius-md: var(--radius-md)` inside `@theme inline` is a cycle. CSS does
   * not call it an error; it resolves to an empty value, so every rounded
   * corner in the app quietly went square and nothing anywhere complained.
   *
   * Found by looking at the page, which is why it is a test now.
   */
  it("finds none in globals.css", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    const offenders: string[] = [];

    for (const line of css.split(/\r?\n/)) {
      const match = /^\s*(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)/.exec(line);
      if (match && match[1] === match[2]) offenders.push(line.trim());
    }

    expect(offenders).toEqual([]);
  });
});
