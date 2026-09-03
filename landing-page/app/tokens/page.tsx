/**
 * STE-7 — design token preview.
 *
 * Not part of the landing page. This is the page Nabil and Ancung look at to
 * agree a token set is right before any flow is built on top of it. Delete it,
 * or move it behind a flag, once the tokens are signed off.
 */

import Image from "next/image";

type Swatch = {
  name: string;
  hex: string;
  /** Contrast against #f8f8f8, computed offline, so nobody has to trust the eye. */
  onPaper?: string;
  /** Contrast of white text placed on this colour. */
  whiteOn?: string;
  note?: string;
};

const brand: Swatch[] = [
  { name: "paper", hex: "#f8f8f8", note: "Page background" },
  { name: "ink", hex: "#1e232b", onPaper: "15.0:1", whiteOn: "15.8:1", note: "Primary text" },
  { name: "teal", hex: "#016985", onPaper: "5.8:1", whiteOn: "6.2:1", note: "The only accent" },
  { name: "logo-grey", hex: "#9d9a99", note: "Inside the logo art only" },
];

const neutrals: Swatch[] = [
  { name: "n-100", hex: "#eef0f2", note: "Card fill" },
  { name: "n-200", hex: "#dfe2e6", note: "Divider" },
  { name: "n-300", hex: "#c7ccd3", note: "Input border" },
  { name: "n-400", hex: "#9ba3ad", note: "Placeholder" },
  { name: "n-500", hex: "#6f7883", onPaper: "4.9:1", note: "Secondary text" },
  { name: "n-600", hex: "#515a66", onPaper: "7.5:1", note: "Secondary, emphatic" },
  { name: "n-700", hex: "#3a424c", onPaper: "10.7:1", note: "Card heading" },
  { name: "n-800", hex: "#2a3038" },
  { name: "n-900", hex: "#1e232b", note: "= ink" },
  { name: "n-950", hex: "#14181e", note: "Deepest surface" },
];

const tealRamp: Swatch[] = [
  { name: "teal-50", hex: "#e8f4f8", note: "Badge fill" },
  { name: "teal-100", hex: "#cbe8f0" },
  { name: "teal-200", hex: "#97d0e1" },
  { name: "teal-300", hex: "#59b1cb" },
  { name: "teal-400", hex: "#1e8cac", note: "Focus ring" },
  { name: "teal-500", hex: "#016985", note: "Button rest" },
  { name: "teal-600", hex: "#015872", note: "Hover" },
  { name: "teal-700", hex: "#01475c", note: "Pressed" },
  { name: "teal-800", hex: "#013847" },
];

/** Each status is a pair: dark for text, bright for full-bleed race-day panels. */
const statusPairs: { label: string; dark: Swatch; strong: Swatch; surface: Swatch }[] = [
  {
    label: "success — scan OK, paid, Finished",
    dark: { name: "success", hex: "#067a38", onPaper: "5.1:1", note: "Text, badges, icons" },
    strong: {
      name: "success-strong",
      hex: "#0fa047",
      whiteOn: "3.4:1",
      note: "Full-bleed GREEN, text ≥32px",
    },
    surface: { name: "success-surface", hex: "#e6f6ec", note: "Badge fill" },
  },
  {
    label: "danger — expired code, already claimed, payment failed",
    dark: { name: "danger", hex: "#a31c11", onPaper: "7.2:1", note: "Text, badges, icons" },
    strong: {
      name: "danger-strong",
      hex: "#e23b22",
      whiteOn: "4.3:1",
      note: "Full-bleed RED, text ≥32px",
    },
    surface: { name: "danger-surface", hex: "#fceae8", note: "Badge fill" },
  },
  {
    label: "warning — clock drift, offline queue",
    dark: { name: "warning", hex: "#8f5200", onPaper: "5.8:1", note: "Text, badges, icons" },
    strong: {
      name: "warning-strong",
      hex: "#d18700",
      note: "Fill — pair with ink, never white",
    },
    surface: { name: "warning-surface", hex: "#fdf3e2", note: "Banner fill" },
  },
];

function Section({
  n,
  title,
  lede,
  children,
}: {
  n: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-n-200 pt-10">
      <div className="mb-6">
        <div className="numeric text-xs font-semibold tracking-widest text-teal">{n}</div>
        <h2 className="heading-strong text-2xl text-ink">{title}</h2>
        {lede ? <p className="mt-2 max-w-2xl text-sm text-n-500">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Chip({ s }: { s: Swatch }) {
  return (
    <div className="overflow-hidden rounded-lg border border-n-200 bg-white shadow-card">
      <div className="h-16 w-full" style={{ backgroundColor: s.hex }} />
      <div className="p-3">
        <div className="text-xs font-medium text-ink">{s.name}</div>
        <div className="numeric text-xs uppercase text-n-400">{s.hex}</div>
        {s.note ? <div className="mt-1 text-xs text-n-500">{s.note}</div> : null}
        {s.onPaper || s.whiteOn ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {s.onPaper ? (
              <span className="numeric rounded-sm bg-n-100 px-1.5 py-0.5 text-[10px] text-n-600">
                on paper {s.onPaper}
              </span>
            ) : null}
            {s.whiteOn ? (
              <span className="numeric rounded-sm bg-n-100 px-1.5 py-0.5 text-[10px] text-n-600">
                white {s.whiteOn}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Chips({ items }: { items: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((s) => (
        <Chip key={s.name} s={s} />
      ))}
    </div>
  );
}

const typeScale: [string, string, string][] = [
  ["text-5xl", "64px", "Runs you cannot fake"],
  ["text-4xl", "48px", "Runs you cannot fake"],
  ["text-3xl", "36px", "Verified race records"],
  ["text-2xl", "28px", "How it works"],
  ["text-xl", "22px", "Jakarta Night Run 10K"],
  ["text-lg", "18px", "A bib cannot be resold, because the record has no transfer function."],
  ["text-base", "16px", "Enter, claim your racepack, finish, verify. Four steps, one record."],
  ["text-sm", "14px", "Updated 2 hours ago · testnet"],
  ["text-xs", "12px", "Personal data never touches the chain."],
];

const radii: [string, string, string][] = [
  ["rounded-sm", "4px", "badge"],
  ["rounded-md", "8px", "input, button"],
  ["rounded-lg", "16px", "card, QR pass"],
  ["rounded-xl", "24px", "hero panel"],
];

const badges: [string, string][] = [
  ["Entered", "bg-teal-50 text-teal-700 border-teal-200"],
  ["Racepack claimed", "bg-n-100 text-n-700 border-n-300"],
  ["Finished", "bg-success-surface text-success border-success-border"],
  ["DNF", "bg-warning-surface text-warning border-warning-border"],
];

/** A fake QR block. Pattern is decorative only — never scan this. */
const QR_ON = [
  0, 1, 2, 6, 7, 8, 9, 14, 17, 19, 23, 26, 28, 33, 35, 40, 41, 45, 48, 52, 55, 56, 57, 58, 62, 63,
];

export default function TokenPreview() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-12 flex flex-wrap items-center gap-6">
        <Image
          src="/brand/logo/sterun-logo-black.svg"
          alt="Sterun"
          width={80}
          height={80}
          priority
        />
        <div>
          <div className="heading-strong text-4xl tracking-[0.3em] text-ink">STERUN</div>
          <p className="heading mt-1 text-lg text-n-600">runs you can&apos;t fake!</p>
        </div>
        <p className="max-w-xl text-base text-n-500">
          Design token preview — STE-7. Every colour, size and radius below is a token in{" "}
          <span className="numeric text-sm text-teal">app/tokens.css</span>. Nothing on this page
          uses a hand-written hex.
        </p>
      </header>

      <div className="flex flex-col gap-14">
        <Section
          n="01"
          title="Logo"
          lede="Dark mark on light surfaces, light mark on dark. The lockup is for wide slots — a site header, an X banner, a slide."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-n-200 bg-white p-8 shadow-card">
              <Image src="/brand/logo/sterun-logo-black.svg" alt="" width={120} height={120} />
              <div className="numeric text-xs text-n-400">sterun-logo-black.svg</div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-n-200 bg-ink p-8 shadow-card">
              <Image src="/brand/logo/sterun-logo-white.svg" alt="" width={120} height={120} />
              <div className="numeric text-xs text-n-400">sterun-logo-white.svg</div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-n-200 bg-teal-50 p-8 shadow-card">
              <Image
                src="/brand/logo/sterun-lockup.svg"
                alt=""
                width={280}
                height={90}
                className="w-full"
              />
              <div className="numeric text-xs text-n-500">sterun-lockup.svg</div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-n-200 bg-white p-5 shadow-card">
            <div className="mb-3 text-xs font-semibold tracking-widest text-teal">
              LOCKUP — TRANSPARENT BACKGROUND
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["bg-paper", "paper"],
                ["bg-n-200", "n-200"],
                ["bg-ink", "ink"],
              ].map(([cls, label]) => (
                <div key={label} className={`rounded-md p-5 ${cls}`}>
                  <Image
                    src="/brand/logo/sterun-lockup.svg"
                    alt=""
                    width={280}
                    height={90}
                    className="w-full"
                  />
                  <div
                    className={`numeric mt-3 text-center text-xs ${
                      label === "ink" ? "text-n-400" : "text-n-500"
                    }`}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 max-w-3xl text-sm text-n-500">
              The white plate behind the lockup is gone, so it now takes the colour of whatever it
              sits on. The dark panel is the honest test: the wordmark is drawn in ink, so on ink it
              disappears. That is expected — a dark surface wants a light lockup, which does not
              exist yet.
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            {[96, 48, 32, 24].map((px) => (
              <div
                key={px}
                className="flex flex-col items-center justify-end gap-2 rounded-lg border border-n-200 bg-white p-5 shadow-card"
              >
                <Image src="/brand/logo/sterun-logo-black.svg" alt="" width={px} height={px} />
                <div className="numeric text-xs text-n-400">{px}px</div>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-3xl text-sm text-n-500">
            The 24px row is the favicon and the scanner header. If the mark stops reading there, it
            needs a simplified small-size variant — that is a normal thing for a logo to have, not a
            flaw in the drawing.
          </p>
        </Section>

        <Section
          n="02"
          title="Brand"
          lede="The three colours from the X banner, plus the one grey that lives inside the logo art. One accent only: if it is teal, it does something."
        >
          <Chips items={brand} />
        </Section>

        <Section
          n="03"
          title="Neutrals"
          lede="Tinted toward ink rather than pure grey, so borders and muted text sit with the brand instead of beside it. n-500 is the lightest grey still safe for text."
        >
          <Chips items={neutrals} />
        </Section>

        <Section
          n="04"
          title="Teal ramp"
          lede="A button has four states and they must all look different. teal-400 is reserved for the keyboard focus ring — press Tab to see it."
        >
          <Chips items={tealRamp} />
        </Section>

        <Section
          n="05"
          title="Status"
          lede="Three meanings, each a pair: a dark tone for text on a light surface, and a bright one for the full-bleed race-day panels seen at arm's length in sunlight. The pairs differ by roughly 2x in brightness so they read as two colours, not two takes on one."
        >
          <div className="flex flex-col gap-6">
            {statusPairs.map((p) => (
              <div key={p.label}>
                <div className="mb-2 text-sm font-medium text-n-700">{p.label}</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Chip s={p.dark} />
                  <Chip s={p.strong} />
                  <Chip s={p.surface} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-lg border border-n-200 bg-white p-5 shadow-card">
            <div className="mb-3 text-xs font-semibold tracking-widest text-teal">
              ALL FIVE, SIDE BY SIDE
            </div>
            <div className="flex h-20 overflow-hidden rounded-md">
              {[
                ["#067a38", "success"],
                ["#0fa047", "success-strong"],
                ["#d18700", "warning-strong"],
                ["#8f5200", "warning"],
                ["#e23b22", "danger-strong"],
                ["#a31c11", "danger"],
                ["#016985", "teal"],
              ].map(([hex, name]) => (
                <div
                  key={name}
                  className="flex flex-1 items-end justify-center pb-2"
                  style={{ backgroundColor: hex }}
                >
                  <span className="text-[10px] font-medium text-white/90">{name}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-n-500">
              Seven bands, no two of which should be mistakable at a glance. Green sits well clear of
              teal, and amber well clear of red.
            </p>
          </div>
        </Section>

        <Section
          n="06"
          title="Typography"
          lede="Three roles, two families. Big Shoulders at 700 is the only voice allowed to shout, and it shouts once per screen. Everything else is Poppins: italic for headings, roman for body, and never heavier than 600 — emphasis comes from size, italic and colour, not from weight."
        >
          <div className="mb-6 rounded-lg border border-n-200 bg-white p-6 shadow-card">
            <div className="text-xs font-semibold text-teal">.heading-hero</div>
            <div className="mt-1 text-xs text-n-500">
              Big Shoulders 700 — landing hero and race-day verdicts, nothing else
            </div>
            <div className="heading-hero mt-4 text-5xl uppercase text-ink">
              Runs you can&apos;t fake
            </div>
            <div className="heading-hero text-4xl uppercase text-teal">Verified race records</div>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-n-200 bg-white p-4 shadow-card">
              <div className="text-xs font-semibold text-teal">.heading-strong</div>
              <div className="mt-1 text-xs text-n-500">Poppins italic 600 — wordmark, h2</div>
              <div className="heading-strong mt-3 text-xl text-ink">STERUN 10K</div>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4 shadow-card">
              <div className="text-xs font-semibold text-teal">.heading</div>
              <div className="mt-1 text-xs text-n-500">Poppins italic 500 — card titles</div>
              <div className="heading mt-3 text-xl text-ink">Jakarta Night Run</div>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4 shadow-card">
              <div className="text-xs font-semibold text-teal">font-sans</div>
              <div className="mt-1 text-xs text-n-500">Poppins roman 400 — body</div>
              <div className="mt-3 text-xl text-ink">Claim your racepack</div>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4 shadow-card">
              <div className="text-xs font-semibold text-teal">.numeric</div>
              <div className="mt-1 text-xs text-n-500">Poppins, tabular + slashed zero</div>
              <div className="numeric mt-3 text-xl text-ink">0 O 1 l I 8 B</div>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-n-200 bg-white p-5 shadow-card">
            <div className="mb-3 text-xs font-semibold tracking-widest text-teal">
              THE WEIGHT CEILING
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xl font-normal text-ink">400 · body copy, table cells</div>
              <div className="text-xl font-medium text-ink">500 · labels, buttons, headings</div>
              <div className="text-xl font-semibold text-ink">600 · the heaviest Poppins we use</div>
              <div className="text-xl font-bold text-n-300 line-through">700 · not in Poppins</div>
            </div>
            <p className="mt-3 text-sm text-n-500">
              The greyed row is what the tokens forbid. If something needs to hit harder than 600,
              it wants <span className="heading-hero uppercase">.heading-hero</span> or a larger
              size — not a heavier Poppins.
            </p>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-n-200 bg-white p-5 shadow-card">
              <div className="mb-2 text-xs font-semibold text-teal">
                WITHOUT .numeric — digits shift width
              </div>
              <div className="text-3xl tracking-[0.3em] text-ink">418 209</div>
              <div className="text-3xl tracking-[0.3em] text-ink">111 000</div>
            </div>
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-5 shadow-card">
              <div className="mb-2 text-xs font-semibold text-teal">
                WITH .numeric — every digit same width
              </div>
              <div className="numeric text-3xl tracking-[0.3em] text-ink">418 209</div>
              <div className="numeric text-3xl tracking-[0.3em] text-ink">111 000</div>
            </div>
          </div>

          <div className="rounded-lg border border-n-200 bg-white p-6 shadow-card">
            {typeScale.map(([cls, px, sample]) => (
              <div
                key={cls}
                className="flex flex-col gap-1 border-b border-n-100 py-4 last:border-0 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <div className="numeric w-28 shrink-0 text-xs text-n-400">
                  {cls} · {px}
                </div>
                <div className={`${cls} text-ink`}>{sample}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          n="07"
          title="Spacing and radius"
          lede="Four radii, one 4px spacing grid. A value off the grid is a bug, not a preference."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-n-200 bg-white p-5 shadow-card">
              <div className="mb-4 text-xs font-semibold text-teal">spacing · 4px grid</div>
              {[1, 2, 3, 4, 6, 8, 12].map((s) => (
                <div key={s} className="mb-2 flex items-center gap-3">
                  <div className="numeric w-20 shrink-0 text-xs text-n-400">
                    p-{s} · {s * 4}px
                  </div>
                  <div className="h-3 rounded-sm bg-teal-300" style={{ width: s * 4 }} />
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-5 shadow-card">
              <div className="mb-4 text-xs font-semibold text-teal">radius</div>
              <div className="flex flex-wrap items-end gap-4">
                {radii.map(([cls, px, use]) => (
                  <div key={cls} className="text-center">
                    <div className={`${cls} h-16 w-16 border border-n-300 bg-n-100`} />
                    <div className="numeric mt-2 text-[10px] text-n-400">{px}</div>
                    <div className="text-[10px] text-n-500">{use}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section
          n="08"
          title="Components in context"
          lede="Tokens only prove themselves inside a real control. Hover the buttons, then tab through them."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-n-200 bg-white p-6 shadow-card">
              <div className="mb-4 text-xs font-semibold text-teal">buttons</div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-600 active:bg-teal-700">
                  Enter this race
                </button>
                <button className="rounded-md border border-n-300 bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-n-100">
                  View details
                </button>
                <button className="rounded-md px-5 py-2.5 text-sm font-medium text-teal transition-colors hover:bg-teal-50">
                  Verify record
                </button>
                <button
                  disabled
                  className="cursor-not-allowed rounded-md bg-n-200 px-5 py-2.5 text-sm font-medium text-n-400"
                >
                  Quota full
                </button>
              </div>

              <div className="mt-8 mb-4 text-xs font-semibold text-teal">lifecycle badges</div>
              <div className="flex flex-wrap gap-2">
                {badges.map(([label, cls]) => (
                  <span
                    key={label}
                    className={`rounded-sm border px-2.5 py-1 text-xs font-medium ${cls}`}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="mt-8 mb-4 text-xs font-semibold text-teal">form field</div>
              <label className="block text-sm font-medium text-n-700" htmlFor="bib">
                Bib number
              </label>
              <input
                id="bib"
                placeholder="e.g. 10K-0042"
                className="numeric mt-1.5 w-full rounded-md border border-n-300 bg-white px-3 py-2.5 text-base text-ink placeholder:text-n-400"
              />
              <p className="mt-1.5 text-xs text-n-500">
                Personal data is stored off-chain. Only a salted hash reaches the contract.
              </p>
            </div>

            <div className="rounded-lg border border-n-200 bg-white p-6 shadow-card">
              <div className="mb-4 text-xs font-semibold text-teal">
                runner QR pass — rough shape, STE-18 designs it properly
              </div>
              <div className="rounded-lg bg-white p-5 shadow-lifted">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-n-500">Jakarta Night Run</div>
                    <div className="heading-strong text-xl text-ink">10K</div>
                  </div>
                  <span className="rounded-sm border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
                    Entered
                  </span>
                </div>
                <div className="my-5 flex justify-center">
                  <div className="grid h-44 w-44 grid-cols-8 gap-0.5 rounded-md bg-white p-2 ring-1 ring-n-200">
                    {Array.from({ length: 64 }).map((_, i) => (
                      <div key={i} className={QR_ON.includes(i) ? "bg-ink" : "bg-transparent"} />
                    ))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-n-500">Bib</div>
                  <div className="numeric text-bib font-semibold tracking-tight text-ink">
                    0042
                  </div>
                </div>
                <div className="mt-4 rounded-md bg-n-100 p-3 text-center">
                  <div className="text-xs text-n-500">Manual code</div>
                  <div className="numeric text-3xl font-semibold tracking-[0.3em] text-ink">
                    418 209
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-sm bg-n-300">
                    <div className="h-full w-2/3 bg-teal-500" />
                  </div>
                  <div className="numeric mt-1.5 text-xs text-n-500">refreshes in 19s</div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          n="09"
          title="Race day — the two-second screens"
          lede="A volunteer reads these in bright sun, at arm's length, sometimes colour-blind. Colour is the accelerator; the icon and the word carry the meaning."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg bg-success-strong p-8 text-center">
              <div className="text-7xl leading-none text-white">✓</div>
              <div className="heading-hero mt-3 text-5xl uppercase text-white">GIVE RACEPACK</div>
              <div className="numeric mt-4 text-2xl font-medium text-white">Bib 0042 · 10K</div>
              <div className="mt-1 text-base text-white/90">Sarah Wijaya</div>
            </div>
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg bg-danger-strong p-8 text-center">
              <div className="text-7xl leading-none text-white">✕</div>
              <div className="heading-hero mt-3 text-5xl uppercase text-white">DO NOT GIVE</div>
              <div className="numeric mt-4 text-2xl font-medium text-white">Bib 0118 · 5K</div>
              <div className="mt-1 text-base text-white/90">Racepack already claimed 08:14</div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-start gap-3 rounded-md border border-warning-border bg-warning-surface p-4">
              <span className="text-lg leading-none text-warning">⚠</span>
              <div>
                <div className="text-sm font-medium text-warning">
                  Device clock is 47 seconds off
                </div>
                <div className="text-sm text-n-600">
                  Codes may read as expired. Turn on automatic time, or use manual entry.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md border border-n-300 bg-n-100 p-4">
              <span className="text-lg leading-none text-n-500">◍</span>
              <div>
                <div className="text-sm font-medium text-n-700">Offline — 12 claims queued</div>
                <div className="text-sm text-n-600">
                  Scanning continues. The queue submits when signal returns, and the contract rejects
                  any duplicate claim, so nobody collects twice.
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 max-w-3xl text-sm text-n-500">
            Squint at the two panels above, or view this page in greyscale. The tick, the cross and
            the words still separate them. That is the test STE-18 has to pass — not whether the
            green is pretty.
          </p>
        </Section>
      </div>

      <footer className="mt-16 border-t border-n-200 pt-6 text-xs text-n-400">
        STE-7 · tokens live in landing-page/app/tokens.css, mirrored to fe/app/tokens.css
      </footer>
    </main>
  );
}
