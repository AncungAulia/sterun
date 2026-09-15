# Entry flow (round 1 of STE-21) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runner goes from **Enter 10K** on a race page to a paid, on-chain entry and a downloadable receipt, on testnet.

**Architecture:** Every decision is a pure function in `fe/src/modules/entry/` (basket, details validation, gate, the Sign and pay state machine, failure classification, receipt contents), tested without a browser. Thin hooks wire them to the chain (`readClient` with a per-call actor), the vault (`lib/participants.ts`) and IndexedDB (`lib/entry-store.ts`). Components are shadcn parts plus lucide icons. Two routes: `/events/[id]/enter` and `/events/[id]/entered/[tokenId]`.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, TanStack Query 5, zustand, shadcn/ui (`radix-ui`), lucide-react, `@sterunxyz/sdk`, `@stellar/stellar-sdk` 17, `react-phone-number-input`, `idb-keyval`, `jspdf`, vitest 3 + Testing Library + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-09-15-entry-flow-design.md`. **Mockup:** `docs/superpowers/specs/2026-09-15-entry-flow-mockup.html`.

## Global Constraints

- Every UI component comes from shadcn (`src/components/ui/`), added with `cd fe && pnpm dlx shadcn@latest add <name> --yes` then `sed -i 's|from "cn"|from "@/utils/cn"|' src/components/ui/*.tsx`. Nothing generic is written from scratch.
- Every icon comes from `lucide-react`. No emoji in new UI.
- UI text in English. No em dash or en dash in UI text, in any spelling (`test/ui-rules.test.ts`).
- UI text names the consequence, not the mechanism: no "chain", "contract", "hash", "transaction", "revert", "trustline" on screen.
- No hex values, font names or raw px in a component; tokens only.
- Money is `bigint` stroops, never a float.
- PII never reaches the chain; only `participant_hash` does. Personal details are never written to browser storage.
- `NonRefundableNotice` stands directly above the Sign and pay button.
- Bib numbers are shown as the contract holds them (from 0) until STE-53 decides otherwise.
- Install dependencies from the repository ROOT: `pnpm --filter fe add <pkg>`. Never from inside `fe/`.
- Never run `pnpm --filter fe build` (the dev server uses `.next`). Use `pnpm --filter fe typecheck` and targeted `pnpm --filter fe exec vitest run <file>`.
- Ask Ancung before running the full fe test suite.
- Commits reference STE-21, explain why in the body, and end with the attribution lines. Push only when Ancung says so.

---

## File structure

| File | Responsibility |
| --- | --- |
| `fe/src/lib/env.ts` (modify) | `SUSD_ISSUER`, `IS_TESTNET` |
| `fe/src/lib/errors.ts` (modify) | export `isNoAnswer`, `isDeclined` so the attempt can branch without string matching elsewhere |
| `fe/src/lib/participants.ts` | signed `POST /participants` and `POST /participants/:id/confirm` |
| `fe/src/lib/entry-store.ts` | the stored entry in IndexedDB, one per token id |
| `fe/src/lib/susd.ts` | sUSD balance read, trustline, test funds |
| `fe/src/lib/confetti.ts` | the wizard's burst, extracted so both success screens fire the same one |
| `fe/src/modules/entry/basket.ts` | race pack vs add-ons, `addon_ids`, total |
| `fe/src/modules/entry/details.ts` | the step 2 model, missing vs impossible, the vault body |
| `fe/src/modules/entry/gate.ts` | what the page shows before the form |
| `fe/src/modules/entry/attempt.ts` | the Sign and pay state machine (reducer) |
| `fe/src/modules/entry/enter-failure.ts` | turning an `enter` failure into a sentence by re-reading the chain |
| `fe/src/modules/entry/receipt.ts` | receipt lines (pure) |
| `fe/src/modules/entry/receipt-pdf.ts` | the PDF file (browser only) |
| `fe/src/hooks/useRunnerRecords.ts` | this wallet's records, read from chain |
| `fe/src/hooks/useSusdBalance.ts` | balance query |
| `fe/src/hooks/useEntryAttempt.ts` | runs `attempt.ts` against the wallet, vault and chain |
| `fe/src/modules/entry/EntryFlow.tsx` | the page: gate, stepper, three steps |
| `fe/src/modules/entry/component/StepDistance.tsx` | step 1 |
| `fe/src/modules/entry/component/StepRunner.tsx` | step 2 |
| `fe/src/modules/entry/component/StepPay.tsx` | step 3 |
| `fe/src/modules/entry/component/EntrySummary.tsx` | the summary beside every step |
| `fe/src/modules/entry/component/PhoneField.tsx` | E.164 phone with a country picker |
| `fe/src/modules/entry/component/PayDialog.tsx` | the progress dialog |
| `fe/src/modules/entry/component/GateNotice.tsx` | closed / already entered / sold out |
| `fe/src/modules/entry/component/GetTestSusd.tsx` | the test funds button |
| `fe/src/modules/entry/EnteredPage.tsx` | the success page |
| `fe/src/modules/entry/component/Bib.tsx` | the bib drawing |
| `fe/src/modules/entry/component/ReceiptBox.tsx` | code, download, copy, gate |
| `fe/app/(browse)/events/[eventId]/enter/page.tsx` | route |
| `fe/app/(browse)/events/[eventId]/entered/[tokenId]/page.tsx` | route |
| `fe/src/components/layouts/WalletButton.tsx` (modify) | Get test sUSD in the wallet menu |
| `fe/src/modules/organiser/component/StepDone.tsx` (modify) | call `fireConfetti` |

Tests live in `fe/test/` with the same base name.

---

### Task 1: Dependencies, environment, confetti extraction

**Files:**
- Modify: `fe/package.json` (through pnpm), `fe/src/lib/env.ts`, `fe/vitest.config.ts`, `fe/.env`, `fe/src/modules/organiser/component/StepDone.tsx`
- Create: `fe/src/lib/confetti.ts`
- Test: `fe/test/env.test.ts` (append), `fe/test/confetti.test.ts`

**Interfaces:**
- Produces: `SUSD_ISSUER: string`, `IS_TESTNET: boolean` from `@/lib/env`; `fireConfetti(): void` from `@/lib/confetti`.

- [ ] **Step 1: Install**

```bash
pnpm --filter fe add react-phone-number-input@^3.4.18 idb-keyval@^6.2.2 jspdf@^4.2.1
pnpm --filter fe add -D fake-indexeddb@^6.2.5
pnpm --filter fe remove @stellar/stellar-sdk && pnpm --filter fe add @stellar/stellar-sdk@^17.0.1
```

The last line moves `@stellar/stellar-sdk` from devDependencies to dependencies: `lib/susd.ts` uses it at runtime. The root `pnpm.overrides` still pins one copy. Check `pnpm-lock.yaml` holds a single `@stellar/stellar-sdk@17` entry.

- [ ] **Step 2: Add shadcn parts the flow needs**

```bash
cd fe && pnpm dlx shadcn@latest add scroll-area --yes && sed -i 's|from "cn"|from "@/utils/cn"|' src/components/ui/*.tsx
```

- [ ] **Step 3: Write the failing env test** (append to `fe/test/env.test.ts`)

```ts
import { Asset } from "@stellar/stellar-sdk";

describe("sUSD issuer", () => {
  it("is the issuer whose asset contract is the configured SAC", async () => {
    const env = await import("@/lib/env");
    const sac = new Asset("sUSD", env.SUSD_ISSUER).contractId(env.NETWORK.networkPassphrase);
    expect(sac).toBe(env.CONTRACTS.susdSac);
  });

  it("knows it is on testnet", async () => {
    const env = await import("@/lib/env");
    expect(env.IS_TESTNET).toBe(true);
  });
});
```

- [ ] **Step 4: Run it, expect FAIL** — `pnpm --filter fe exec vitest run test/env.test.ts` → `SUSD_ISSUER` is undefined.

- [ ] **Step 5: Implement.** In `fe/src/lib/env.ts`, after `CONTRACTS`:

```ts
/**
 * The account that issues sUSD. A trustline names an asset by code and issuer,
 * not by its contract, so the SAC address alone cannot open one. Read from the
 * environment like every other address (docs/deployments.md, sterun-susd-issuer),
 * and a test proves it derives the configured SAC, so the two cannot drift.
 */
export const SUSD_ISSUER = process.env.NEXT_PUBLIC_SUSD_ISSUER ?? "";

export const IS_TESTNET = NETWORK.networkPassphrase === "Test SDF Network ; September 2015";
```

Add `NEXT_PUBLIC_SUSD_ISSUER: "GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW"` to `test.env` in `fe/vitest.config.ts`, and the same line to `fe/.env`. Tell Ancung to add it to `fe/.env.local` by hand (gitignored).

- [ ] **Step 6: Run it, expect PASS.**

- [ ] **Step 7: Extract confetti.** Create `fe/src/lib/confetti.ts` with the body of StepDone's effect moved verbatim (`tealRamp`, the reduced-motion check, the dynamic import, both bursts, the swallowed catch, and the comments that explain each), exported as `export function fireConfetti(): void`. In `StepDone.tsx` the effect becomes:

```ts
useEffect(() => {
  if (fired.current) return;
  fired.current = true;
  fireConfetti();
}, []);
```

Test `fe/test/confetti.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const confetti = vi.hoisted(() => vi.fn());
vi.mock("canvas-confetti", () => ({ default: confetti }));

import { fireConfetti } from "@/lib/confetti";

describe("fireConfetti", () => {
  beforeEach(() => {
    confetti.mockReset();
  });

  it("fires the first burst", async () => {
    fireConfetti();
    await vi.waitFor(() => expect(confetti).toHaveBeenCalledTimes(1));
  });

  it("fires nothing when the viewer asks for reduced motion", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    fireConfetti();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(confetti).not.toHaveBeenCalled();
  });
});
```

Run `pnpm --filter fe exec vitest run test/confetti.test.ts test/CreateEvent.test.tsx` → PASS.

- [ ] **Step 8: Typecheck** — `pnpm --filter fe typecheck` → no errors.

- [ ] **Step 9: Commit**

```bash
git add fe/package.json pnpm-lock.yaml fe/src/lib/env.ts fe/vitest.config.ts fe/.env fe/src/lib/confetti.ts fe/src/modules/organiser/component/StepDone.tsx fe/src/components/ui/scroll-area.tsx fe/test/env.test.ts fe/test/confetti.test.ts
git commit -m "feat(fe): the entry flow's dependencies, the sUSD issuer, shared confetti (STE-21)"
```

---

### Task 2: The basket (step 1 model)

**Files:**
- Create: `fe/src/modules/entry/basket.ts`
- Test: `fe/test/basket.test.ts`

**Interfaces:**
- Consumes: `joinAddOns`, `JoinedAddOn` from `@/modules/event-detail/component/TabAddOns`; `SterunCategory`, `SterunAddOn` from `@sterunxyz/sdk`.
- Produces:

```ts
export interface PackItem { name: string; sized: boolean; options: { label: string; addonId: number; soldOut: boolean }[] }
export interface ExtraItem { name: string; addonId: number; priceStroops: bigint; unitsLeft: number }
export interface Basket { pack: PackItem[]; extras: ExtraItem[] }
export interface Selection { sizes: Record<string, number>; extras: number[] }
export function buildBasket(joined: JoinedAddOn[], categoryCode: string): Basket
export function addonIdsFor(basket: Basket, selection: Selection): number[]
export function totalStroops(category: SterunCategory, basket: Basket, selection: Selection): bigint
export function missingPackSizes(basket: Basket, selection: Selection): string[]
export function packChoices(basket: Basket, selection: Selection): { item: string; choice: string }[]
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import type { JoinedAddOn } from "@/modules/event-detail/component/TabAddOns";
import {
  addonIdsFor,
  buildBasket,
  missingPackSizes,
  packChoices,
  totalStroops,
} from "@/modules/entry/basket";
import type { SterunAddOn, SterunCategory } from "@sterunxyz/sdk";

function row(addonId: number, code: string, priceStroops: bigint, unitsLeft = 10): SterunAddOn {
  return { eventId: 0, addonId, code, priceStroops, quota: 10, reservedCount: 10 - unitsLeft, unitsLeft };
}

const jersey: JoinedAddOn = {
  item: {
    name: "Event jersey",
    includedIn: ["10K"],
    sizes: [
      { label: "M", code: "EVENT_JERSEY_M" },
      { label: "L", code: "EVENT_JERSEY_L" },
    ],
  },
  rows: [row(0, "EVENT_JERSEY_M", 0n, 0), row(1, "EVENT_JERSEY_L", 0n)],
};
const medal: JoinedAddOn = {
  item: { name: "Finisher medal", includedIn: ["10K", "5K"], code: "MEDAL" },
  rows: [row(2, "MEDAL", 0n)],
};
const towel: JoinedAddOn = {
  item: { name: "Towel", includedIn: ["10K"], code: "TOWEL" },
  rows: [row(3, "TOWEL", 50_000_000n, 4)],
};
const fiveKCap: JoinedAddOn = {
  item: { name: "Cap", includedIn: ["5K"], code: "CAP" },
  rows: [row(4, "CAP", 30_000_000n)],
};
const undescribedOnChain: JoinedAddOn = {
  item: { name: "Ghost", includedIn: ["10K"], code: "GHOST" },
  rows: [],
};

const tenK: SterunCategory = {
  eventId: 0, categoryId: 1, code: "10K", distanceM: 10_000, quota: 100,
  enteredCount: 3, priceStroops: 250_000_000n, slotsLeft: 97,
};

describe("buildBasket", () => {
  const basket = buildBasket([jersey, medal, towel, fiveKCap, undescribedOnChain], "10K");

  it("puts free items in the race pack and priced ones in add-ons", () => {
    expect(basket.pack.map((p) => p.name)).toEqual(["Event jersey", "Finisher medal"]);
    expect(basket.extras.map((e) => e.name)).toEqual(["Towel"]);
  });

  it("keeps only what is offered to this distance", () => {
    expect(basket.extras.find((e) => e.name === "Cap")).toBeUndefined();
  });

  it("drops an item with no row to reserve", () => {
    expect(basket.pack.find((p) => p.name === "Ghost")).toBeUndefined();
  });

  it("marks a size with no units left as sold out", () => {
    expect(basket.pack[0].options).toEqual([
      { label: "M", addonId: 0, soldOut: true },
      { label: "L", addonId: 1, soldOut: false },
    ]);
  });

  it("gives an unsized item one option", () => {
    expect(basket.pack[1]).toEqual({
      name: "Finisher medal",
      sized: false,
      options: [{ label: "", addonId: 2, soldOut: false }],
    });
  });
});

describe("selection", () => {
  const basket = buildBasket([jersey, medal, towel], "10K");

  it("asks for every sized race pack item", () => {
    expect(missingPackSizes(basket, { sizes: {}, extras: [] })).toEqual(["Event jersey"]);
    expect(missingPackSizes(basket, { sizes: { "Event jersey": 1 }, extras: [] })).toEqual([]);
  });

  it("reserves the chosen size, every unsized pack item and each chosen extra", () => {
    expect(addonIdsFor(basket, { sizes: { "Event jersey": 1 }, extras: [3] })).toEqual([1, 2, 3]);
  });

  it("totals the distance and the chosen extras only", () => {
    expect(totalStroops(tenK, basket, { sizes: { "Event jersey": 1 }, extras: [3] })).toBe(300_000_000n);
    expect(totalStroops(tenK, basket, { sizes: {}, extras: [] })).toBe(250_000_000n);
  });

  it("describes the choices for the vault", () => {
    expect(packChoices(basket, { sizes: { "Event jersey": 1 }, extras: [] })).toEqual([
      { item: "Event jersey", choice: "L" },
    ]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter fe exec vitest run test/basket.test.ts` → cannot resolve `@/modules/entry/basket`.

- [ ] **Step 3: Implement** `fe/src/modules/entry/basket.ts`

```ts
/**
 * What a runner gets and what they may buy, for one distance.
 *
 * The race pack and the add-ons are split by price, and only by price: both
 * are add-ons on chain, and a free one is how a race bounds how many jerseys
 * exist. Shown as two cards because every runner gets a race pack, and a
 * jersey sitting among paid extras read like something bought (Ancung, from
 * the mockup).
 *
 * Every race pack unit is still reserved at entry. A size that has run out
 * cannot be picked, because `enter` would refuse the whole entry for it.
 */
import type { JoinedAddOn } from "@/modules/event-detail/component/TabAddOns";
import type { SterunCategory } from "@sterunxyz/sdk";

export interface PackOption {
  /** The size label, or empty for an item with no sizes. */
  label: string;
  addonId: number;
  soldOut: boolean;
}

export interface PackItem {
  name: string;
  sized: boolean;
  options: PackOption[];
}

export interface ExtraItem {
  name: string;
  addonId: number;
  priceStroops: bigint;
  unitsLeft: number;
}

export interface Basket {
  pack: PackItem[];
  extras: ExtraItem[];
}

export interface Selection {
  /** Race pack item name to the chosen size's add-on id. */
  sizes: Record<string, number>;
  /** Chosen extras, by add-on id. */
  extras: number[];
}

export const EMPTY_SELECTION: Selection = { sizes: {}, extras: [] };

export function buildBasket(joined: JoinedAddOn[], categoryCode: string): Basket {
  const pack: PackItem[] = [];
  const extras: ExtraItem[] = [];

  for (const { item, rows } of joined) {
    if (!item.includedIn.includes(categoryCode)) continue;
    // Described in the document but not on chain: there is nothing to reserve
    // and no price to charge, so it cannot be part of an entry.
    if (rows.length === 0) continue;

    const price = rows[0].priceStroops;
    if (price === 0n) {
      const sized = Boolean(item.sizes?.length);
      const options = rows.map((row) => ({
        label: sized ? (item.sizes?.find((size) => size.code === row.code)?.label ?? row.code) : "",
        addonId: row.addonId,
        soldOut: row.unitsLeft === 0,
      }));
      pack.push({ name: item.name, sized, options });
    } else {
      // A paid item is offered unsized. A priced item with sizes would need a
      // size picker inside a checkbox, which no race has asked for yet.
      const first = rows[0];
      extras.push({
        name: item.name,
        addonId: first.addonId,
        priceStroops: price,
        unitsLeft: first.unitsLeft,
      });
    }
  }

  return { pack, extras };
}

export function missingPackSizes(basket: Basket, selection: Selection): string[] {
  return basket.pack
    .filter((item) => item.sized && selection.sizes[item.name] === undefined)
    .map((item) => item.name);
}

export function addonIdsFor(basket: Basket, selection: Selection): number[] {
  const ids: number[] = [];
  for (const item of basket.pack) {
    const id = item.sized ? selection.sizes[item.name] : item.options[0]?.addonId;
    if (id !== undefined) ids.push(id);
  }
  for (const extra of basket.extras) {
    if (selection.extras.includes(extra.addonId)) ids.push(extra.addonId);
  }
  return ids;
}

export function totalStroops(category: SterunCategory, basket: Basket, selection: Selection): bigint {
  return basket.extras
    .filter((extra) => selection.extras.includes(extra.addonId))
    .reduce((sum, extra) => sum + extra.priceStroops, category.priceStroops);
}

export function packChoices(basket: Basket, selection: Selection): { item: string; choice: string }[] {
  return basket.pack.flatMap((item) => {
    if (!item.sized) return [];
    const option = item.options.find((o) => o.addonId === selection.sizes[item.name]);
    return option ? [{ item: item.name, choice: option.label }] : [];
  });
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/entry/basket.ts fe/test/basket.test.ts
git commit -m "feat(fe): split a distance's race pack from its add-ons (STE-21)"
```

---

### Task 3: The runner's details (step 2 model)

**Files:**
- Create: `fe/src/modules/entry/details.ts`
- Test: `fe/test/entry-details.test.ts`

**Interfaces:**
- Consumes: `Missing` from `@/modules/organiser/missing`.
- Produces:

```ts
export type IdType = "national_id_card" | "passport" | "driving_licence" | "other";
export type Gender = "female" | "male";
export interface RunnerDetails { name: string; idType: IdType | ""; idNumber: string; bibName: string; email: string; phone: string; gender: Gender | ""; dateOfBirth: string; emergencyName: string; emergencyPhone: string }
export const EMPTY_DETAILS: RunnerDetails
export function missingRunnerDetails(d: RunnerDetails, today: string): Missing[]
export function impossibleRunnerDetails(d: RunnerDetails, today: string): Missing[]
export interface ParticipantBody { /* the vault body, snake_case */ }
export function participantBody(d: RunnerDetails, ctx: { eventId: number; categoryId: number; runner: string; addOns: { item: string; choice: string }[] }): ParticipantBody
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  EMPTY_DETAILS,
  impossibleRunnerDetails,
  missingRunnerDetails,
  participantBody,
  type RunnerDetails,
} from "@/modules/entry/details";

const TODAY = "2026-09-15";

const filled: RunnerDetails = {
  name: "Sari Wulandari",
  idType: "national_id_card",
  idNumber: "3471014501900001",
  bibName: "SARI",
  email: "sari@example.com",
  phone: "+6281234567890",
  gender: "female",
  dateOfBirth: "1990-01-05",
  emergencyName: "Budi",
  emergencyPhone: "+6281298765432",
};

describe("missingRunnerDetails", () => {
  it("lists every empty field in form order", () => {
    expect(missingRunnerDetails(EMPTY_DETAILS, TODAY).map((m) => m.field)).toEqual([
      "name", "idType", "idNumber", "bibName", "email", "phone",
      "gender", "dateOfBirth", "emergencyName", "emergencyPhone",
    ]);
  });

  it("treats spaces as empty", () => {
    expect(missingRunnerDetails({ ...filled, name: "   " }, TODAY).map((m) => m.field)).toEqual(["name"]);
  });

  it("passes a complete form", () => {
    expect(missingRunnerDetails(filled, TODAY)).toEqual([]);
  });

  it("includes the impossible values too, so Continue is judged on both", () => {
    expect(missingRunnerDetails({ ...filled, email: "sari" }, TODAY).map((m) => m.field)).toEqual(["email"]);
  });
});

describe("impossibleRunnerDetails", () => {
  it("says nothing about empty fields", () => {
    expect(impossibleRunnerDetails(EMPTY_DETAILS, TODAY)).toEqual([]);
  });

  it.each([
    ["bibName", { bibName: "ABCDEFGHIJKLMNOPQ" }],
    ["email", { email: "sari@" }],
    ["phone", { phone: "081234567890" }],
    ["emergencyPhone", { emergencyPhone: "+62" }],
    ["dateOfBirth", { dateOfBirth: "2026-09-16" }],
    ["dateOfBirth", { dateOfBirth: "1899-12-31" }],
  ])("refuses a bad %s", (field, patch) => {
    expect(impossibleRunnerDetails({ ...filled, ...patch }, TODAY).map((m) => m.field)).toEqual([field]);
  });

  it("accepts a 16 character bib name and today's boundary dates", () => {
    expect(impossibleRunnerDetails({ ...filled, bibName: "ABCDEFGHIJKLMNOP", dateOfBirth: "1900-01-01" }, TODAY)).toEqual([]);
  });

  it("refuses the same phone for the runner and the emergency contact", () => {
    expect(
      impossibleRunnerDetails({ ...filled, emergencyPhone: filled.phone }, TODAY).map((m) => m.field),
    ).toEqual(["emergencyPhone"]);
  });
});

describe("participantBody", () => {
  it("trims and maps to the vault's field names", () => {
    const body = participantBody(
      { ...filled, name: "  Sari Wulandari ", bibName: " SARI " },
      { eventId: 3, categoryId: 1, runner: "GABC", addOns: [{ item: "Event jersey", choice: "L" }] },
    );
    expect(body).toEqual({
      name: "Sari Wulandari",
      national_id: "3471014501900001",
      emergency_contact: "+6281298765432",
      event_id: 3,
      category_id: 1,
      runner_address: "GABC",
      add_ons: [{ item: "Event jersey", choice: "L" }],
      id_type: "national_id_card",
      bib_name: "SARI",
      email: "sari@example.com",
      phone: "+6281234567890",
      gender: "female",
      date_of_birth: "1990-01-05",
      emergency_contact_name: "Budi",
    });
  });

  it("leaves add_ons out when there are none", () => {
    const body = participantBody(filled, { eventId: 3, categoryId: 1, runner: "GABC", addOns: [] });
    expect("add_ons" in body).toBe(false);
  });
});
```

The "same phone twice" rule is not in the vault; it is here because an emergency contact who is the runner reaches nobody.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `fe/src/modules/entry/details.ts`

```ts
/**
 * Step 2, as data: what is missing, what is impossible, and what the vault is sent.
 *
 * Same split as the wizard (`modules/organiser/missing.ts`): an empty field
 * waits for Continue, an impossible value is said as soon as it exists. The
 * rules mirror `be/src/routes/participants.ts` so a form that passes here is
 * not refused there; the server's check is still the one that counts.
 *
 * Nothing in this module is ever persisted. An identity number left in browser
 * storage on a shared laptop is the failure this flow must not have.
 */
import type { Missing } from "@/modules/organiser/missing";

export type IdType = "national_id_card" | "passport" | "driving_licence" | "other";
export type Gender = "female" | "male";

export interface RunnerDetails {
  name: string;
  idType: IdType | "";
  idNumber: string;
  bibName: string;
  email: string;
  phone: string;
  gender: Gender | "";
  dateOfBirth: string;
  emergencyName: string;
  emergencyPhone: string;
}

export const EMPTY_DETAILS: RunnerDetails = {
  name: "",
  idType: "",
  idNumber: "",
  bibName: "",
  email: "",
  phone: "",
  gender: "",
  dateOfBirth: "",
  emergencyName: "",
  emergencyPhone: "",
};

export const ID_TYPES: readonly { value: IdType; label: string }[] = [
  { value: "national_id_card", label: "National ID card" },
  { value: "passport", label: "Passport" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "other", label: "Other" },
];

export const BIB_NAME_MAX = 16;
const E164 = /^\+[1-9][0-9]{6,14}$/;
// Deliberately loose: the server's `format: "email"` is the real check, and a
// stricter pattern here only refuses addresses the server would take.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EARLIEST_DOB = "1900-01-01";

export function missingRunnerDetails(d: RunnerDetails, today: string): Missing[] {
  const missing: Missing[] = [];
  const need = (field: keyof RunnerDetails, focusId: string, message: string, empty: boolean) => {
    if (empty) missing.push({ field, focusId, message });
  };

  need("name", "runner-name", "Enter your full name.", !d.name.trim());
  need("idType", "runner-id-type", "Pick the type of ID you will bring.", !d.idType);
  need("idNumber", "runner-id-number", "Enter the number on your ID.", !d.idNumber.trim());
  need("bibName", "runner-bib-name", "Choose the name printed on your bib.", !d.bibName.trim());
  need("email", "runner-email", "Enter your email.", !d.email.trim());
  need("phone", "runner-phone", "Enter your phone number.", !d.phone);
  need("gender", "runner-gender", "Pick one.", !d.gender);
  need("dateOfBirth", "runner-dob-date", "Pick your date of birth.", !d.dateOfBirth);
  need("emergencyName", "runner-emergency-name", "Enter who we call in an emergency.", !d.emergencyName.trim());
  need("emergencyPhone", "runner-emergency-phone", "Enter their phone number.", !d.emergencyPhone);

  return [...missing, ...impossibleRunnerDetails(d, today)];
}

export function impossibleRunnerDetails(d: RunnerDetails, today: string): Missing[] {
  const problems: Missing[] = [];

  if (d.bibName.trim().length > BIB_NAME_MAX) {
    problems.push({
      field: "bibName",
      focusId: "runner-bib-name",
      message: `A bib fits ${BIB_NAME_MAX} characters at most.`,
    });
  }
  if (d.email.trim() && !EMAIL.test(d.email.trim())) {
    problems.push({ field: "email", focusId: "runner-email", message: "This email looks incomplete." });
  }
  if (d.phone && !E164.test(d.phone)) {
    problems.push({ field: "phone", focusId: "runner-phone", message: "This phone number looks incomplete." });
  }
  if (d.emergencyPhone && !E164.test(d.emergencyPhone)) {
    problems.push({
      field: "emergencyPhone",
      focusId: "runner-emergency-phone",
      message: "This phone number looks incomplete.",
    });
  } else if (d.emergencyPhone && d.emergencyPhone === d.phone) {
    problems.push({
      field: "emergencyPhone",
      focusId: "runner-emergency-phone",
      message: "Use someone else's number, so we can reach them if something happens to you.",
    });
  }
  if (d.dateOfBirth && (d.dateOfBirth > today || d.dateOfBirth < EARLIEST_DOB)) {
    problems.push({
      field: "dateOfBirth",
      focusId: "runner-dob-date",
      message: "Check your date of birth.",
    });
  }

  return problems;
}

export interface ParticipantBody {
  name: string;
  national_id: string;
  emergency_contact: string;
  event_id: number;
  category_id: number;
  runner_address: string;
  add_ons?: { item: string; choice: string }[];
  id_type: IdType;
  bib_name: string;
  email: string;
  phone: string;
  gender: Gender;
  date_of_birth: string;
  emergency_contact_name: string;
}

/** Only call on details that passed `missingRunnerDetails`. */
export function participantBody(
  d: RunnerDetails,
  ctx: { eventId: number; categoryId: number; runner: string; addOns: { item: string; choice: string }[] },
): ParticipantBody {
  return {
    name: d.name.trim(),
    national_id: d.idNumber.trim(),
    emergency_contact: d.emergencyPhone,
    event_id: ctx.eventId,
    category_id: ctx.categoryId,
    runner_address: ctx.runner,
    ...(ctx.addOns.length > 0 ? { add_ons: ctx.addOns } : {}),
    id_type: d.idType as IdType,
    bib_name: d.bibName.trim(),
    email: d.email.trim(),
    phone: d.phone,
    gender: d.gender as Gender,
    date_of_birth: d.dateOfBirth,
    emergency_contact_name: d.emergencyName.trim(),
  };
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/entry/details.ts fe/test/entry-details.test.ts
git commit -m "feat(fe): the runner details model, matching the vault's rules (STE-21)"
```

---

### Task 4: Vault calls and the stored entry

**Files:**
- Create: `fe/src/lib/participants.ts`, `fe/src/lib/entry-store.ts`
- Modify: `fe/test/setup.ts`
- Test: `fe/test/participants.test.ts`, `fe/test/entry-store.test.ts`

**Interfaces:**
- Consumes: `apiFetch` from `@/lib/api`; `MessageSigner` from `@/lib/upload`; `ParticipantBody` from Task 3.
- Produces:

```ts
// participants.ts
export interface Submitted { participantId: string; participantHash: string; salt: string; totpSecret: string }
export function submitParticipant(body: ParticipantBody, sign: MessageSigner): Promise<Submitted>
export function confirmParticipant(args: { participantId: string; tokenId: number; txHash: string; address: string; sign: MessageSigner }): Promise<void>
// entry-store.ts
export interface StoredEntry { eventId: number; categoryId: number; tokenId: number; bibNo: number; bibName: string; raceName: string; startsAt: string; distanceCode: string; participantHash: string; salt: string; totpSecret: string; txHash: string; runner: string; enteredAt: string; confirmed: boolean }
export function saveEntry(entry: StoredEntry): Promise<void>
export function readEntry(tokenId: number): Promise<StoredEntry | undefined>
export function markConfirmed(tokenId: number): Promise<void>
export function unconfirmedEntries(): Promise<StoredEntry[]>
```

`startsAt` is a decimal string because IndexedDB structured clone keeps `bigint`, but a string survives any future export too.

- [ ] **Step 1: Add fake IndexedDB to the setup.** Top of `fe/test/setup.ts`, after the jest-dom import:

```ts
// jsdom has no IndexedDB. The entry store is the one place that writes it.
import "fake-indexeddb/auto";
```

- [ ] **Step 2: Write the failing tests**

`fe/test/participants.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch,
}));

import { confirmParticipant, submitParticipant } from "@/lib/participants";
import type { ParticipantBody } from "@/modules/entry/details";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const body = { runner_address: RUNNER, event_id: 1, category_id: 0 } as ParticipantBody;

describe("submitParticipant", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("signs a fresh challenge and sends the body with the three headers", async () => {
    apiFetch
      .mockResolvedValueOnce({ nonce: "n1", expires_at: "x" })
      .mockResolvedValueOnce({
        participant_id: "p1",
        participant_hash: "a".repeat(64),
        salt: "b".repeat(64),
        totp_secret: "c".repeat(64),
        shown_once: true,
      });
    const sign = vi.fn(async () => "sig");

    const result = await submitParticipant(body, sign);

    expect(sign).toHaveBeenCalledWith("n1", { address: RUNNER });
    expect(apiFetch).toHaveBeenLastCalledWith("/participants", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sterun-address": RUNNER,
        "x-sterun-nonce": "n1",
        "x-sterun-signature": "sig",
      },
      body: JSON.stringify(body),
    });
    expect(result).toEqual({
      participantId: "p1",
      participantHash: "a".repeat(64),
      salt: "b".repeat(64),
      totpSecret: "c".repeat(64),
    });
  });

  it("sends nothing when the signature is declined", async () => {
    apiFetch.mockResolvedValueOnce({ nonce: "n1", expires_at: "x" });
    await expect(submitParticipant(body, async () => { throw new Error("User declined"); })).rejects.toThrow(
      "User declined",
    );
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("confirmParticipant", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("links the vault row to the token", async () => {
    apiFetch.mockResolvedValueOnce({ nonce: "n2", expires_at: "x" }).mockResolvedValueOnce({});
    await confirmParticipant({
      participantId: "p1", tokenId: 7, txHash: "d".repeat(64), address: RUNNER, sign: async () => "sig",
    });
    expect(apiFetch).toHaveBeenLastCalledWith("/participants/p1/confirm", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ token_id: 7, enter_tx_hash: "d".repeat(64) }),
    }));
  });
});
```

`fe/test/entry-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { markConfirmed, readEntry, saveEntry, unconfirmedEntries, type StoredEntry } from "@/lib/entry-store";

const entry: StoredEntry = {
  eventId: 1, categoryId: 0, tokenId: 42, bibNo: 0, bibName: "SARI", raceName: "Jogja 10K",
  startsAt: "1790548200", distanceCode: "10K", participantHash: "a".repeat(64), salt: "b".repeat(64),
  totpSecret: "c".repeat(64), txHash: "d".repeat(64), runner: "GABC", enteredAt: "2026-09-15T01:00:00.000Z",
  confirmed: false,
};

describe("entry store", () => {
  it("reads back what it saved", async () => {
    await saveEntry(entry);
    expect(await readEntry(42)).toEqual(entry);
  });

  it("answers undefined for a token this browser never entered", async () => {
    expect(await readEntry(999)).toBeUndefined();
  });

  it("tracks which entries still need confirming", async () => {
    await saveEntry({ ...entry, tokenId: 43 });
    expect((await unconfirmedEntries()).map((e) => e.tokenId)).toContain(43);
    await markConfirmed(43);
    expect((await unconfirmedEntries()).map((e) => e.tokenId)).not.toContain(43);
  });
});
```

- [ ] **Step 3: Run both, expect FAIL** (modules missing).

- [ ] **Step 4: Implement** `fe/src/lib/participants.ts`

```ts
/**
 * The vault, as the entry flow uses it.
 *
 * Authenticated the same way as uploads (`lib/upload.ts`): one challenge per
 * call, because a nonce is single-use and lives two minutes. The details go in
 * once; `participant_hash`, `salt` and `totp_secret` come back once and are
 * never returned again, so the caller must keep them.
 */
import { apiFetch } from "./api";
import type { MessageSigner } from "./upload";
import type { ParticipantBody } from "@/modules/entry/details";

export interface Submitted {
  participantId: string;
  participantHash: string;
  salt: string;
  totpSecret: string;
}

async function signedHeaders(address: string, sign: MessageSigner): Promise<Record<string, string>> {
  const challenge = await apiFetch<{ nonce: string; expires_at: string }>("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const signature = await sign(challenge.nonce, { address });
  return {
    "content-type": "application/json",
    "x-sterun-address": address,
    "x-sterun-nonce": challenge.nonce,
    "x-sterun-signature": signature,
  };
}

export async function submitParticipant(body: ParticipantBody, sign: MessageSigner): Promise<Submitted> {
  const headers = await signedHeaders(body.runner_address, sign);
  const response = await apiFetch<{
    participant_id: string;
    participant_hash: string;
    salt: string;
    totp_secret: string;
  }>("/participants", { method: "POST", headers, body: JSON.stringify(body) });
  return {
    participantId: response.participant_id,
    participantHash: response.participant_hash,
    salt: response.salt,
    totpSecret: response.totp_secret,
  };
}

export async function confirmParticipant(args: {
  participantId: string;
  tokenId: number;
  txHash: string;
  address: string;
  sign: MessageSigner;
}): Promise<void> {
  const headers = await signedHeaders(args.address, args.sign);
  await apiFetch(`/participants/${args.participantId}/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({ token_id: args.tokenId, enter_tx_hash: args.txHash }),
  });
}
```

`fe/src/lib/entry-store.ts`

```ts
/**
 * What this browser keeps about an entry it made.
 *
 * The name on the bib and the receipt code are on no chain and returned by no
 * route, so this is the only place the success page can read them after a
 * refresh, and the only place round 2's pass can read the secret without a
 * network. Personal details are not here, by design.
 *
 * `confirmed` exists because linking the vault row to the token is retried in
 * the background: the entry is already real on chain when that call fails.
 */
import { createStore, get, set, values } from "idb-keyval";

export interface StoredEntry {
  eventId: number;
  categoryId: number;
  tokenId: number;
  bibNo: number;
  bibName: string;
  raceName: string;
  /** Unix seconds, as a decimal string. */
  startsAt: string;
  distanceCode: string;
  participantHash: string;
  salt: string;
  totpSecret: string;
  txHash: string;
  runner: string;
  enteredAt: string;
  confirmed: boolean;
  /** Needed to retry confirming. */
  participantId?: string;
}

const store = () => createStore("sterun-entries", "entries");

export async function saveEntry(entry: StoredEntry): Promise<void> {
  await set(entry.tokenId, entry, store());
}

export async function readEntry(tokenId: number): Promise<StoredEntry | undefined> {
  return get<StoredEntry>(tokenId, store());
}

export async function markConfirmed(tokenId: number): Promise<void> {
  const entry = await readEntry(tokenId);
  if (entry) await saveEntry({ ...entry, confirmed: true });
}

export async function unconfirmedEntries(): Promise<StoredEntry[]> {
  return (await values<StoredEntry>(store())).filter((entry) => !entry.confirmed);
}
```

Add `participantId?: string` to the test fixture expectations only if a test sets it; the fixture above omits it and still round-trips.

- [ ] **Step 5: Run both, expect PASS.**

- [ ] **Step 6: Commit**

```bash
git add fe/src/lib/participants.ts fe/src/lib/entry-store.ts fe/test/setup.ts fe/test/participants.test.ts fe/test/entry-store.test.ts
git commit -m "feat(fe): send entry details to the vault and keep the receipt on the device (STE-21)"
```

---

### Task 5: sUSD balance, trustline and test funds

**Files:**
- Create: `fe/src/lib/susd.ts`, `fe/src/hooks/useSusdBalance.ts`
- Test: `fe/test/susd.test.ts`

**Interfaces:**
- Consumes: `NETWORK`, `SUSD_ISSUER`, `IS_TESTNET` from `@/lib/env`; `apiFetch`, `ApiError`; `MessageSigner`; `signTransaction` type from `@/lib/wallet`.
- Produces:

```ts
export type SusdBalance = { kind: "no-account" } | { kind: "no-trustline" } | { kind: "balance"; stroops: bigint }
export interface BalanceReader { getSACBalance(address: string, asset: Asset, passphrase?: string): Promise<{ balanceEntry?: { amount: string } }>; getAccount(address: string): Promise<unknown> }
export function readSusdBalance(address: string, server?: BalanceReader): Promise<SusdBalance>
export function shortfall(balance: SusdBalance, total: bigint): bigint
export function addSusdTrustline(address: string, sign: typeof signTransaction): Promise<void>
export type FaucetResult = { kind: "sent" } | { kind: "rate-limited" } | { kind: "empty" } | { kind: "unavailable" }
export function requestTestSusd(address: string, sign: MessageSigner): Promise<FaucetResult>
export function useSusdBalance(address: string | null): UseQueryResult<SusdBalance>
```

**STE-49 is not built yet.** `requestTestSusd` targets `POST /faucet` with the wallet-signature headers and maps the error codes the ticket asks for (`no-trustline`, `rate-limited`, `faucet-empty`). A 404 maps to `unavailable`, so this ships before the route and starts working when it lands. Confirm the path with James on STE-49 before merging; change only the string if it differs.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch,
}));

import { ApiError } from "@/lib/api";
import { readSusdBalance, requestTestSusd, shortfall } from "@/lib/susd";

const ADDRESS = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";

function server(over: { balance?: string | null; account?: boolean }) {
  return {
    getSACBalance: vi.fn(async () => (over.balance == null ? {} : { balanceEntry: { amount: over.balance } })),
    getAccount: vi.fn(async () => {
      if (over.account === false) throw new Error("Account not found");
      return {};
    }),
  };
}

describe("readSusdBalance", () => {
  it("reads the balance in stroops", async () => {
    expect(await readSusdBalance(ADDRESS, server({ balance: "1500000000" }))).toEqual({
      kind: "balance",
      stroops: 1_500_000_000n,
    });
  });

  it("tells a missing trustline from a missing account", async () => {
    expect(await readSusdBalance(ADDRESS, server({ balance: null }))).toEqual({ kind: "no-trustline" });
    expect(await readSusdBalance(ADDRESS, server({ balance: null, account: false }))).toEqual({ kind: "no-account" });
  });
});

describe("shortfall", () => {
  it("is zero when the balance covers the total", () => {
    expect(shortfall({ kind: "balance", stroops: 300n }, 300n)).toBe(0n);
  });
  it("is the difference when it does not", () => {
    expect(shortfall({ kind: "balance", stroops: 100n }, 300n)).toBe(200n);
  });
  it("is the whole total with no trustline", () => {
    expect(shortfall({ kind: "no-trustline" }, 300n)).toBe(300n);
  });
  it("is zero for a free entry, whatever the wallet holds", () => {
    expect(shortfall({ kind: "no-account" }, 0n)).toBe(0n);
  });
});

describe("requestTestSusd", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it.each([
    [404, "not-found", "unavailable"],
    [429, "rate-limited", "rate-limited"],
    [503, "faucet-empty", "empty"],
  ])("maps %s %s to %s", async (status, code, kind) => {
    apiFetch
      .mockResolvedValueOnce({ nonce: "n", expires_at: "x" })
      .mockRejectedValueOnce(new ApiError(status, code, "x"));
    expect(await requestTestSusd(ADDRESS, async () => "sig")).toEqual({ kind });
  });

  it("reports a send", async () => {
    apiFetch.mockResolvedValueOnce({ nonce: "n", expires_at: "x" }).mockResolvedValueOnce({});
    expect(await requestTestSusd(ADDRESS, async () => "sig")).toEqual({ kind: "sent" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `fe/src/lib/susd.ts`

```ts
/**
 * sUSD from the runner's side: can they pay, and if not, how they get some.
 *
 * The balance is read through the asset contract, because that is what
 * `enter` asks when it moves the fee. A missing balance entry means no
 * trustline; a missing account means the wallet was never funded at all, and
 * a trustline cannot be opened until it is.
 *
 * Test sUSD only exists on testnet, and nothing here runs anywhere else.
 */
import { Asset, BASE_FEE, Operation, TransactionBuilder, rpc } from "@stellar/stellar-sdk";

import { ApiError, apiFetch } from "./api";
import { IS_TESTNET, NETWORK, SUSD_ISSUER } from "./env";
import { PlainError } from "./plain-error";
import type { MessageSigner } from "./upload";
import type { signTransaction } from "./wallet";

export type SusdBalance =
  | { kind: "no-account" }
  | { kind: "no-trustline" }
  | { kind: "balance"; stroops: bigint };

export interface BalanceReader {
  getSACBalance(
    address: string,
    asset: Asset,
    passphrase?: string,
  ): Promise<{ balanceEntry?: { amount: string } }>;
  getAccount(address: string): Promise<unknown>;
}

export const SUSD = () => new Asset("sUSD", SUSD_ISSUER);

const rpcServer = () => new rpc.Server(NETWORK.rpcUrl);

export async function readSusdBalance(
  address: string,
  server: BalanceReader = rpcServer(),
): Promise<SusdBalance> {
  const { balanceEntry } = await server.getSACBalance(address, SUSD(), NETWORK.networkPassphrase);
  if (balanceEntry) return { kind: "balance", stroops: BigInt(balanceEntry.amount) };
  try {
    await server.getAccount(address);
    return { kind: "no-trustline" };
  } catch {
    return { kind: "no-account" };
  }
}

export function shortfall(balance: SusdBalance, total: bigint): bigint {
  if (total === 0n) return 0n;
  const held = balance.kind === "balance" ? balance.stroops : 0n;
  return held >= total ? 0n : total - held;
}

/** Friendbot, then one `changeTrust`. Testnet only. */
export async function addSusdTrustline(address: string, sign: typeof signTransaction): Promise<void> {
  if (!IS_TESTNET) throw new PlainError("Test sUSD is only available on the test network.");
  const server = rpcServer();

  let account;
  try {
    account = await server.getAccount(address);
  } catch {
    const funded = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
    if (!funded.ok) throw new PlainError("Your wallet could not be set up. Please try again.");
    account = await server.getAccount(address);
  }

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK.networkPassphrase })
    .addOperation(Operation.changeTrust({ asset: SUSD() }))
    .setTimeout(120)
    .build();
  const { signedTxXdr } = await sign(tx.toXDR(), { address });
  const sent = await server.sendTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, NETWORK.networkPassphrase),
  );
  if (sent.status === "ERROR") throw new PlainError("Your wallet could not be set up. Please try again.");
  const final = await server.pollTransaction(sent.hash, { attempts: 20 });
  if (final.status !== "SUCCESS") throw new PlainError("Your wallet could not be set up. Please try again.");
}

export type FaucetResult =
  | { kind: "sent" }
  | { kind: "rate-limited" }
  | { kind: "empty" }
  | { kind: "unavailable" };

/** STE-49. Confirm the route path with James before merging. */
export async function requestTestSusd(address: string, sign: MessageSigner): Promise<FaucetResult> {
  const challenge = await apiFetch<{ nonce: string; expires_at: string }>("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const signature = await sign(challenge.nonce, { address });
  try {
    await apiFetch("/faucet", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sterun-address": address,
        "x-sterun-nonce": challenge.nonce,
        "x-sterun-signature": signature,
      },
      body: JSON.stringify({}),
    });
    return { kind: "sent" };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === "rate-limited" || error.status === 429) return { kind: "rate-limited" };
      if (error.code === "faucet-empty") return { kind: "empty" };
      if (error.status === 404) return { kind: "unavailable" };
    }
    throw error;
  }
}
```

`fe/src/hooks/useSusdBalance.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { readSusdBalance, type SusdBalance } from "@/lib/susd";

export const susdKey = (address: string | null) => ["susd-balance", address] as const;

/** Fresh enough to decide a pay button; re-read by hand after funding. */
export function useSusdBalance(address: string | null) {
  return useQuery<SusdBalance>({
    queryKey: susdKey(address),
    queryFn: () => readSusdBalance(address!),
    enabled: Boolean(address),
    staleTime: 5_000,
  });
}
```

- [ ] **Step 4: Run, expect PASS.** Then `pnpm --filter fe typecheck`.

- [ ] **Step 5: Commit**

```bash
git add fe/src/lib/susd.ts fe/src/hooks/useSusdBalance.ts fe/test/susd.test.ts
git commit -m "feat(fe): read a runner's sUSD and get them test funds (STE-21)"
```

---

### Task 6: The gate, and this wallet's records

**Files:**
- Create: `fe/src/modules/entry/gate.ts`, `fe/src/hooks/useRunnerRecords.ts`
- Test: `fe/test/entry-gate.test.ts`

**Interfaces:**
- Consumes: `EventSummary`; `SterunRecord`.
- Produces:

```ts
export type Gate =
  | { kind: "closed" }
  | { kind: "already-entered"; record: SterunRecord; distanceCode: string }
  | { kind: "sold-out"; categoryId: number }
  | { kind: "no-distance" }
  | { kind: "open"; categoryId: number }
export function entryGate(summary: EventSummary, records: SterunRecord[], requested: number | null): Gate
export function useRunnerRecords(address: string | null): UseQueryResult<SterunRecord[]>
export const runnerRecordsKey: (address: string | null) => readonly unknown[]
```

The wallet check is not in `entryGate`: `EntryFlow` renders `WalletGate` around the whole flow. `requested` is `?category=`; when absent or unknown the first distance with places is chosen.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import type { EventSummary } from "@/lib/events";
import { entryGate } from "@/modules/entry/gate";
import type { SterunCategory, SterunRecord } from "@sterunxyz/sdk";

const cat = (categoryId: number, slotsLeft: number, code = `C${categoryId}`): SterunCategory => ({
  eventId: 5, categoryId, code, distanceM: 5000, quota: 10, enteredCount: 10 - slotsLeft,
  priceStroops: 0n, slotsLeft,
});

const summary = (status: EventSummary["event"]["status"], categories: SterunCategory[]): EventSummary => ({
  event: { eventId: 5, organiser: "G", name: "R", metadataHash: "a".repeat(64), uri: "", startsAt: 0n, status },
  categories,
});

const record = (eventId: number, categoryId: number): SterunRecord => ({
  tokenId: 9, eventId, categoryId, bibNo: 0, participantHash: "a".repeat(64), state: "Entered",
  enteredAt: 0n, claimedAt: null, finishTimeS: null, resultAt: null, addonIds: [],
} as SterunRecord);

describe("entryGate", () => {
  it("is closed unless the race is Open", () => {
    expect(entryGate(summary("Closed", [cat(0, 3)]), [], 0)).toEqual({ kind: "closed" });
    expect(entryGate(summary("Draft", [cat(0, 3)]), [], 0)).toEqual({ kind: "closed" });
  });

  it("stops a wallet that already entered this race, on any distance", () => {
    const gate = entryGate(summary("Open", [cat(0, 3, "5K"), cat(1, 3, "10K")]), [record(5, 1)], 0);
    expect(gate).toMatchObject({ kind: "already-entered", distanceCode: "10K" });
  });

  it("ignores records from other races", () => {
    expect(entryGate(summary("Open", [cat(0, 3)]), [record(4, 0)], 0)).toEqual({ kind: "open", categoryId: 0 });
  });

  it("checks already-entered before closed", () => {
    expect(entryGate(summary("Closed", [cat(0, 3)]), [record(5, 0)], 0).kind).toBe("already-entered");
  });

  it("says sold out for a full requested distance", () => {
    expect(entryGate(summary("Open", [cat(0, 0), cat(1, 2)]), [], 0)).toEqual({ kind: "sold-out", categoryId: 0 });
  });

  it("picks the first distance with places when none is requested", () => {
    expect(entryGate(summary("Open", [cat(0, 0), cat(1, 2)]), [], null)).toEqual({ kind: "open", categoryId: 1 });
  });

  it("treats an unknown distance id as not requested", () => {
    expect(entryGate(summary("Open", [cat(0, 2)]), [], 7)).toEqual({ kind: "open", categoryId: 0 });
  });

  it("has nowhere to go when every distance is full", () => {
    expect(entryGate(summary("Open", [cat(0, 0)]), [], null)).toEqual({ kind: "no-distance" });
  });
});
```

Already-entered is checked first on purpose: a runner who entered and returns after close should see their entry, not "closed".

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `fe/src/modules/entry/gate.ts`

```ts
/**
 * What the enter page shows before any form.
 *
 * The already-entered check reads this wallet's records from chain, never the
 * index: it decides whether somebody pays twice, and `enter` itself does not
 * refuse a second entry from one wallet.
 */
import type { EventSummary } from "@/lib/events";
import type { SterunRecord } from "@sterunxyz/sdk";

export type Gate =
  | { kind: "closed" }
  | { kind: "already-entered"; record: SterunRecord; distanceCode: string }
  | { kind: "sold-out"; categoryId: number }
  | { kind: "no-distance" }
  | { kind: "open"; categoryId: number };

export function entryGate(summary: EventSummary, records: SterunRecord[], requested: number | null): Gate {
  const { event, categories } = summary;

  const existing = records.find((record) => record.eventId === event.eventId);
  if (existing) {
    const code = categories.find((c) => c.categoryId === existing.categoryId)?.code ?? "";
    return { kind: "already-entered", record: existing, distanceCode: code };
  }

  if (event.status !== "Open") return { kind: "closed" };

  const chosen = categories.find((c) => c.categoryId === requested);
  if (chosen) {
    return chosen.slotsLeft > 0 ? { kind: "open", categoryId: chosen.categoryId } : { kind: "sold-out", categoryId: chosen.categoryId };
  }

  const first = categories.find((c) => c.slotsLeft > 0);
  return first ? { kind: "open", categoryId: first.categoryId } : { kind: "no-distance" };
}
```

`fe/src/hooks/useRunnerRecords.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { readClient } from "@/lib/sterun";
import type { SterunRecord } from "@sterunxyz/sdk";

export const runnerRecordsKey = (address: string | null) => ["runner-records", address] as const;

/** Never cached for long: it is the guard against paying twice. */
export function useRunnerRecords(address: string | null) {
  return useQuery<SterunRecord[]>({
    queryKey: runnerRecordsKey(address),
    queryFn: () => readClient.recordsOfDetailed(address!),
    enabled: Boolean(address),
    staleTime: 0,
  });
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/entry/gate.ts fe/src/hooks/useRunnerRecords.ts fe/test/entry-gate.test.ts
git commit -m "feat(fe): decide what the enter page shows before the form (STE-21)"
```

---

### Task 7: Classifying an `enter` failure

**Files:**
- Create: `fe/src/modules/entry/enter-failure.ts`
- Modify: `fe/src/lib/errors.ts`
- Test: `fe/test/enter-failure.test.ts`, `fe/test/errors.test.ts` (append)

**How the band problem is settled.** An `enter` revert is not decoded by code, because the sUSD token shares EventRegistry's `1..=99` band. Instead, after a failure that is neither a decline nor no answer, the chain is re-read and the state explains the failure:

1. event not `Open` → closed
2. chosen distance `slotsLeft === 0` → sold out
3. any reserved add-on `unitsLeft === 0` → an item sold out
4. balance short (includes no trustline) → not enough sUSD
5. otherwise → `friendlyError` (generic)

These are facts on the ledger after the refusal, so the sentence is true whichever contract refused. `OUR_OWN_METHODS` stays without `enter`.

**Interfaces:**
- Consumes: `friendlyError`; `SusdBalance`, `shortfall`.
- Produces:

```ts
// errors.ts
export function isNoAnswer(error: unknown): boolean
export function isDeclined(error: unknown): boolean
// enter-failure.ts
export interface ChainAfter { status: EventStatus; slotsLeft: number; soldOutAddOns: string[]; balance: SusdBalance; total: bigint }
export type EnterFailure =
  | { kind: "declined" }
  | { kind: "no-answer" }
  | { kind: "closed" }
  | { kind: "sold-out" }
  | { kind: "add-on-sold-out"; names: string[] }
  | { kind: "short"; needed: bigint }
  | { kind: "other"; message: string }
export function classifyEnterFailure(error: unknown, after: ChainAfter | null): EnterFailure
```

`after` is `null` when re-reading itself failed; that case yields `other`.

- [ ] **Step 1: Write the failing tests**

Append to `fe/test/errors.test.ts`:

```ts
import { isDeclined, isNoAnswer } from "@/lib/errors";

describe("isNoAnswer / isDeclined", () => {
  it("recognises a send with no result", () => {
    expect(isNoAnswer(new Error("enter returned no transaction hash"))).toBe(true);
    expect(isNoAnswer(new Error("User declined"))).toBe(false);
  });

  it("recognises a decline, but not one reported after submission", () => {
    expect(isDeclined({ error: { code: -4, message: "User rejected the request" } })).toBe(true);
    expect(isDeclined(new Error("rejected after it was submitted"))).toBe(false);
  });
});
```

`fe/test/enter-failure.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyEnterFailure, type ChainAfter } from "@/modules/entry/enter-failure";

const healthy: ChainAfter = {
  status: "Open", slotsLeft: 5, soldOutAddOns: [], balance: { kind: "balance", stroops: 1_000n }, total: 500n,
};
const revert = new Error("enter reverted with Error(Contract, #10)");

describe("classifyEnterFailure", () => {
  it("reads a decline before looking at the chain", () => {
    expect(classifyEnterFailure(new Error("User declined"), null)).toEqual({ kind: "declined" });
  });

  it("reads no answer before looking at the chain", () => {
    expect(classifyEnterFailure(new Error("returned no transaction hash"), null)).toEqual({ kind: "no-answer" });
  });

  it("explains a refusal from what the chain now says, in order", () => {
    expect(classifyEnterFailure(revert, { ...healthy, status: "Closed", slotsLeft: 0 })).toEqual({ kind: "closed" });
    expect(classifyEnterFailure(revert, { ...healthy, slotsLeft: 0 })).toEqual({ kind: "sold-out" });
    expect(classifyEnterFailure(revert, { ...healthy, soldOutAddOns: ["Event jersey"] })).toEqual({
      kind: "add-on-sold-out",
      names: ["Event jersey"],
    });
    expect(classifyEnterFailure(revert, { ...healthy, balance: { kind: "no-trustline" } })).toEqual({
      kind: "short",
      needed: 500n,
    });
  });

  it("falls back to the plain sentence when nothing on chain explains it", () => {
    expect(classifyEnterFailure(revert, healthy)).toEqual({
      kind: "other",
      message: "Something went wrong. Please try again.",
    });
  });

  it("falls back when the chain could not be re-read", () => {
    expect(classifyEnterFailure(revert, null).kind).toBe("other");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** In `fe/src/lib/errors.ts`, before `friendlyError`:

```ts
/**
 * For a flow that branches on the kind of stop rather than printing a
 * sentence (the entry flow's Sign and pay). The same text rules as below, so
 * there is still one list to read.
 */
export function isNoAnswer(error: unknown): boolean {
  return MAYBE_ALREADY_DONE_TEXT.test(messageOf(error));
}

export function isDeclined(error: unknown): boolean {
  const text = messageOf(error);
  return DECLINED_TEXT.test(text) && !REACHED_THE_NETWORK_TEXT.test(text) && !MAYBE_ALREADY_DONE_TEXT.test(text);
}
```

Update the `OUR_OWN_METHODS` comment's last sentence and the `CONTRACT_MESSAGES` comment to say STE-21 settled it by re-reading the chain (`modules/entry/enter-failure.ts`) instead of adding the sentences here.

`fe/src/modules/entry/enter-failure.ts`:

```ts
/**
 * Why `enter` did not go through, told from the ledger rather than the code.
 *
 * An error code out of `enter` cannot name its contract: the sUSD token
 * numbers its errors in EventRegistry's band, so decoding `#10` as a sold-out
 * distance could be a confident lie about a failed payment (`lib/errors.ts`).
 * What can be trusted is the state after the refusal. If the distance now has
 * no places, "this distance just sold out" is true whichever contract said no.
 *
 * Declines and no-answers are read first, from the error, because neither is a
 * refusal and the chain has nothing to add.
 */
import { friendlyError, isDeclined, isNoAnswer } from "@/lib/errors";
import { shortfall, type SusdBalance } from "@/lib/susd";
import type { EventStatus } from "@sterunxyz/sdk";

export interface ChainAfter {
  status: EventStatus;
  slotsLeft: number;
  /** Names of reserved items whose units ran out. */
  soldOutAddOns: string[];
  balance: SusdBalance;
  total: bigint;
}

export type EnterFailure =
  | { kind: "declined" }
  | { kind: "no-answer" }
  | { kind: "closed" }
  | { kind: "sold-out" }
  | { kind: "add-on-sold-out"; names: string[] }
  | { kind: "short"; needed: bigint }
  | { kind: "other"; message: string };

export function classifyEnterFailure(error: unknown, after: ChainAfter | null): EnterFailure {
  if (isNoAnswer(error)) return { kind: "no-answer" };
  if (isDeclined(error)) return { kind: "declined" };
  if (after) {
    if (after.status !== "Open") return { kind: "closed" };
    if (after.slotsLeft === 0) return { kind: "sold-out" };
    if (after.soldOutAddOns.length > 0) return { kind: "add-on-sold-out", names: after.soldOutAddOns };
    const needed = shortfall(after.balance, after.total);
    if (needed > 0n) return { kind: "short", needed };
  }
  return { kind: "other", message: friendlyError(error) };
}
```

- [ ] **Step 4: Run both, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add fe/src/lib/errors.ts fe/src/modules/entry/enter-failure.ts fe/test/errors.test.ts fe/test/enter-failure.test.ts
git commit -m "feat(fe): explain a refused entry from the ledger, not the error code (STE-21)"
```

---

### Task 8: The Sign and pay state machine

**Files:**
- Create: `fe/src/modules/entry/attempt.ts`
- Test: `fe/test/attempt.test.ts`

**Interfaces:**
- Consumes: `Submitted` (Task 4), `EnterFailure` (Task 7).
- Produces:

```ts
export type AttemptState =
  | { phase: "ready"; submitted: Submitted | null }
  | { phase: "confirming-identity" }
  | { phase: "paying"; submitted: Submitted }
  | { phase: "checking"; submitted: Submitted }
  | { phase: "entered"; tokenId: number }
  | { phase: "failed"; submitted: Submitted | null; failure: EnterFailure | { kind: "submit-failed"; message: string } }
  | { phase: "check-failed"; submitted: Submitted }
  | { phase: "not-through"; submitted: Submitted }
export type AttemptEvent =
  | { type: "start" } | { type: "submitted"; submitted: Submitted } | { type: "submit-failed"; message: string; declined: boolean }
  | { type: "entered"; tokenId: number } | { type: "enter-failed"; failure: EnterFailure }
  | { type: "found"; tokenId: number } | { type: "not-found" } | { type: "check-error" }
  | { type: "details-changed" } | { type: "check-again" }
export const INITIAL_ATTEMPT: AttemptState
export function attemptReducer(state: AttemptState, event: AttemptEvent): AttemptState
export function nextStep(state: AttemptState): "submit" | "enter" | "check" | null
```

The rule the spec asks for: a retry re-uses `submitted`; only `details-changed` clears it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { INITIAL_ATTEMPT, attemptReducer, nextStep, type AttemptState } from "@/modules/entry/attempt";

const submitted = { participantId: "p", participantHash: "a".repeat(64), salt: "b".repeat(64), totpSecret: "c".repeat(64) };
const run = (...events: Parameters<typeof attemptReducer>[1][]) => events.reduce(attemptReducer, INITIAL_ATTEMPT);

describe("attemptReducer", () => {
  it("goes submit, pay, entered", () => {
    expect(run({ type: "start" }).phase).toBe("confirming-identity");
    expect(nextStep(run({ type: "start" }))).toBe("submit");
    const paying = run({ type: "start" }, { type: "submitted", submitted });
    expect(paying).toEqual({ phase: "paying", submitted });
    expect(nextStep(paying)).toBe("enter");
    expect(attemptReducer(paying, { type: "entered", tokenId: 7 })).toEqual({ phase: "entered", tokenId: 7 });
  });

  it("repeats only the declined identity step, sending nothing yet", () => {
    const failed = run({ type: "start" }, { type: "submit-failed", message: "x", declined: true });
    expect(failed).toMatchObject({ phase: "failed", submitted: null, failure: { kind: "declined" } });
    expect(nextStep(attemptReducer(failed, { type: "start" }))).toBe("submit");
  });

  it("keeps the details already sent when payment is declined", () => {
    const failed = run({ type: "start" }, { type: "submitted", submitted }, { type: "enter-failed", failure: { kind: "declined" } });
    const retried = attemptReducer(failed, { type: "start" });
    expect(retried).toEqual({ phase: "paying", submitted });
    expect(nextStep(retried)).toBe("enter");
  });

  it("sends details again only after they change", () => {
    const failed = run({ type: "start" }, { type: "submitted", submitted }, { type: "enter-failed", failure: { kind: "sold-out" } });
    const edited = attemptReducer(failed, { type: "details-changed" });
    expect(edited).toEqual({ phase: "ready", submitted: null });
    expect(nextStep(attemptReducer(edited, { type: "start" }))).toBe("submit");
  });

  it("checks on its own when payment gets no answer", () => {
    const checking = run({ type: "start" }, { type: "submitted", submitted }, { type: "enter-failed", failure: { kind: "no-answer" } });
    expect(checking).toEqual({ phase: "checking", submitted });
    expect(nextStep(checking)).toBe("check");
  });

  it.each([
    [{ type: "found", tokenId: 3 } as const, { phase: "entered", tokenId: 3 }],
    [{ type: "not-found" } as const, { phase: "not-through", submitted }],
    [{ type: "check-error" } as const, { phase: "check-failed", submitted }],
  ])("ends a check with %o", (event, expected) => {
    const checking: AttemptState = { phase: "checking", submitted };
    expect(attemptReducer(checking, event)).toEqual(expected);
  });

  it("checks again without paying", () => {
    const failed: AttemptState = { phase: "check-failed", submitted };
    expect(attemptReducer(failed, { type: "check-again" })).toEqual({ phase: "checking", submitted });
  });

  it("pays again from not-through with the same details", () => {
    expect(attemptReducer({ phase: "not-through", submitted }, { type: "start" })).toEqual({ phase: "paying", submitted });
  });

  it("ignores events that do not belong to the phase", () => {
    expect(attemptReducer(INITIAL_ATTEMPT, { type: "entered", tokenId: 1 })).toBe(INITIAL_ATTEMPT);
    const entered: AttemptState = { phase: "entered", tokenId: 1 };
    expect(attemptReducer(entered, { type: "start" })).toBe(entered);
  });

  it("has no step to run when idle or finished", () => {
    expect(nextStep(INITIAL_ATTEMPT)).toBeNull();
    expect(nextStep({ phase: "entered", tokenId: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `fe/src/modules/entry/attempt.ts`

```ts
/**
 * Sign and pay, as a reducer: two wallet approvals and the ways they stop.
 *
 * Details first, payment second (spec decision 4). What the vault returned is
 * held for the whole attempt, so a retry never sends an identity number twice
 * and the hash paid for is the hash in the vault. Only editing the details
 * throws it away.
 *
 * No answer from the network is never shown as "it may have gone through". It
 * becomes a check: `enter` is atomic, so a wallet with no record in this race
 * was not charged, and that is something the page can say for certain.
 */
import type { Submitted } from "@/lib/participants";
import type { EnterFailure } from "./enter-failure";

export type AttemptFailure = EnterFailure | { kind: "submit-failed"; message: string };

export type AttemptState =
  | { phase: "ready"; submitted: Submitted | null }
  | { phase: "confirming-identity" }
  | { phase: "paying"; submitted: Submitted }
  | { phase: "checking"; submitted: Submitted }
  | { phase: "entered"; tokenId: number }
  | { phase: "failed"; submitted: Submitted | null; failure: AttemptFailure }
  | { phase: "check-failed"; submitted: Submitted }
  | { phase: "not-through"; submitted: Submitted };

export type AttemptEvent =
  | { type: "start" }
  | { type: "submitted"; submitted: Submitted }
  | { type: "submit-failed"; message: string; declined: boolean }
  | { type: "entered"; tokenId: number }
  | { type: "enter-failed"; failure: EnterFailure }
  | { type: "found"; tokenId: number }
  | { type: "not-found" }
  | { type: "check-error" }
  | { type: "details-changed" }
  | { type: "check-again" };

export const INITIAL_ATTEMPT: AttemptState = { phase: "ready", submitted: null };

function begin(submitted: Submitted | null): AttemptState {
  return submitted ? { phase: "paying", submitted } : { phase: "confirming-identity" };
}

export function attemptReducer(state: AttemptState, event: AttemptEvent): AttemptState {
  switch (state.phase) {
    case "ready":
      if (event.type === "start") return begin(state.submitted);
      if (event.type === "details-changed") return { phase: "ready", submitted: null };
      return state;

    case "confirming-identity":
      if (event.type === "submitted") return { phase: "paying", submitted: event.submitted };
      if (event.type === "submit-failed") {
        return {
          phase: "failed",
          submitted: null,
          failure: event.declined ? { kind: "declined" } : { kind: "submit-failed", message: event.message },
        };
      }
      return state;

    case "paying":
      if (event.type === "entered") return { phase: "entered", tokenId: event.tokenId };
      if (event.type === "enter-failed") {
        if (event.failure.kind === "no-answer") return { phase: "checking", submitted: state.submitted };
        return { phase: "failed", submitted: state.submitted, failure: event.failure };
      }
      return state;

    case "checking":
      if (event.type === "found") return { phase: "entered", tokenId: event.tokenId };
      if (event.type === "not-found") return { phase: "not-through", submitted: state.submitted };
      if (event.type === "check-error") return { phase: "check-failed", submitted: state.submitted };
      return state;

    case "failed":
      if (event.type === "start") return begin(state.submitted);
      if (event.type === "details-changed") return { phase: "ready", submitted: null };
      return state;

    case "check-failed":
      if (event.type === "check-again") return { phase: "checking", submitted: state.submitted };
      return state;

    case "not-through":
      if (event.type === "start") return { phase: "paying", submitted: state.submitted };
      if (event.type === "details-changed") return { phase: "ready", submitted: null };
      return state;

    case "entered":
      return state;
  }
}

export function nextStep(state: AttemptState): "submit" | "enter" | "check" | null {
  switch (state.phase) {
    case "confirming-identity":
      return "submit";
    case "paying":
      return "enter";
    case "checking":
      return "check";
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/entry/attempt.ts fe/test/attempt.test.ts
git commit -m "feat(fe): the Sign and pay state machine, retries that never resend details (STE-21)"
```

---

### Task 9: Running the attempt (hook)

**Files:**
- Create: `fe/src/hooks/useEntryAttempt.ts`
- Test: `fe/test/useEntryAttempt.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 to 8; `readClient`; `signMessage`, `signTransaction` from `@/lib/wallet`; `useQueryClient`.
- Produces:

```ts
export interface EntryPlan {
  runner: string; summary: EventSummary; categoryId: number; basket: Basket; selection: Selection;
  body: ParticipantBody; total: bigint;
}
export interface EntryAttemptDeps {
  submit: typeof submitParticipant; confirm: typeof confirmParticipant; enter: SterunClient["enter"];
  recordsOf: (runner: string) => Promise<SterunRecord[]>; chainAfter: (plan: EntryPlan) => Promise<ChainAfter>;
  save: typeof saveEntry; markConfirmed: typeof markConfirmed;
  checkWindowMs: number; checkIntervalMs: number;
}
export function useEntryAttempt(plan: EntryPlan | null, deps?: Partial<EntryAttemptDeps>): {
  state: AttemptState; start(): void; checkAgain(): void; detailsChanged(): void; running: boolean;
}
```

Effects run on `nextStep(state)`, one step per phase, guarded by a ref so Strict Mode does not double a step. On `entered` the hook saves the stored entry (bib from `recordOf`/`recordsOf`), fires `confirm` in the background (on failure it stays `confirmed: false`; `EnteredPage` retries once on mount), invalidates `runnerRecordsKey`, `eventKeys.one`, and `susdKey`.

The check: poll `recordsOf(runner)` every `checkIntervalMs` (3 000) until `checkWindowMs` (30 000); a record for `eventId` → `found`; none → `not-found`; a thrown read → `check-error`.

- [ ] **Step 1: Write the failing test** (deps injected, no network, no wallet)

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/wallet", () => ({ signMessage: vi.fn(), signTransaction: vi.fn() }));
vi.mock("@/lib/sterun", () => ({ readClient: {} }));

import { useEntryAttempt, type EntryPlan } from "@/hooks/useEntryAttempt";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const submitted = { participantId: "p", participantHash: "a".repeat(64), salt: "b".repeat(64), totpSecret: "c".repeat(64) };
const plan = {
  runner: RUNNER,
  summary: {
    event: { eventId: 5, organiser: "G", name: "Jogja 10K", metadataHash: "a".repeat(64), uri: "", startsAt: 1n, status: "Open" },
    categories: [{ eventId: 5, categoryId: 0, code: "10K", distanceM: 10000, quota: 9, enteredCount: 1, priceStroops: 0n, slotsLeft: 8 }],
  },
  categoryId: 0,
  basket: { pack: [], extras: [] },
  selection: { sizes: {}, extras: [] },
  body: { bib_name: "SARI" },
  total: 0n,
} as unknown as EntryPlan;

const record = { tokenId: 7, eventId: 5, categoryId: 0, bibNo: 1 };

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function deps(over = {}) {
  return {
    submit: vi.fn(async () => submitted),
    confirm: vi.fn(async () => {}),
    enter: vi.fn(async () => ({ value: 7, txHash: "d".repeat(64), ledger: 1 })),
    recordsOf: vi.fn(async () => [record]),
    chainAfter: vi.fn(),
    save: vi.fn(async () => {}),
    markConfirmed: vi.fn(async () => {}),
    checkWindowMs: 50,
    checkIntervalMs: 10,
    ...over,
  };
}

describe("useEntryAttempt", () => {
  it("submits, pays, saves and confirms", async () => {
    const d = deps();
    const { result } = renderHook(() => useEntryAttempt(plan, d), { wrapper });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toEqual({ phase: "entered", tokenId: 7 }));
    expect(d.submit).toHaveBeenCalledTimes(1);
    expect(d.enter).toHaveBeenCalledWith(
      { runner: RUNNER, eventId: 5, categoryId: 0, addOnIds: [], participantHash: "a".repeat(64) },
      expect.objectContaining({ publicKey: RUNNER }),
    );
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ tokenId: 7, bibNo: 1, bibName: "SARI", salt: "b".repeat(64) }));
    await waitFor(() => expect(d.markConfirmed).toHaveBeenCalledWith(7));
  });

  it("does not resend details when paying is tried again", async () => {
    const enter = vi.fn()
      .mockRejectedValueOnce(new Error("User declined"))
      .mockResolvedValueOnce({ value: 7, txHash: "d".repeat(64), ledger: 1 });
    const d = deps({ enter });
    const { result } = renderHook(() => useEntryAttempt(plan, d), { wrapper });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("failed"));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("entered"));
    expect(d.submit).toHaveBeenCalledTimes(1);
  });

  it("finds an entry that went through without an answer", async () => {
    const d = deps({ enter: vi.fn(async () => { throw new Error("returned no transaction hash"); }) });
    const { result } = renderHook(() => useEntryAttempt(plan, d), { wrapper });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toEqual({ phase: "entered", tokenId: 7 }));
  });

  it("says it did not go through when no record appears", async () => {
    const d = deps({
      enter: vi.fn(async () => { throw new Error("returned no transaction hash"); }),
      recordsOf: vi.fn(async () => []),
    });
    const { result } = renderHook(() => useEntryAttempt(plan, d), { wrapper });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("not-through"));
  });

  it("says it could not check when the read fails", async () => {
    const d = deps({
      enter: vi.fn(async () => { throw new Error("returned no transaction hash"); }),
      recordsOf: vi.fn(async () => { throw new Error("offline"); }),
    });
    const { result } = renderHook(() => useEntryAttempt(plan, d), { wrapper });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("check-failed"));
  });

  it("classifies a refusal from the chain afterwards", async () => {
    const d = deps({
      enter: vi.fn(async () => { throw new Error("enter reverted"); }),
      chainAfter: vi.fn(async () => ({ status: "Open", slotsLeft: 0, soldOutAddOns: [], balance: { kind: "no-account" }, total: 0n })),
    });
    const { result } = renderHook(() => useEntryAttempt(plan, d), { wrapper });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toMatchObject({ phase: "failed", failure: { kind: "sold-out" } }));
  });

  it("still enters when confirming fails, and leaves it unconfirmed", async () => {
    const d = deps({ confirm: vi.fn(async () => { throw new Error("api down"); }) });
    const { result } = renderHook(() => useEntryAttempt(plan, d), { wrapper });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("entered"));
    expect(d.markConfirmed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `fe/src/hooks/useEntryAttempt.ts`

```ts
"use client";

/**
 * Runs `modules/entry/attempt.ts` against the vault, the wallet and the chain.
 *
 * One effect per phase that has a step, guarded by the state object it started
 * from, so Strict Mode's second effect run does not sign twice. Every outside
 * call is injectable, which is how the test drives every failure row without a
 * wallet or a network.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { runnerRecordsKey } from "@/hooks/useRunnerRecords";
import { eventKeys } from "@/hooks/useEvents";
import { susdKey } from "@/hooks/useSusdBalance";
import { markConfirmed, saveEntry } from "@/lib/entry-store";
import { friendlyError, isDeclined } from "@/lib/errors";
import type { EventSummary } from "@/lib/events";
import { confirmParticipant, submitParticipant, type Submitted } from "@/lib/participants";
import { readClient } from "@/lib/sterun";
import { readSusdBalance } from "@/lib/susd";
import { signMessage, signTransaction } from "@/lib/wallet";
import { INITIAL_ATTEMPT, attemptReducer, nextStep, type AttemptState } from "@/modules/entry/attempt";
import { addonIdsFor, type Basket, type Selection } from "@/modules/entry/basket";
import type { ParticipantBody } from "@/modules/entry/details";
import { classifyEnterFailure, type ChainAfter } from "@/modules/entry/enter-failure";
import type { SterunClient, SterunRecord } from "@sterunxyz/sdk";

export interface EntryPlan {
  runner: string;
  summary: EventSummary;
  categoryId: number;
  basket: Basket;
  selection: Selection;
  body: ParticipantBody;
  total: bigint;
}

export interface EntryAttemptDeps {
  submit: typeof submitParticipant;
  confirm: typeof confirmParticipant;
  enter: SterunClient["enter"];
  recordsOf: (runner: string) => Promise<SterunRecord[]>;
  chainAfter: (plan: EntryPlan) => Promise<ChainAfter>;
  save: typeof saveEntry;
  markConfirmed: typeof markConfirmed;
  checkWindowMs: number;
  checkIntervalMs: number;
}

async function readChainAfter(plan: EntryPlan): Promise<ChainAfter> {
  const [event, categories, addOns, balance] = await Promise.all([
    readClient.getEvent(plan.summary.event.eventId),
    readClient.listCategories(plan.summary.event.eventId),
    readClient.listAddOns(plan.summary.event.eventId),
    readSusdBalance(plan.runner),
  ]);
  const reserved = new Set(addonIdsFor(plan.basket, plan.selection));
  const names = new Map<number, string>();
  for (const item of plan.basket.pack) for (const o of item.options) names.set(o.addonId, item.name);
  for (const extra of plan.basket.extras) names.set(extra.addonId, extra.name);
  return {
    status: event.status,
    slotsLeft: categories.find((c) => c.categoryId === plan.categoryId)?.slotsLeft ?? 0,
    soldOutAddOns: addOns.filter((a) => reserved.has(a.addonId) && a.unitsLeft === 0).map((a) => names.get(a.addonId) ?? a.code),
    balance,
    total: plan.total,
  };
}

const DEFAULTS: EntryAttemptDeps = {
  submit: submitParticipant,
  confirm: confirmParticipant,
  enter: (args, options) => readClient.enter(args, options),
  recordsOf: (runner) => readClient.recordsOfDetailed(runner),
  chainAfter: readChainAfter,
  save: saveEntry,
  markConfirmed,
  checkWindowMs: 30_000,
  checkIntervalMs: 3_000,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useEntryAttempt(plan: EntryPlan | null, overrides: Partial<EntryAttemptDeps> = {}) {
  const deps = { ...DEFAULTS, ...overrides };
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [state, dispatch] = useReducer(attemptReducer, INITIAL_ATTEMPT);
  const ran = useRef<AttemptState | null>(null);
  const queryClient = useQueryClient();

  const finish = useCallback(
    async (
      p: EntryPlan,
      submitted: Submitted,
      tokenId: number,
      txHash: string | null,
      via: "entered" | "found",
    ) => {
      const d = depsRef.current;
      const record = (await d.recordsOf(p.runner).catch(() => [])).find((r) => r.tokenId === tokenId);
      const category = p.summary.categories.find((c) => c.categoryId === p.categoryId);
      await d.save({
        eventId: p.summary.event.eventId,
        categoryId: p.categoryId,
        tokenId,
        bibNo: record?.bibNo ?? -1,
        bibName: p.body.bib_name,
        raceName: p.summary.event.name,
        startsAt: p.summary.event.startsAt.toString(),
        distanceCode: category?.code ?? "",
        participantHash: submitted.participantHash,
        salt: submitted.salt,
        totpSecret: submitted.totpSecret,
        txHash: txHash ?? "",
        runner: p.runner,
        enteredAt: new Date().toISOString(),
        confirmed: false,
        participantId: submitted.participantId,
      });
      // `entered` from paying, `found` from checking: the reducer accepts each
      // only in its own phase.
      dispatch({ type: via, tokenId });
      void queryClient.invalidateQueries({ queryKey: runnerRecordsKey(p.runner) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.one(p.summary.event.eventId) });
      void queryClient.invalidateQueries({ queryKey: susdKey(p.runner) });
      if (txHash) {
        d.confirm({ participantId: submitted.participantId, tokenId, txHash, address: p.runner, sign: signMessage })
          .then(() => d.markConfirmed(tokenId))
          .catch(() => {});
      }
    },
    [queryClient],
  );

  useEffect(() => {
    const step = nextStep(state);
    if (!plan || !step || ran.current === state) return;
    ran.current = state;
    const d = depsRef.current;

    if (step === "submit") {
      d.submit(plan.body, signMessage)
        .then((submitted) => dispatch({ type: "submitted", submitted }))
        .catch((error) =>
          dispatch({ type: "submit-failed", message: friendlyError(error), declined: isDeclined(error) }),
        );
    }

    if (step === "enter" && state.phase === "paying") {
      const { submitted } = state;
      d.enter(
        {
          runner: plan.runner,
          eventId: plan.summary.event.eventId,
          categoryId: plan.categoryId,
          addOnIds: addonIdsFor(plan.basket, plan.selection),
          participantHash: submitted.participantHash,
        },
        { publicKey: plan.runner, signTransaction },
      )
        .then((sent) => finish(plan, submitted, sent.value, sent.txHash, "entered"))
        .catch(async (error) => {
          const after = await d.chainAfter(plan).catch(() => null);
          dispatch({ type: "enter-failed", failure: classifyEnterFailure(error, after) });
        });
    }

    if (step === "check" && state.phase === "checking") {
      const { submitted } = state;
      void (async () => {
        const until = Date.now() + d.checkWindowMs;
        try {
          while (true) {
            const found = (await d.recordsOf(plan.runner)).find((r) => r.eventId === plan.summary.event.eventId);
            if (found) {
              await finish(plan, submitted, found.tokenId, null, "found");
              return;
            }
            if (Date.now() >= until) {
              dispatch({ type: "not-found" });
              return;
            }
            await sleep(d.checkIntervalMs);
          }
        } catch {
          dispatch({ type: "check-error" });
        }
      })();
    }
  }, [state, plan, finish]);

  return {
    state,
    start: () => dispatch({ type: "start" }),
    checkAgain: () => dispatch({ type: "check-again" }),
    detailsChanged: () => dispatch({ type: "details-changed" }),
    running: nextStep(state) !== null,
  };
}
```

`finish` with a `null` hash (found by the check) cannot confirm the vault row; the success page's mount retry covers it only when a hash exists, so an entry found by the check stays unconfirmed and is swept after STE-50. Note this in `fe/CLAUDE.md` (Task 13).

- [ ] **Step 4: Run, expect PASS.** Then `pnpm --filter fe typecheck`.

- [ ] **Step 5: Commit**

```bash
git add fe/src/hooks/useEntryAttempt.ts fe/test/useEntryAttempt.test.tsx
git commit -m "feat(fe): run Sign and pay against the vault, the wallet and the chain (STE-21)"
```

---

### Task 10: Step 1, the summary, the gate notices, the route

**Files:**
- Create: `fe/src/modules/entry/EntryFlow.tsx`, `component/StepDistance.tsx`, `component/EntrySummary.tsx`, `component/GateNotice.tsx`, `fe/app/(browse)/events/[eventId]/enter/page.tsx`
- Test: `fe/test/EntryFlow.test.tsx`

**Interfaces:**
- Consumes: `useEvent`, `useEventAddOns`, `useEventMetadata`, `useWallet`, `useRunnerRecords`, `entryGate`, `buildBasket`, `joinAddOns`, `Stepper`, `WalletGate`.
- Produces: `EntryFlow({ eventId, requestedCategory }: { eventId: number; requestedCategory: number | null })`; `StepDistance({ summary, basket, categoryId, selection, onCategory, onSelection, sizeErrors })`; `EntrySummary({ category, basket, selection, total })`; `GateNotice({ gate, summary })`.

UI per the mockup blocks 1 and 2:
- `StepDistance`: three shadcn `Card`s. **Distance**: `RadioGroup` of distances with price and places left; a full distance is a disabled item reading "Sold out". **Race pack** ("Comes with every entry."): each item a row; sized items a `ToggleGroup`-style `RadioGroup` of sizes, sold-out sizes disabled and `line-through`; unsized items a `Check` icon and "Included". **Add-ons** ("Optional extras, paid with your entry."): `Checkbox` rows with price and "{n} left"; absent when `basket.extras` is empty; a sold-out extra disabled.
- `EntrySummary`: shadcn `Card`, `Separator`, lines: distance and price, each pack item "Included", each chosen extra and price, **Total** via `formatPrice`.
- Layout: steps and summary in a `lg:grid-cols-[1fr_20rem]` grid; summary under the steps below `lg`.
- `GateNotice` sentences: closed "Entries for this race are closed." + link "Back to the race"; already-entered "You're already entered" + "{code} · Bib {bibNo}" + "Back to the race"; sold-out "This distance is sold out." + the other distances with places as links to `?category=`; no-distance "Every distance is full." Icons: `CircleOff`, `BadgeCheck`, `Ban`.
- `EntryFlow` keeps `step` (`"distance" | "details" | "pay"`), `categoryId`, `selection` (persisted to `sessionStorage` key `sterun.entry.<eventId>` inside try/catch; details are never persisted), `details`, `showMissing`. Continue on step 1 is refused with `missingPackSizes` errors under the item; switching distance resets `selection`.

- [ ] **Step 1: Write the failing test.** Mock pattern from `EventDetail.test.tsx` plus the wallet mock from `OrganiserHome.test.tsx`, with `restoreAddress` resolving `RUNNER`, and `readClient: { listAddOns, recordsOfDetailed }`. Cases:

```tsx
it("asks for a wallet first", ...)                                  // restoreAddress -> null, expect "Connect wallet"
it("shows closed for a race that is not Open", ...)                 // expect "Entries for this race are closed."
it("shows the existing entry instead of the form", ...)             // recordsOfDetailed -> [record(eventId 2, cat 0, bib 4)], expect "10K · Bib 4"
it("says a requested full distance is sold out and links the others", ...)
it("preselects the requested distance", ...)                        // ?category=1, expect radio 21K checked
it("does not let a sold-out distance be picked", ...)               // radio disabled
it("separates the race pack from the add-ons", ...)                 // headings "Race pack" and "Add-ons", jersey under race pack, towel under add-ons
it("hides the Add-ons card when nothing is for sale", ...)
it("refuses Continue until each sized item has a size", ...)        // click Continue, expect "Pick a size." alert, still on step 1
it("updates the total when an add-on is ticked", ...)               // expect "sUSD 25" then "sUSD 30"
it("keeps the distance and add-ons through a remount but not personal details", ...)
```

Write each with real assertions using `screen.findByRole` / `getByRole("radio", { name: /21K/ })` / `within(screen.getByRole("region", { name: "Race pack" }))`. Give each `Card` an `aria-labelledby` pointing at its title so `region` queries work.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement the four components and the route.** The route:

```tsx
import { notFound } from "next/navigation";

import { EntryFlow } from "@/modules/entry/EntryFlow";

export default async function EnterPage({ params, searchParams }: PageProps<"/events/[eventId]/enter">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();
  const { category } = await searchParams;
  const requested = typeof category === "string" && /^\d+$/.test(category) ? Number(category) : null;
  return <EntryFlow eventId={Number(eventId)} requestedCategory={requested} />;
}
```

Run `pnpm --filter fe typecheck` after adding the route so `next typegen` produces `PageProps<"/events/[eventId]/enter">`.

`EntryFlow` renders, in order: `WalletGate` → loading skeleton while `useEvent`/`useRunnerRecords` are pending → `ErrorNotice` with retry on failure → `GateNotice` unless `gate.kind === "open"` → heading "Enter {race name}", `Stepper` with `[{id:"distance",label:"Distance & race pack"},{id:"details",label:"Your details"},{id:"pay",label:"Review & pay"}]`, the current step, `EntrySummary`, and the Back/Continue row (`Button variant="secondary"` / `Button`).

- [ ] **Step 4: Run, expect PASS.** Then `pnpm --filter fe exec vitest run test/ui-rules.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/entry fe/app/(browse)/events/[eventId]/enter fe/test/EntryFlow.test.tsx
git commit -m "feat(fe): the enter page, its gates and step 1 (STE-21)"
```

---

### Task 11: Step 2, the phone field

**Files:**
- Create: `fe/src/modules/entry/component/PhoneField.tsx`, `component/StepRunner.tsx`
- Modify: `fe/src/modules/entry/EntryFlow.tsx`
- Test: `fe/test/PhoneField.test.tsx`, `fe/test/StepRunner.test.tsx`

**Interfaces:**
- Consumes: `RunnerDetails`, `ID_TYPES`, `BIB_NAME_MAX`, `missingRunnerDetails`, `impossibleRunnerDetails`, `focusField`; `Field`, `LabelRow`, `FieldMessage`, `DateTimeField` (`dateOnly`); `useArea`.
- Produces: `PhoneField({ id, label, value, onChange, defaultCountry, error, required })` where `value`/`onChange` are E.164 strings or `""`; `StepRunner({ details, onChange, errors })` with `errors: Record<string, string>`.

`PhoneField` is the shadcn-phone-input pattern: `react-phone-number-input`'s `PhoneInput` with `inputComponent` = shadcn `Input`, `countrySelectComponent` = a `Popover` + `Command` + `ScrollArea` list of countries with flags (`react-phone-number-input/flags`) and calling codes, `international`, `countryCallingCodeEditable={false}`, `defaultCountry`. Import `react-phone-number-input/style.css` is NOT used; style with tokens. The default country is `place.countryCode` when `place?.mode === "area"`, else `"ID"`.

`StepRunner` fields and ids (they match `details.ts` focus ids): Full name `runner-name`; ID type `Select` `runner-id-type`; ID number `runner-id-number`; Name on bib `runner-bib-name` with hint "Up to 16 characters." and a live `{n}/16` counter; Email `runner-email` `type="email"`; Phone `runner-phone`; Gender `RadioGroup` `runner-gender` (Female, Male); Date of birth `DateTimeField dateOnly id="runner-dob"`; section "Emergency contact" with Name `runner-emergency-name` and Phone `runner-emergency-phone`. Group with `Section`.

Errors shown: after Continue, `missingRunnerDetails`; always, `impossibleRunnerDetails`. Continue focuses the first missing field. Changing any detail after a vault submit calls `attempt.detailsChanged()` (wired in Task 12).

- [ ] **Step 1: Write the failing tests.**

`PhoneField.test.tsx`:

```tsx
it("emits E.164 as the number is typed", async () => {
  const onChange = vi.fn();
  render(<PhoneField id="p" label="Phone" value="" onChange={onChange} defaultCountry="ID" />);
  await userEvent.type(screen.getByLabelText("Phone"), "81234567890");
  expect(onChange).toHaveBeenLastCalledWith("+6281234567890");
});

it("strips a leading local zero rather than hashing a different number", async () => {
  const onChange = vi.fn();
  render(<PhoneField id="p" label="Phone" value="" onChange={onChange} defaultCountry="ID" />);
  await userEvent.type(screen.getByLabelText("Phone"), "081234567890");
  expect(onChange).toHaveBeenLastCalledWith("+6281234567890");
});

it("changes the calling code with the country picker", async () => {
  const onChange = vi.fn();
  render(<PhoneField id="p" label="Phone" value="" onChange={onChange} defaultCountry="ID" />);
  await userEvent.click(screen.getByRole("combobox", { name: /country/i }));
  await userEvent.type(screen.getByPlaceholderText("Search country"), "Singapore");
  await userEvent.click(screen.getByRole("option", { name: /Singapore/ }));
  await userEvent.type(screen.getByLabelText("Phone"), "81234567");
  expect(onChange).toHaveBeenLastCalledWith("+6581234567");
});
```

If the leading-zero case fails with the library as configured, keep the test and normalise in `onChange` (drop one leading `0` of the national part); a runner in Indonesia types the zero.

`StepRunner.test.tsx`: renders every label; shows no error before Continue; shows "A bib fits 16 characters at most." as soon as 17 characters are typed; the bib counter reads `4/16`; picking a date of birth after today shows "Check your date of birth."; the same number in both phones shows the emergency message. Drive it through a small harness component holding `useState(EMPTY_DETAILS)`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement both components and wire step 2 into `EntryFlow`.**
- [ ] **Step 4: Run, expect PASS**, plus `test/EntryFlow.test.tsx` and `test/ui-rules.test.ts`.
- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/entry fe/test/PhoneField.test.tsx fe/test/StepRunner.test.tsx
git commit -m "feat(fe): step 2, the runner's details with country-coded phones (STE-21)"
```

---

### Task 12: Step 3, the pay dialog, Get test sUSD

**Files:**
- Create: `component/StepPay.tsx`, `component/PayDialog.tsx`, `component/GetTestSusd.tsx`
- Modify: `fe/src/modules/entry/EntryFlow.tsx`, `fe/src/components/layouts/WalletButton.tsx`
- Test: `fe/test/StepPay.test.tsx`, `fe/test/PayDialog.test.tsx`, `fe/test/GetTestSusd.test.tsx`, `fe/test/WalletButton.test.tsx` (append)

**Interfaces:**
- Consumes: `useEntryAttempt`, `useSusdBalance`, `shortfall`, `NonRefundableNotice`, `addSusdTrustline`, `requestTestSusd`, `IS_TESTNET`, `useRouter`.
- Produces: `StepPay({ summary, category, basket, selection, details, total, onEdit(step) })`; `PayDialog({ attempt, total, onDone })`; `GetTestSusd({ address, onFunded, variant?: "inline" | "menu" })`.

`StepPay` (mockup block 3): review cards for distance/race pack/add-ons and for details, each with an **Edit** `Button variant="link"` to its step; the ID number shown with all but the last 4 digits masked; the total; a shortfall `Alert`-style block when `shortfall(balance, total) > 0n`: "You need {formatPrice(needed)} more to enter." with `GetTestSusd` inline when `IS_TESTNET`; then `NonRefundableNotice` directly above **Sign and pay**. The button is disabled only while the balance is loading or short; free entries never check the balance.

`PayDialog` (mockup block 4), modelled on `RunDialog`: `Dialog` that cannot be closed while `attempt.running` (`onOpenChange`, `onInteractOutside`, `onEscapeKeyDown`). Title "Your wallet will ask you twice". Two rows with lucide `ShieldCheck` / `CreditCard`: **Confirm it's you** ("Free. Proves this wallet is yours.") and **Pay and enter** ("{total}"). Row states: `Check` + "Done", `Loader2 animate-spin` + "Check your wallet", or pending. Failure block per state:

| state | heading | body | button |
| --- | --- | --- | --- |
| failed / declined | "Nothing was charged." | "You declined in your wallet." | **Try again** → `start` |
| failed / short | "You need {needed} sUSD to enter." | — | `GetTestSusd`, then **Try again** |
| failed / sold-out | "This distance just sold out." | — | **Choose another distance** → close, step 1 |
| failed / add-on-sold-out | "{names} just sold out." | — | **Change your race pack** → close, step 1 |
| failed / closed | "Entries for this race have closed." | — | **Back to the race** → `/events/[id]` |
| failed / other, submit-failed | "Your entry didn't go through" | the message | **Try again** |
| checking | "Checking whether your entry went through…" | — | none, spinner |
| not-through | "Your entry didn't go through" | "Nothing was charged. Your details are still here, so you can try again." | **Try again** |
| check-failed | "We couldn't check your entry" | "Your internet connection dropped. Before paying again, reconnect and tap Check again, so you are not charged twice." | **Check again** → `checkAgain` |

On `entered`, `onDone(tokenId)` runs `router.push(/events/[id]/entered/[tokenId])` and clears the `sessionStorage` selection.

The ellipsis in "Checking whether your entry went through…" is a Unicode ellipsis, not a dash; `ui-rules.test.ts` allows it.

`GetTestSusd`: renders nothing unless `IS_TESTNET`. Button **Get test sUSD** (lucide `Coins`). Click: read balance; `no-account`/`no-trustline` → `addSusdTrustline(address, signTransaction)`; then `requestTestSusd(address, signMessage)`; then invalidate `susdKey` and call `onFunded`. Messages: sent → "Test sUSD added."; rate-limited → "You already got test sUSD today. Try again tomorrow."; empty → "Test sUSD has run out. Tell the Sterun team."; unavailable → "Test sUSD is not available yet."; thrown → `friendlyError`. In `WalletButton`'s menu it sits above Disconnect with the balance line "Balance: {formatAmount} sUSD".

- [ ] **Step 1: Write the failing tests.** `PayDialog.test.tsx` renders `PayDialog` with a fake `attempt` object per row of the table above (`it.each` over states) and asserts heading, body and button name; plus: Escape does not close while `running: true`; clicking **Try again** calls `start`; clicking **Check again** calls `checkAgain`; `entered` calls `onDone(7)`. `StepPay.test.tsx`: the notice is the element immediately before the Sign and pay button (`button.previousElementSibling` has `role="note"`); ID number masked to `••••••••••••0001`; shortfall block shown for `{kind:"balance",stroops:0n}` and a paid total, absent for a free entry; each Edit calls `onEdit` with its step. `GetTestSusd.test.tsx`: opens a trustline only when missing; each faucet result's sentence; renders nothing when `IS_TESTNET` is mocked false (`vi.mock("@/lib/env", async (o) => ({ ...(await o()), IS_TESTNET: false }))`). `WalletButton.test.tsx`: the menu shows Get test sUSD.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, wire step 3 into `EntryFlow` (build `EntryPlan` from state; `useEntryAttempt(plan)`; editing details calls `detailsChanged`).
- [ ] **Step 4: Run, expect PASS**, plus `EntryFlow`, `ui-rules`.
- [ ] **Step 5: Commit**

```bash
git add fe/src/modules/entry fe/src/components/layouts/WalletButton.tsx fe/test/StepPay.test.tsx fe/test/PayDialog.test.tsx fe/test/GetTestSusd.test.tsx fe/test/WalletButton.test.tsx
git commit -m "feat(fe): review, Sign and pay, and test sUSD (STE-21)"
```

---

### Task 13: The success page, bib and receipt

**Files:**
- Create: `fe/src/modules/entry/receipt.ts`, `receipt-pdf.ts`, `EnteredPage.tsx`, `component/Bib.tsx`, `component/ReceiptBox.tsx`, `fe/app/(browse)/events/[eventId]/entered/[tokenId]/page.tsx`
- Modify: `fe/CLAUDE.md`, `docs/WEB_APP_IA.md` (the two new URLs)
- Test: `fe/test/receipt.test.ts`, `fe/test/EnteredPage.test.tsx`

**Interfaces:**
- Consumes: `readEntry`, `markConfirmed`, `confirmParticipant`, `fireConfetti`, `useEvent`, `readClient.recordOf`, `EXPLORER_BASE`, `formatEventDate`.
- Produces:

```ts
export interface ReceiptLine { label: string; value: string }
export function receiptLines(entry: StoredEntry, explorerBase: string): ReceiptLine[]
export function maskCode(salt: string): string
export function downloadReceipt(entry: StoredEntry): Promise<void>
```

- [ ] **Step 1: Write the failing pure test** `fe/test/receipt.test.ts`

```ts
import { describe, expect, it } from "vitest";

import type { StoredEntry } from "@/lib/entry-store";
import { maskCode, receiptLines } from "@/modules/entry/receipt";

const entry: StoredEntry = {
  eventId: 1, categoryId: 0, tokenId: 42, bibNo: 0, bibName: "SARI", raceName: "Jogja 10K",
  startsAt: "1790548200", distanceCode: "10K", participantHash: "a".repeat(64), salt: "0123456789abcdef".repeat(4),
  totpSecret: "c".repeat(64), txHash: "d".repeat(64), runner: "GABC", enteredAt: "2026-09-15T01:00:00.000Z",
  confirmed: true,
};

describe("receiptLines", () => {
  const lines = receiptLines(entry, "https://stellar.expert/explorer/testnet");
  const labels = lines.map((l) => l.label);

  it("carries everything needed to prove the record", () => {
    expect(labels).toEqual([
      "Race", "Race date", "Distance", "Bib number", "Name on bib", "Record number",
      "Wallet", "Participant fingerprint", "Receipt code", "Payment", "Entered on",
    ]);
    expect(lines.find((l) => l.label === "Payment")?.value).toBe(
      `https://stellar.expert/explorer/testnet/tx/${"d".repeat(64)}`,
    );
  });

  it("carries no secret for check-in and no personal detail", () => {
    const text = JSON.stringify(lines);
    expect(text).not.toContain("c".repeat(64));
    expect(labels.join(" ")).not.toMatch(/name\b(?! on bib)|identity|email|phone/i);
  });

  it("omits the payment link when the entry was found without one", () => {
    expect(receiptLines({ ...entry, txHash: "" }, "x").some((l) => l.label === "Payment")).toBe(false);
  });
});

describe("maskCode", () => {
  it("shows the first and last eight characters", () => {
    expect(maskCode("0123456789abcdef".repeat(4))).toBe("01234567 •••• •••• 89abcdef");
  });
});
```

"Participant fingerprint" is the on-screen word for `participant_hash` (no "hash" in UI).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `receipt.ts`**

```ts
/**
 * What the receipt says. Pure, so a test can prove what it leaves out.
 *
 * It carries the receipt code (the salt), because with the runner's own ID
 * details that code recomputes the fingerprint on the record, which is the
 * proof the record is theirs. It carries no name, identity number, email or
 * phone, so a leaked receipt leaks nothing personal, and never the check-in
 * secret, which would let anyone show this runner's pass.
 */
import type { StoredEntry } from "@/lib/entry-store";
import { formatEventDate } from "@/utils/format";

export interface ReceiptLine {
  label: string;
  value: string;
}

export function receiptLines(entry: StoredEntry, explorerBase: string): ReceiptLine[] {
  const lines: ReceiptLine[] = [
    { label: "Race", value: entry.raceName },
    { label: "Race date", value: formatEventDate(BigInt(entry.startsAt)) },
    { label: "Distance", value: entry.distanceCode },
    { label: "Bib number", value: String(entry.bibNo) },
    { label: "Name on bib", value: entry.bibName },
    { label: "Record number", value: String(entry.tokenId) },
    { label: "Wallet", value: entry.runner },
    { label: "Participant fingerprint", value: entry.participantHash },
    { label: "Receipt code", value: entry.salt },
  ];
  if (entry.txHash && explorerBase) {
    lines.push({ label: "Payment", value: `${explorerBase}/tx/${entry.txHash}` });
  }
  lines.push({ label: "Entered on", value: new Date(entry.enteredAt).toUTCString() });
  return lines;
}

export function maskCode(salt: string): string {
  return `${salt.slice(0, 8)} •••• •••• ${salt.slice(-8)}`;
}
```

`receipt-pdf.ts`: dynamic `import("jspdf")`; A5 portrait; the lockup drawn by loading `/brand/logo/sterun-lockup-black.svg` into an `Image`, painting it on a canvas, and `addImage` of the PNG data URL (skipped silently if that fails, with "STERUN" text instead); title "Entry receipt", "Issued {date}"; each line as a small grey label over its value in a monospace face for hex values, wrapped with `splitTextToSize`; footer "Keep this receipt. Together with your ID details, it proves this race record is yours."; saved as `sterun-receipt-{raceName slug}-{tokenId}.pdf`. Colours are passed as RGB read from the CSS custom properties at runtime (`getComputedStyle`), with black as the fallback, so no hex lands in the file.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Write the failing page test** `fe/test/EnteredPage.test.tsx` (mock `@/lib/sterun` with `recordOf`, `@/lib/events` `getEventSummary`, `@/lib/entry-store` `readEntry`, `canvas-confetti`, `@/modules/entry/receipt-pdf`):

```tsx
it("shows the bib from chain and the bib name from this device", ...)       // "0", "SARI", "10K" twice (both tabs), race name in the band
it("fires the wizard's confetti once", ...)                                  // confetti mock called after mount
it("masks the receipt code and reveals it on Show", ...)
it("downloads the receipt", ...)                                             // click Download receipt -> downloadReceipt called with the entry
it("copies the code", ...)                                                   // navigator.clipboard.writeText mocked
it("keeps the way on disabled until the receipt is saved", ...)             // "Back to the race" disabled, tick "I've saved my receipt", enabled
it("says the receipt is on the device that entered when this one has none", ...) // readEntry -> undefined; expect that sentence, bib number still shown, no Download button
it("shows not found for a record from another race", ...)                   // recordOf -> eventId 9 for route eventId 1
it("retries confirming an unconfirmed entry once", ...)                     // entry.confirmed false with participantId and txHash -> confirmParticipant called once
```

`Bib` renders with `aria-label="Bib {bibNo}"` so the bib reads as one thing to a screen reader.

- [ ] **Step 6: Run, expect FAIL.**

- [ ] **Step 7: Implement** `Bib`, `ReceiptBox`, `EnteredPage` and the route, per mockup block 5:
- `Bib`: a landscape `div` with `aspect-[3/2] max-w-md`, `rounded-lg border bg-paper shadow-card`; four pin holes as `size-2.5 rounded-full bg-n-200` absolutely placed in the corners; top band `bg-ink text-paper` with the race name centred (`heading-strong`, truncate); the number in `text-bib` (Big Shoulders token); the bib name under it; `10K` on teal tabs (`bg-teal-500 text-paper`) vertically centred on the left and right edges; bottom band `bg-teal-100` with `sterun-logo-black.svg` via `next/image`. No date, no race pack.
- `ReceiptBox`: `Card` with the sentence, a `code` element showing `maskCode` or the full salt with a **Show**/**Hide** `Button variant="link"`, **Download receipt** (`Download` icon), **Copy code** (`Copy` icon, "Copied" for 2 s).
- `EnteredPage`: reads `recordOf(tokenId)` (not found if `eventId` differs), `useEvent(eventId)`, `readEntry(tokenId)`; heading "You're in!" with race and date; `Bib`; `ReceiptBox` or the other-device sentence "Your receipt is on the device you entered with."; `Checkbox` "I've saved my receipt" gating **Back to the race** (`Button asChild` + `Link`, `aria-disabled` and `pointer-events-none` until ticked). `fireConfetti` in a `useEffect` behind a `fired` ref.
- Route file mirrors the enter route, validating both params as digits.

- [ ] **Step 8: Run, expect PASS**, plus `ui-rules`.

- [ ] **Step 9: Document.** In `fe/CLAUDE.md` add a section `### /events/[id]/enter — the entry flow (STE-21 round 1)` covering: the three steps; details first then payment and why; a retry never resends details; no answer becomes a check and why `enter` being atomic makes "Nothing was charged" true; `enter` failures explained by re-reading the chain, not the code (and `OUR_OWN_METHODS` still excludes `enter`); personal details never persisted, the selection is in `sessionStorage`; the stored entry in IndexedDB and what it holds; the receipt carries no PII and no TOTP secret; an entry found by the check has no transaction hash, so its vault row stays unconfirmed (STE-50 sweeps it); Get test sUSD is testnet only and waits on STE-49's route; `@stellar/stellar-sdk` is now a runtime dependency. Update "Where things stand" lines referencing STE-21. Add the two URLs to `docs/WEB_APP_IA.md`'s page map.

- [ ] **Step 10: Commit**

```bash
git add fe/src/modules/entry fe/app/(browse)/events/[eventId]/entered fe/test/receipt.test.ts fe/test/EnteredPage.test.tsx fe/CLAUDE.md docs/WEB_APP_IA.md
git commit -m "feat(fe): the success page, the bib and the receipt (STE-21)"
```

---

### Task 14: Link the race page, live testnet run, browser check

**Files:**
- Modify: `fe/src/modules/event-detail/component/TabCategories.tsx` only if its `href` differs from `/events/${eventId}/enter?category=${categoryId}` (it already matches; verify)
- Create: `fe/test/e2e/entry.e2e.test.ts`
- Modify: `docs/deployments.md` (evidence)

- [ ] **Step 1: Ask Ancung to run the full fe suite** (`pnpm --filter fe test`), then `pnpm --filter fe lint` and `pnpm --filter fe typecheck`. All green before going live.

- [ ] **Step 2: Live e2e (opt-in, node environment).** `fe/test/e2e/entry.e2e.test.ts` with `// @vitest-environment node`, skipped unless `STERUN_E2E=1`. With a keypair funded by friendbot and trustlined (reuse `addSusdTrustline` with a keypair signer), and `pnpm faucet` sUSD if STE-49 is not live: call `submitParticipant` with a keypair `MessageSigner` (`Buffer.from(kp.sign(Buffer.from(nonce))).toString("base64")`), `readClient.enter` for a **free** distance, assert `recordsOfDetailed` contains the token with the submitted hash, `confirmParticipant`, and `readClient.verify(tokenId, hash) === true`. Repeat for a **paid** distance with one add-on, asserting the organiser's sUSD balance rose by exactly the total. Negative: a second `enter` attempt is stopped by `entryGate` returning `already-entered` for that wallet. The races come from a throwaway event created by the organiser test account, or an existing Open testnet race; ask Ancung which.

Run: `STERUN_E2E=1 pnpm --filter fe exec vitest run test/e2e/entry.e2e.test.ts`

- [ ] **Step 3: Browser check.** With `pnpm --filter fe dev` running (Ancung's), open an Open race through Playwright MCP, enter with a real wallet on a free race and a paid race, screenshot every step, every failure state reachable by hand (decline each prompt; a short balance), and the success page at **1440 by 900** and **390 by 844**. Save screenshots in the scratchpad and show them to Ancung. Fix what the screenshots show before the evidence step.

- [ ] **Step 4: Evidence.** Append to `docs/deployments.md` under a STE-21 heading: date, network, the event and token ids, both `enter` transaction links on stellar.expert, and the asserted balance difference.

- [ ] **Step 5: Commit**

```bash
git add fe/test/e2e/entry.e2e.test.ts docs/deployments.md
git commit -m "test(fe): enter a free and a paid race on testnet, end to end (STE-21)"
```

Then tell Ancung it is ready to push and open a PR; do not push until told.

---

## Self-review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| Building rules (shadcn, lucide, confetti reused) | Global Constraints, 1, 13 |
| Decision 1, one wallet one entry | 6 (gate), 14 (negative e2e); identity layer is STE-51 |
| Decision 2, three steps and a separate success page | 10, 11, 12, 13 |
| Decision 3, one button, two approvals in a dialog | 8, 9, 12 |
| Decision 4, submit then pay | 8, 9 |
| Decision 5, receipt gated by "I've saved my receipt" | 13 |
| Decision 6, test sUSD in the menu and at pay | 5, 12 |
| Decision 7, store what round 2 reads | 4, 9 |
| Before the form table | 6, 10 |
| Step 1 cards and summary | 2, 10 |
| Step 2 fields, E.164, default country, DOB picker, error timing | 3, 11 |
| Step 3, edit links, notice above the button, details not kept on refresh | 10 (sessionStorage selection only), 12 |
| Sign and pay dialog and confirm retried in background | 9, 12, 13 (mount retry) |
| Failure table and no-answer check | 7, 8, 9, 12 |
| `enter` error disambiguation | 7 |
| Success page contents and bib drawing | 13 |
| Receipt file contents | 13 |
| Stored entry fields | 4 (adds `txHash`, `runner`, `distanceCode`, `confirmed`, `participantId`, which the receipt and the retry need) |
| Test sUSD flow, testnet only | 5, 12 |
| Testing: pure, components, live, browser sizes | every task, 14 |

**Known dependency:** STE-49's route path is assumed as `POST /faucet`; Task 5 marks it for confirmation, and a 404 degrades to "Test sUSD is not available yet." instead of breaking the pay step.

**Type consistency checked:** `Submitted` (4) used by 8, 9; `EnterFailure` (7) used by 8, 9, 12; `Basket`/`Selection` (2) used by 9, 10, 12; `StoredEntry` (4) used by 9, 13; `SusdBalance`/`shortfall` (5) used by 7, 12; `susdKey` (5), `runnerRecordsKey` (6), `eventKeys` (existing) invalidated in 9; `EntryPlan` (9) built in 12. Task 9's `finish` dispatches `entered` from `paying` and `found` from `checking`, matching the reducer in 8.
