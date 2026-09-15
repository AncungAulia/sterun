/**
 * The receipt as a PDF page, drawn in the browser (STE-21, mockup block 6).
 *
 * What it says comes from `receipt.ts`, which is tested; this file only lays it
 * out. jspdf is imported on press, so the library never loads for a runner who
 * does not download.
 *
 * Colours are read from the same custom properties the app paints with, so the
 * file follows Nabil's tokens and no colour is written down twice. Where a
 * property does not resolve, the file falls back to black on white.
 *
 * Browser only: it needs `document`, a canvas for the logo, and a download.
 */
import { EXPLORER_BASE } from "@/lib/chain/env";
import type { StoredEntry } from "@/modules/entry/lib/entry-store";

import { buildReceipt } from "./receipt";

type Rgb = [number, number, number];

/** A5, in points. */
const PAGE_WIDTH = 419.53;
const MARGIN = 32;
const CONTENT = PAGE_WIDTH - MARGIN * 2;

export async function downloadReceipt(entry: StoredEntry): Promise<void> {
  const [{ jsPDF }, logo] = await Promise.all([import("jspdf"), logoPng()]);
  const receipt = buildReceipt(entry, EXPLORER_BASE);
  const ink = token("--color-ink");
  const muted = token("--color-n-500");
  const hairline = token("--color-n-100", [230, 230, 230]);
  const paper = token("--color-paper", [248, 248, 248]);
  const teal = token("--color-teal-500");
  const tealSurface = token("--color-teal-50", [240, 248, 250]);
  const tealBorder = token("--color-teal-200", [200, 220, 230]);

  const doc = new jsPDF({ unit: "pt", format: "a5" });
  let y = MARGIN;

  // Header: the lockup on the left, the title and date on the right.
  if (logo) {
    const height = 16;
    doc.addImage(logo.data, "PNG", MARGIN, y, (logo.width / logo.height) * height, height);
  } else {
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...ink).text("STERUN", MARGIN, y + 13);
  }
  doc.setFont("helvetica", "bolditalic").setFontSize(14).setTextColor(...ink);
  doc.text("Entry receipt", PAGE_WIDTH - MARGIN, y + 11, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...muted);
  doc.text(receipt.issuedOn, PAGE_WIDTH - MARGIN, y + 24, { align: "right" });
  y += 34;
  doc.setDrawColor(...ink).setLineWidth(1.5).line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 16;

  // The bib: the number large, the race and the name beside it.
  const bibHeight = 56;
  doc.setFillColor(...paper).rect(MARGIN, y, CONTENT, bibHeight, "F");
  doc.setFont("helvetica", "bold").setFontSize(30).setTextColor(...ink);
  const number = receipt.bibNo || "?";
  doc.text(number, MARGIN + 14, y + 38);
  const textX = MARGIN + 28 + doc.getTextWidth(number);
  const textWidth = PAGE_WIDTH - MARGIN - 12 - textX;
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...ink);
  doc.text(fit(doc, receipt.headline, textWidth), textX, y + 25);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...muted);
  doc.text(fit(doc, receipt.subline, textWidth), textX, y + 39);
  y += bibHeight + 14;

  // The record, as label and value rows.
  const labelWidth = CONTENT * 0.38;
  const valueX = MARGIN + labelWidth;
  const valueWidth = CONTENT - labelWidth;
  for (const line of receipt.lines) {
    doc.setFont("helvetica", "normal").setFontSize(9);
    const wrapped = doc.splitTextToSize(line.value, valueWidth) as string[];
    const rowHeight = wrapped.length * 11 + 10;
    doc.setTextColor(...muted).text(line.label, MARGIN, y + 13);
    doc.setTextColor(...(line.href ? teal : ink)).text(wrapped, valueX, y + 13);
    if (line.href) doc.link(valueX, y + 3, valueWidth, rowHeight - 6, { url: line.href });
    y += rowHeight;
    doc.setDrawColor(...hairline).setLineWidth(0.75).line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  }
  y += 14;

  // The receipt code, set apart: it is the one line to keep private.
  doc.setFont("courier", "normal").setFontSize(9);
  const code = doc.splitTextToSize(receipt.code, CONTENT - 24) as string[];
  const codeHeight = 26 + code.length * 11;
  doc.setFillColor(...tealSurface).setDrawColor(...tealBorder).setLineWidth(0.75);
  doc.rect(MARGIN, y, CONTENT, codeHeight, "FD");
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...teal);
  doc.text("RECEIPT CODE · KEEP PRIVATE", MARGIN + 12, y + 15);
  doc.setFont("courier", "normal").setFontSize(9).setTextColor(...ink);
  doc.text(code, MARGIN + 12, y + 29);
  y += codeHeight + 16;

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...muted);
  doc.text(doc.splitTextToSize(receipt.fine, CONTENT) as string[], MARGIN, y);

  doc.save(fileName(entry));
}

/** `sterun-receipt-fun-run-sleman-42.pdf` */
function fileName(entry: StoredEntry): string {
  const slug = entry.raceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `sterun-receipt-${slug || "race"}-${entry.tokenId}.pdf`;
}

/** Shortens one line with an ellipsis rather than letting it run off the page. */
function fit(doc: { getTextWidth(text: string): number }, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** A token's colour as RGB, or the fallback when it does not resolve to a six-digit hex. */
function token(name: string, fallback: Rgb = [0, 0, 0]): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : fallback;
}

/**
 * The black lockup as a PNG. jspdf cannot draw SVG, so the file is painted onto
 * a canvas at four times its size first. Returns null on any failure, and the
 * header falls back to the word.
 */
async function logoPng(): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const image = new Image();
    image.src = "/brand/logo/sterun-lockup-black.svg";
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) return null;

    const scale = 4;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return { data: canvas.toDataURL("image/png"), width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return null;
  }
}
