// Export one PNG per artboard from the STE-18 mockup board, plus the whole board
// as a single image for a reviewer.
//
//   node docs/design/race-day/tools/export-mockups.cjs ["C:/path/to/chrome.exe"]
//
// A handoff tool, not part of any build: nothing in the apps imports it. It needs
// puppeteer-core and a local Chrome, which is why the exports are committed:
// reading the design must not depend on being able to run this.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const HERE = __dirname;
const BOARD = path.join(HERE, "..", "mockups", "index.html");
const OUT = path.join(HERE, "..", "exports");

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
    console.error("No Chrome found. Pass the path: node export-mockups.cjs <chrome>");
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.setViewport({ width: 1800, height: 1200, deviceScaleFactor: 2 });
  await page.goto("file:///" + BOARD.replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 60000 });
  // The board loads the brand fonts from Google; give them a moment to land, or
  // the exports go out in the fallback stack.
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));

  const ids = await page.evaluate(() => [...document.querySelectorAll(".device")].map((d) => d.id));
  for (const id of ids) {
    const el = await page.$("#" + id);
    await el.screenshot({ path: path.join(OUT, id + ".png") });
  }

  await page.setViewport({ width: 1800, height: 1200, deviceScaleFactor: 1 });
  await page.screenshot({ path: path.join(OUT, "board.png"), fullPage: true });

  console.log("exported " + ids.length + " artboards plus board.png to " + path.relative(process.cwd(), OUT));
  await browser.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
