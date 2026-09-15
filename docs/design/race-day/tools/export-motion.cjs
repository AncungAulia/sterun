// Export a filmstrip of the verdict entry from the STE-18 motion board, so the
// timing can be reviewed as a single image by someone who cannot open the page.
//
//   node docs/design/race-day/tools/export-motion.cjs ["C:/path/to/chrome.exe"]
//
// A handoff tool, not part of any build, same as export-mockups.cjs: it needs
// puppeteer-core and a local Chrome, which is why the export is committed.
//
// The frames are taken with the animations paused at a fixed time rather than by
// racing a timer, so the strip is the same on every machine.
const fs = require("fs");
const path = require("path");
const url = require("url");
const puppeteer = require("puppeteer-core");

const HERE = __dirname;
const BOARD = path.join(HERE, "..", "mockups", "motion.html");
const OUT = path.join(HERE, "..", "exports");
const FRAMES = [0, 50, 100, 150, 200, 280]; // ms into the entry

const CHROME_CANDIDATES = [
  process.argv[2],
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

(async () => {
  const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.error("No Chrome found. Pass the path: node export-motion.cjs <chrome>");
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.setViewport({ width: 1800, height: 1400, deviceScaleFactor: 2 });
  await page.goto(url.pathToFileURL(BOARD).href, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 600));

  for (const ms of FRAMES) {
    await page.evaluate((t) => {
      const el = document.getElementById("m1");
      el.classList.remove("play");
      void el.offsetWidth;
      el.classList.add("play");
      // Every animation in the frame starts together, so seeking them all to the
      // same time is the same as scrubbing the whole transition.
      el.getAnimations({ subtree: true }).forEach((a) => {
        a.currentTime = t;
        a.pause();
      });
    }, ms);
    const el = await page.$("#m1");
    await el.screenshot({ path: path.join(OUT, `motion-verdict-${String(ms).padStart(3, "0")}.png`) });
  }

  // And the whole board, mid-play, as the overview.
  await page.setViewport({ width: 1800, height: 1400, deviceScaleFactor: 1 });
  await page.evaluate(() => document.getElementById("playAll").click());
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(OUT, "motion-board.png"), fullPage: true });

  console.log(`exported ${FRAMES.length} verdict frames plus motion-board.png to ${path.relative(process.cwd(), OUT)}`);
  await browser.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
