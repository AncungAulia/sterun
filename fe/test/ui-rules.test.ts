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

/**
 * What the sweeps actually look at: a line with its comments taken off.
 *
 * Every rule here is about what a user reads on screen, so a comment is exempt
 * from all of them. It is a named function rather than two `replace` calls
 * repeated in four places so that the self-check below can run the real thing
 * instead of testing a regex the sweep might no longer use.
 */
function stripComments(line: string): string {
  return line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
}

/**
 * Every spelling of the two banned characters, not just the literal one.
 *
 * A literal em dash is the obvious form and the easy one to grep for. It is
 * also not the form that got through: a size chart cell written as an escape
 * renders the same character on screen while reading as plain ASCII in the
 * file, and three of those sat in the size chart for a week under a green
 * test. An entity does the same thing in JSX. So the rule is enforced on what
 * reaches the screen rather than on what is easy to see in the source.
 */
const BANNED_DASH = /[—–]|\\u201[34]|&mdash;|&ndash;|&#821[12];|&#x201[34];/i;

describe("no em dash in UI text", () => {
  it("finds none anywhere in app/ or src/, written any way", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const lines = readFileSync(join(ROOT, file), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        // Comments are exempt: the ban is about what a user reads on screen.
        const withoutComment = stripComments(line);
        if (BANNED_DASH.test(withoutComment)) {
          offenders.push(`${file}:${index + 1} ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("catches an escaped or entity-encoded dash, not only a literal one", () => {
    // The regression this test exists for: the size chart's empty cells were
    // em dashes written as escapes, and the old rule read straight past them.
    expect(BANNED_DASH.test('{size.chestCm ?? "\\u2014"}')).toBe(true);
    expect(BANNED_DASH.test("<p>10K &mdash; 21K</p>")).toBe(true);
    expect(BANNED_DASH.test("<p>10K &#8211; 21K</p>")).toBe(true);
    expect(BANNED_DASH.test("<p>10K to 21K</p>")).toBe(false);
    expect(BANNED_DASH.test("const u = new Uint8Array(32);")).toBe(false);
  });

  it("still catches an escaped dash after the stripping the sweep does", () => {
    // The two cases above test the pattern on its own, which leaves the other
    // half of the sweep unguarded: if `stripComments` ever ate more of a line
    // than a comment, every rule here would go quiet while passing. So this
    // one runs the real stripping first, the way the sweep does.
    const rendered = '          <td>{size.chestCm ?? "\\u2014"}</td> // an escape, on screen';
    expect(BANNED_DASH.test(stripComments(rendered))).toBe(true);

    // And the exemption itself still holds: a dash inside a comment is fine.
    expect(BANNED_DASH.test(stripComments("  // an em dash \\u2014 in a comment"))).toBe(false);
    expect(BANNED_DASH.test(stripComments(" * an em dash \\u2014 in a block comment"))).toBe(false);
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
        const withoutComment = stripComments(line);
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
        const withoutComment = stripComments(line);
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
