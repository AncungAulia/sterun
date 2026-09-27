// Screenshots of the deployed app, for the SOW's evidence (§6.1 D3).
//
//   node docs/shots/shoot.cjs [chrome] [--only=directory,race] [--app=URL] [--landing=URL]
//
// Not the polish audit. `docs/design/tools/audit-pages.cjs` measures contrast,
// target size and focus against LOCAL dev servers and writes a dated record of
// one pass; overwriting its exports would destroy that record. This one only
// takes pictures, and only of what is actually deployed.
//
// Every page here is readable with **no wallet**, which is the whole reason this
// can run unattended: the pass, the scan desk, the signed-in console and the
// results review all need a key, so they come out of the video shoot as frames
// instead (docs/video-script.md).
//
// The data is read from the chain in the browser, so a page is not finished when
// it loads. Each page therefore carries `ready`: text that only appears once the
// records are in. A page that never shows it is reported as a miss rather than
// photographed half-drawn.
//
// `ready` alone is not enough on the runner pages, and the first run of this
// script proved it. A profile reads its records first and then one summary per
// race, and while those are in flight a card falls back to "Race 41" and a
// category of "Unknown" — deliberate, because a race that will not answer should
// cost its card a name rather than the card (hooks/useRunnerProfile.ts). Waiting
// on the heading "Race record" therefore photographed a page that was still
// loading, since that heading is static. `absent` is the other half: a pattern
// that must have gone before the shutter opens.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const SHOTS = __dirname;

const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const APP = arg("app", "https://app.sterun.xyz").replace(/\/$/, "");
const LANDING = arg("landing", "https://sterun.xyz").replace(/\/$/, "");

// The seeded demo runners (docs/rehearsal/runs/2026-09-25T09-08-01Z-seed/EVIDENCE.md).
// Chosen for the four outcomes only this product distinguishes.
const RUNNERS = {
  budi: "GDLFVS26CWYAH5CK6RN7Z23Q7MLOOWIXHD4NNLSEU7GASERIF463PTC5",
  intan: "GCEJ44AAAQWP7FVJNJAWUGZKVHKA5TVWHARCFAPJLKGZB5YZI4K6WDPI",
  agus: "GDYMQ5PUJA4E362QVW32IEQ77DGKZHE7Q2A23DP43ICGX2A5VW7NMRWB",
  maya: "GASKJNV2X2OG7Z3NDFXKDYXQ6SKL6A3C4N5ARQQ5H3H3XPFG2RVF4R3D",
};

/**
 * Anything still moving is caught mid-move. The header's placeholder rolls
 * through "race", "venue" and "city" on a CSS wheel (`roll-words` in
 * globals.css), and a shutter that opens between two words photographs a word
 * sliced in half, which reads as a rendering fault rather than as an animation.
 * Removing the animation rather than pausing it returns the track to its
 * resting position, so the field says "Search by race".
 */
const FREEZE = `*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}`;

/** A record card that has not been told its race yet: "Race 41", category "Unknown". */
const UNRESOLVED = "(^|\\n)\\s*Race \\d+\\s*(\\n|$)";

const PAGES = [
  { id: "landing", url: `${LANDING}/`, ready: "Sterun", name: "Landing page" },
  { id: "directory", url: `${APP}/`, ready: "Kota Tua", name: "Race directory" },
  { id: "race", url: `${APP}/events/41`, ready: "Kota Tua 10K 2026", name: "A race, with its poster and add-on" },
  { id: "runner-history", url: `${APP}/runner/${RUNNERS.budi}`, ready: "Race record", absent: UNRESOLVED, name: "A runner's public record, three races" },
  { id: "runner-untimed", url: `${APP}/runner/${RUNNERS.intan}`, ready: "No official time", absent: UNRESOLVED, name: "A finish with no official time" },
  { id: "runner-dnf", url: `${APP}/runner/${RUNNERS.agus}`, ready: "Did not finish", absent: UNRESOLVED, name: "Did not finish" },
  { id: "runner-dns", url: `${APP}/runner/${RUNNERS.maya}`, ready: "Did not start", absent: UNRESOLVED, name: "Did not start: never collected a race pack" },
  { id: "runner-lookup", url: `${APP}/runner`, ready: "address", name: "Looking up any address" },
  { id: "organisers", url: `${APP}/organisers`, ready: "organis", name: "How an organiser gets access" },
];

const WIDTHS = [
  { id: "390", width: 390, height: 844, label: "phone" },
  { id: "1440", width: 1440, height: 900, label: "laptop" },
];

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice(7).split(",").map((s) => s.trim()) : null;

const CHROME_CANDIDATES = [
  process.argv.slice(2).find((a) => !a.startsWith("--")),
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function chrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`no Chrome found. Tried:\n  ${CHROME_CANDIDATES.join("\n  ")}`);
}

/** Records are in, and nothing is still drawing a placeholder. */
async function settled(tab, ready, absent) {
  await tab.waitForFunction(
    (needle, gone) => {
      const loading = document.querySelector('[role="status"][aria-label^="Loading"]');
      if (loading) return false;
      const text = document.body.innerText;
      if (!text.includes(needle)) return false;
      return !gone || !new RegExp(gone, "m").test(text);
    },
    { timeout: 45000 },
    ready,
    absent ?? null,
  );
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chrome(),
    headless: "new",
    args: ["--hide-scrollbars", "--force-color-profile=srgb"],
  });

  const rows = [];
  try {
    for (const page of PAGES.filter((p) => !ONLY || ONLY.includes(p.id))) {
      for (const w of WIDTHS) {
        const tab = await browser.newPage();
        // 1x, as docs/design/polish/exports already is. At 2x the landing page
        // alone came to 6MB, and these live in git forever.
        await tab.setViewport({ width: w.width, height: w.height, deviceScaleFactor: 1 });
        let note = "ok";
        try {
          await tab.goto(page.url, { waitUntil: "networkidle2", timeout: 60000 });
          await settled(tab, page.ready, page.absent);
        } catch (error) {
          note = `MISS: never settled on ${JSON.stringify(page.ready)} (${String(error.message).split("\n")[0]})`;
        }
        await tab.addStyleTag({ content: FREEZE });
        const file = path.join(SHOTS, `${page.id}-${w.id}.png`);
        await tab.screenshot({ path: file, fullPage: true });
        await tab.close();
        rows.push({ id: page.id, width: w.id, note, file: path.basename(file) });
        console.log(`${page.id.padEnd(16)} ${w.id.padStart(4)}  ${note}`);
      }
    }
  } finally {
    await browser.close();
  }

  const missed = rows.filter((r) => r.note !== "ok");
  console.log(`\n${rows.length - missed.length}/${rows.length} pages photographed with their data in.`);
  if (missed.length) {
    console.log("Check these by hand before using them as evidence:");
    for (const r of missed) console.log(`  ${r.file}  ${r.note}`);
  }
  process.exit(missed.length ? 1 : 0);
})();
