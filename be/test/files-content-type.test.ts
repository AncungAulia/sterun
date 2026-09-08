/**
 * The type of an uploaded file is decided by its bytes.
 *
 * The point these tests defend is narrow and worth naming: the request's
 * `Content-Type` header is never consulted. Everything here works on buffers
 * only, because that is the whole security property — a file that lies about
 * what it is has to be caught by looking at it.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_CONTENT_TYPES,
  EXTENSIONS,
  sniffContentType,
} from "../src/files/content-type.js";

const png = (extra = 0) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(extra),
  ]);
const jpeg = (marker: number) => Buffer.from([0xff, 0xd8, 0xff, marker, 0x00, 0x10]);
const gif = (version: "87a" | "89a") => Buffer.from(`GIF${version}\x00\x00`, "latin1");
const webp = () =>
  Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from("WEBPVP8 ", "latin1"),
  ]);
/** `size ftyp <major> <minor> <compatible…>` */
const avif = (major: string, compatible = "") => {
  const body = Buffer.from(`ftyp${major}\x00\x00\x00\x00${compatible}`, "latin1");
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length + 4);
  return Buffer.concat([size, body]);
};

describe("positive", () => {
  it("recognises a PNG", () => {
    expect(sniffContentType(png(64))).toBe("image/png");
  });

  it.each([
    ["JFIF", 0xe0],
    ["Exif", 0xe1],
    ["a bare frame", 0xdb],
  ])("recognises a JPEG whose fourth byte is %s", (_label, marker) => {
    // The fourth byte varies by producer. Pinning it would reject camera
    // output that every browser displays.
    expect(sniffContentType(jpeg(marker))).toBe("image/jpeg");
  });

  it.each([["87a"], ["89a"]] as const)("recognises a GIF%s", (version) => {
    expect(sniffContentType(gif(version))).toBe("image/gif");
  });

  it("recognises a WebP", () => {
    expect(sniffContentType(webp())).toBe("image/webp");
  });

  it("recognises an AVIF whose major brand is avif", () => {
    expect(sniffContentType(avif("avif"))).toBe("image/avif");
  });

  it("recognises an AVIF that declares avif only as a compatible brand", () => {
    // Encoders are allowed to put a different major brand first; rejecting
    // those would refuse files that display everywhere.
    expect(sniffContentType(avif("mif1", "avif"))).toBe("image/avif");
  });

  it("recognises a JSON object", () => {
    expect(sniffContentType(Buffer.from('{"name":"Borobudur 10K"}'))).toBe("application/json");
  });

  it("recognises a JSON array", () => {
    expect(sniffContentType(Buffer.from("[1,2,3]"))).toBe("application/json");
  });

  it("has an extension for every type it can return", () => {
    // Otherwise a type could be accepted at upload and then have no filename
    // to be stored under, which the store would only discover at runtime.
    for (const type of ALLOWED_CONTENT_TYPES) {
      expect(EXTENSIONS[type]).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe("negative", () => {
  it("REFUSES SVG, even though it is an image", () => {
    // The single most important case in this file. SVG is an XML document that
    // can carry <script>; served from our own origin it is stored XSS against
    // the same host that serves the PII vault.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(sniffContentType(svg)).toBeUndefined();
  });

  it("refuses HTML", () => {
    expect(sniffContentType(Buffer.from("<!doctype html><h1>hi</h1>"))).toBeUndefined();
  });

  it("refuses an ELF binary", () => {
    expect(sniffContentType(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]))).toBeUndefined();
  });

  it("refuses a PDF", () => {
    expect(sniffContentType(Buffer.from("%PDF-1.7\n"))).toBeUndefined();
  });

  it("refuses a ZIP, which is what a .docx or a .jar arrives as", () => {
    expect(sniffContentType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBeUndefined();
  });

  it("refuses HTML that has been given a .png name — the name never reaches here", () => {
    // Restating the design: this function sees bytes and nothing else, so
    // there is no filename or header for an attacker to dress it up with.
    expect(sniffContentType(Buffer.from("<html><script>steal()</script></html>"))).toBeUndefined();
  });

  it("refuses truncated JSON", () => {
    // Catching this here means a half-uploaded metadata document fails at
    // upload rather than when the event page tries to render it.
    expect(sniffContentType(Buffer.from('{"name":"Borobudur'))).toBeUndefined();
  });

  it("refuses JSON that is a bare number", () => {
    expect(sniffContentType(Buffer.from("12"))).toBeUndefined();
  });

  it("refuses JSON that is a bare string", () => {
    expect(sniffContentType(Buffer.from('"poster"'))).toBeUndefined();
  });

  it("refuses JSON null, which parses but is not a document", () => {
    expect(sniffContentType(Buffer.from("null"))).toBeUndefined();
  });

  it("refuses an empty buffer", () => {
    expect(sniffContentType(Buffer.alloc(0))).toBeUndefined();
  });
});

describe("edge", () => {
  it("accepts JSON behind a UTF-8 BOM", () => {
    // Windows editors write one and JSON.parse rejects it. Refusing a file
    // every human tool calls valid JSON over an invisible byte is not a
    // defensible answer.
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}')]);
    expect(sniffContentType(withBom)).toBe("application/json");
  });

  it("accepts JSON with leading whitespace", () => {
    expect(sniffContentType(Buffer.from('\n\t  {"a":1}'))).toBe("application/json");
  });

  it("does not mistake a PNG header shorter than the signature for a PNG", () => {
    expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e]))).toBeUndefined();
  });

  it("does not accept RIFF that is not WEBP, such as a WAV", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WAVEfmt ", "latin1"),
    ]);
    expect(sniffContentType(wav)).toBeUndefined();
  });

  it("does not accept an ISO-BMFF file that is not AVIF, such as an MP4", () => {
    expect(sniffContentType(avif("isom", "mp41"))).toBeUndefined();
  });

  it("does not read past a sane header length when the box size is absurd", () => {
    // A crafted file claiming a 4 GB ftyp box should not turn a sniff into a
    // huge string allocation.
    const body = Buffer.from("ftypmif1", "latin1");
    const size = Buffer.alloc(4);
    size.writeUInt32BE(0xffffffff);
    const bomb = Buffer.concat([size, body, Buffer.alloc(64)]);
    expect(sniffContentType(bomb)).toBeUndefined();
  });

  it("treats a JSON document containing the word svg as JSON, not as a script", () => {
    expect(sniffContentType(Buffer.from('{"poster":"a.svg"}'))).toBe("application/json");
  });
});
