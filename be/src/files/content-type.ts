/**
 * What an event metadata file is allowed to be, decided by its BYTES.
 *
 * ## Why the request's Content-Type is not consulted
 *
 * The header is a claim made by the uploader. Enforcing an allow-list against
 * it is theatre: anyone can send `Content-Type: image/png` with an HTML
 * document in the body. Since these files are later served back from our own
 * origin, believing the header is the difference between "we host posters" and
 * "we host whatever anyone wants, under our domain name".
 *
 * So the header is ignored entirely and the leading bytes decide. A file whose
 * bytes are not one of the types below is refused, whatever it says it is.
 *
 * ## Why PDF is here, and what it is for
 *
 * The liability waiver. A waiver's whole legal value is being able to show what
 * a runner agreed to at the time, which is exactly what content addressing
 * provides: the URL is the sha256, so the document cannot be edited after
 * people have entered. An organiser pasting a link to their own Drive can
 * change it afterwards and nobody can prove it changed.
 *
 * PDF can carry JavaScript, and that is a real difference from an image. It is
 * accepted anyway, on a judgement that is worth stating rather than assuming:
 * the responses in `routes/files.ts` already send `default-src 'none'; sandbox`
 * and `nosniff`, which put the document in an opaque origin with no network of
 * its own, and modern browser PDF viewers are themselves sandboxed processes.
 * SVG is different in kind — it is script in the page's own origin, not a
 * document rendered by a viewer.
 *
 * What is deliberately NOT done: scanning the bytes for `/JS` or `/JavaScript`.
 * PDF object streams are compressible, so a string scan both misses obfuscated
 * cases and fires on legitimate content — a check that can be walked past is
 * worse than no check, because it is believed. The serving headers do not
 * depend on detecting anything.
 *
 * ## Why SVG is NOT here, and must not be added
 *
 * SVG is an XML document. It can carry `<script>`, `onload=`, and external
 * references, and browsers execute all of it when the document is served as
 * `image/svg+xml` and opened directly. Served from `api-sterun.jameshub.fun`,
 * that is stored cross-site scripting against our own origin, from a file any
 * signature holder can upload.
 *
 * The response headers in `routes/files.ts` (a `sandbox` CSP, `nosniff`) are a
 * second line of defence, not a licence to relax this one. If someone needs
 * vector posters later, the answer is rasterising on upload or a separate
 * origin — not adding a branch here.
 *
 * ## Why JSON is sniffed by parsing it
 *
 * There is no magic number for JSON. Parsing is a stronger check than any
 * prefix test would be: it proves the file is what the console will later try
 * to read, so a truncated upload is caught here rather than by the event page
 * failing to render three days before the race.
 */

/**
 * The event metadata document, and the images it points at.
 *
 * `application/json` is the one that carries the product claim — it is the
 * document `metadata_hash` commits to on-chain. The image types are here
 * because the poster is part of that document's content and hosting it
 * elsewhere puts the annoying step back in the wizard.
 */
export const ALLOWED_CONTENT_TYPES = [
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** File extension per type, used only to name the download. */
export const EXTENSIONS: Record<AllowedContentType, string> = {
  "application/json": "json",
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const startsWith = (bytes: Buffer, signature: readonly number[]): boolean => {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
};

/** `RIFF....WEBP` — four bytes of size sit between the two markers. */
const isWebp = (bytes: Buffer): boolean =>
  bytes.length >= 12 &&
  bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
  bytes.subarray(8, 12).toString("latin1") === "WEBP";

/**
 * ISO-BMFF: `....ftyp<brand>`. AVIF's brand is `avif` (single image) or `avis`
 * (image sequence). The brand can also appear in the compatible-brands list
 * that follows, which is why both positions are checked — an encoder is
 * allowed to put a different major brand first.
 */
const isAvif = (bytes: Buffer): boolean => {
  if (bytes.length < 16) return false;
  if (bytes.subarray(4, 8).toString("latin1") !== "ftyp") return false;
  // Major brand plus the compatible brands, which are 4 bytes each to the end
  // of the box. Cap the scan: a header claiming a huge box should not make us
  // read the whole file.
  const boxSize = Math.min(bytes.readUInt32BE(0), 64, bytes.length);
  const brands = bytes.subarray(8, boxSize).toString("latin1");
  return brands.includes("avif") || brands.includes("avis");
};

/**
 * A JPEG starts `FF D8 FF`. The fourth byte varies by marker (E0 for JFIF, E1
 * for Exif, DB for a bare frame), so it is deliberately not checked — pinning
 * it would reject camera output that every browser displays.
 */
const isJpeg = (bytes: Buffer): boolean => startsWith(bytes, [0xff, 0xd8, 0xff]);

const isPng = (bytes: Buffer): boolean =>
  startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isGif = (bytes: Buffer): boolean => {
  const head = bytes.subarray(0, 6).toString("latin1");
  return head === "GIF87a" || head === "GIF89a";
};

/**
 * PDF, proven by its header AND its trailer.
 *
 * `%PDF-` alone would accept a truncated upload that fails to open days later,
 * which is the same failure the JSON parse check exists to prevent — and for a
 * waiver, "the document does not open" on race day is worse than for a poster.
 *
 * The version digit is checked so a file that merely starts with the five magic
 * characters is not enough. `%%EOF` is looked for in the last 1024 bytes, which
 * is where the specification says it lives; trailing whitespace or a stray
 * newline after it is normal and tolerated.
 */
const isPdf = (bytes: Buffer): boolean => {
  if (bytes.length < 32) return false;
  if (!/^%PDF-[12]\.\d/.test(bytes.subarray(0, 9).toString("latin1"))) return false;
  const tail = bytes.subarray(Math.max(0, bytes.length - 1024)).toString("latin1");
  return tail.includes("%%EOF");
};

/**
 * JSON, proven by parsing.
 *
 * Only an object or an array counts. A bare `12` or `"poster"` is valid JSON
 * and is never a metadata document, so accepting it would only let a mistake
 * through to the point where it is expensive to notice.
 *
 * A UTF-8 BOM is tolerated: editors on Windows write one, `JSON.parse` rejects
 * it, and a file that every human tool calls valid JSON should not be refused
 * over a byte nobody can see. The BOM stays in the stored bytes — stripping it
 * would change the sha256, and the hash has to describe the file the organiser
 * actually uploaded.
 */
const isJson = (bytes: Buffer): boolean => {
  let text = bytes.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
};

/**
 * The type these bytes actually are, or `undefined` if it is not one we host.
 *
 * Order matters only in that the binary signatures are cheap and unambiguous,
 * so they run before the JSON parse — which is O(n) and would otherwise be
 * paid on every image upload.
 */
export function sniffContentType(bytes: Buffer): AllowedContentType | undefined {
  if (isPng(bytes)) return "image/png";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isGif(bytes)) return "image/gif";
  if (isWebp(bytes)) return "image/webp";
  if (isAvif(bytes)) return "image/avif";
  if (isPdf(bytes)) return "application/pdf";
  if (isJson(bytes)) return "application/json";
  return undefined;
}
