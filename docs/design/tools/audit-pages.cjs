// Measure the live pages for the polish pass (STE-23), rather than looking at
// them and forming opinions.
//
//   node docs/design/tools/audit-pages.cjs [chrome]
//
// Needs both dev servers running:
//   landing-page  pnpm exec next dev --port 3000
//   fe            pnpm exec next dev --port 3001
//
// For every page, at a phone width and a laptop width, it reports:
//
//   contrast  every visible run of text, its colour against the first opaque
//             ground behind it, against the AA threshold for its own size
//   target    every interactive element smaller than the 24x24 CSS px floor
//             (WCAG 2.5.8) or the 44x44 comfortable size
//   focus     every interactive element whose appearance does not change when
//             it is focused from the keyboard
//   overflow  whether the document scrolls sideways at 390px
//
// It writes JSON next to itself for the findings document to quote. Screenshots
// go to docs/design/polish/exports/.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const HERE = __dirname;
const OUT = path.join(HERE, "..", "polish");
const SHOTS = path.join(OUT, "exports");

const PAGES = [
  { id: "landing", url: "http://localhost:3000/", name: "Landing" },
  { id: "directory", url: "http://localhost:3001/", name: "Event directory" },
  { id: "event", url: "http://localhost:3001/events/4", name: "Event detail" },
  { id: "notfound", url: "http://localhost:3001/events/99999", name: "Event that does not exist" },
  { id: "console", url: "http://localhost:3001/org", name: "Organiser console" },
  { id: "console-new", url: "http://localhost:3001/org/new", name: "Create a race" },
];
const WIDTHS = [
  { id: "390", width: 390, height: 844, label: "phone" },
  { id: "1440", width: 1440, height: 900, label: "laptop" },
];

const CHROME_CANDIDATES = [
  process.argv[2],
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

// Runs inside the page. Kept in one function so there is one round trip per
// page, and written without optional chaining so it survives an older Chrome.
const MEASURE = function () {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const hex = (c) =>
    "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  const where = (el) => {
    const bits = [];
    let n = el;
    for (let i = 0; n && n.tagName && i < 3; i++) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += "#" + n.id;
      else if (typeof n.className === "string" && n.className.trim()) {
        s += "." + n.className.trim().split(/\s+/).slice(0, 2).join(".");
      }
      bits.unshift(s);
      n = n.parentElement;
    }
    return bits.join(" > ");
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") return false;
    if (parseFloat(s.opacity) < 0.05) return false;
    return true;
  };

  // Text hidden for sighted users on purpose: the sr-only pattern clips a 1px
  // box, which passes the size check above and then reports an alarming 1:1.
  const srOnly = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      const clipped = (s.clipPath && s.clipPath !== "none") || (s.clip && s.clip !== "auto");
      if (clipped && r.width <= 2 && r.height <= 2) return true;
      if (s.position === "absolute" && r.width <= 1 && r.height <= 1 && s.overflow === "hidden") return true;
      n = n.parentElement;
    }
    return false;
  };

  // The first ancestor that actually paints something opaque. A gradient or an
  // image is reported rather than guessed at, because a measured number against
  // an invented ground is worse than no number.
  const ground = (el) => {
    let n = el;
    let acc = null;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") return { unknown: s.backgroundImage.slice(0, 40) };
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? over(acc, c) : c;
        if (c.a >= 1) return { colour: acc };
      }
      n = n.parentElement;
    }
    return { colour: acc || { r: 255, g: 255, b: 255, a: 1 } };
  };

  const textFindings = [];
  const overImage = [];
  const seen = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || "").trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || !visible(el)) continue;
    if (srOnly(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") continue;

    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg) continue;
    const g = ground(el);
    if (g.unknown) {
      const k = "img|" + s.color + "|" + g.unknown;
      if (!seen[k]) {
        seen[k] = true;
        overImage.push({ sample: text.slice(0, 48), where: where(el), fg: s.color, ground: g.unknown, px: parseFloat(s.fontSize) });
      }
      continue;
    }
    const eff = fg.a < 1 ? over(fg, g.colour) : fg;
    const px = parseFloat(s.fontSize);
    const weight = parseInt(s.fontWeight, 10) || 400;
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(eff, g.colour);

    const key = hex(eff) + "|" + hex(g.colour) + "|" + px + "|" + weight;
    if (seen[key]) {
      seen[key].count++;
      continue;
    }
    const finding = {
      sample: text.slice(0, 48),
      where: where(el),
      fg: hex(eff),
      bg: hex(g.colour),
      px: px,
      weight: weight,
      ratio: Math.round(r * 100) / 100,
      need: need,
      pass: r >= need,
      count: 1,
    };
    seen[key] = finding;
    textFindings.push(finding);
  }

  const SEL = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
  const targets = [];
  const els = Array.prototype.slice.call(document.querySelectorAll(SEL));
  for (const el of els) {
    if (!visible(el)) continue;
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w < 44 || h < 44) {
      targets.push({ where: where(el), text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40), w: w, h: h, fails248: w < 24 || h < 24 });
    }
  }

  return {
    text: textFindings,
    overImage: overImage,
    targets: targets,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    title: document.title,
    langAttr: document.documentElement.getAttribute("lang"),
    h1Count: document.querySelectorAll("h1").length,
    imgNoAlt: Array.prototype.slice.call(document.querySelectorAll("img")).filter((i) => i.getAttribute("alt") === null).length,
  };
};

(async () => {
  const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.error("No Chrome found. Pass the path: node audit-pages.cjs <chrome>");
    process.exit(1);
  }
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await puppeteer.launch({ executablePath, headless: true });
  const report = { measuredAt: new Date().toISOString(), pages: [] };

  for (const page of PAGES) {
    for (const w of WIDTHS) {
      const tab = await browser.newPage();
      const consoleErrors = [];
      tab.on("pageerror", (e) => consoleErrors.push(String(e.message).slice(0, 160)));
      tab.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
      });
      await tab.setViewport({ width: w.width, height: w.height, deviceScaleFactor: 1 });
      let loaded = true;
      try {
        await tab.goto(page.url, { waitUntil: "networkidle0", timeout: 45000 });
      } catch (e) {
        loaded = false;
      }
      await new Promise((r) => setTimeout(r, 1200));

      let result = null;
      try {
        result = await tab.evaluate(MEASURE);
      } catch (e) {
        result = { error: e.message };
      }

      // Tab through the page for real. Programmatic focus() does not reliably
      // match :focus-visible, which is what every focus ring is written against,
      // so the first version of this check reported rings that do exist.
      const noRing = [];
      try {
        await tab.evaluate(() => {
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        });
        const snap = () =>
          tab.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const s = getComputedStyle(el);
            const bits = [];
            let n = el;
            for (let i = 0; n && n.tagName && i < 3; i++) {
              let t = n.tagName.toLowerCase();
              if (typeof n.className === "string" && n.className.trim()) t += "." + n.className.trim().split(/\s+/).slice(0, 2).join(".");
              bits.unshift(t);
              n = n.parentElement;
            }
            return {
              where: bits.join(" > "),
              text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 36),
              style: [s.outlineWidth, s.outlineStyle, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join("|"),
            };
          });
        const seenEl = {};
        for (let i = 0; i < 40; i++) {
          const focused = await snap();
          if (!focused) { await tab.keyboard.press("Tab"); continue; }
          const key = focused.where + "|" + focused.text;
          if (seenEl[key]) break; // wrapped round
          seenEl[key] = true;
          // The same element with focus removed, for comparison.
          const resting = await tab.evaluate(() => {
            const el = document.activeElement;
            const s = getComputedStyle(el, null);
            const before = [s.outlineWidth, s.outlineStyle, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join("|");
            el.blur();
            const r = getComputedStyle(document.activeElement === el ? el : el, null);
            const after = [r.outlineWidth, r.outlineStyle, r.outlineColor, r.boxShadow, r.borderColor, r.backgroundColor].join("|");
            el.focus();
            return { before: before, after: after };
          });
          if (resting.before === resting.after) noRing.push(focused);
          await tab.keyboard.press("Tab");
        }
      } catch (e) {
        /* a page with no focusable element is fine */
      }
      result.focus = noRing;
      const shot = path.join(SHOTS, page.id + "-" + w.id + ".png");
      try {
        await tab.screenshot({ path: shot, fullPage: true });
      } catch (e) {
        /* a very tall page can refuse; the measurements still stand */
      }
      report.pages.push({
        page: page.id,
        name: page.name,
        url: page.url,
        width: w.width,
        widthLabel: w.label,
        loaded: loaded,
        consoleErrors: consoleErrors.slice(0, 6),
        ...result,
      });
      const fails = (result.text || []).filter((t) => !t.pass).length;
      console.log(
        `${page.id.padEnd(12)} ${String(w.width).padStart(4)}  runs ${String((result.text || []).length).padStart(3)}  ` +
          `over image ${String((result.overImage || []).length).padStart(3)}  contrast fails ${String(fails).padStart(3)}  ` +
          `small targets ${String((result.targets || []).length).padStart(3)}  no focus ring ${String((result.focus || []).length).padStart(3)}  ` +
          `overflowX ${result.overflowX}`,
      );
      await tab.close();
    }
  }

  fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify(report, null, 1));
  console.log("\nwrote " + path.relative(process.cwd(), path.join(OUT, "audit.json")));
  await browser.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
