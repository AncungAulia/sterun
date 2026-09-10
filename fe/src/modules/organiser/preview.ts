/**
 * The race as its event page will read it, built before any of it exists.
 *
 * The review step draws `EventView`, the component the public page draws, so
 * it needs the inputs that page gets from the chain and from the fetched
 * document. This makes them out of the wizard's own state:
 *
 * - The document is the exact text that will be published, read through
 *   `readEventDocument`, which is the parser the page runs after its hash
 *   check. Whatever the page would ignore is ignored here too, so the organiser
 *   is shown what runners get rather than what the form happened to collect.
 * - The event, its distances and its add-ons are what the run will write, in
 *   the shape the SDK will hand them back: nothing entered, nothing reserved,
 *   and `Open`, because opening entries is the run's last signature and the
 *   page after it is the one runners meet.
 *
 * Pure, and outside the component, for the same reason as `run.ts`: this is
 * the part that has to agree with what gets signed. Distances are converted
 * the way `useEventRun` converts them, and add-ons come from the same
 * `addOnUnits`, so a preview cannot show a stock or a price the run would not
 * write.
 */
import type { SterunAddOn, SterunCategory, SterunEvent } from "@sterun/sdk";

import { readEventDocument, type EventMetadata } from "@/lib/metadata";
import { parseStroops } from "@/utils/format";

import { addOnUnits, type PlannedAddOn } from "./addons";
import type { PlannedCategory } from "./component/StepCategoryPlan";

export interface EventPreview {
  event: SterunEvent;
  categories: SterunCategory[];
  addOns: SterunAddOn[];
  document: EventMetadata;
}

export interface EventPreviewInput {
  name: string;
  /** The connected wallet, which is who `create_event` will record. */
  organiser: string;
  startsAt: bigint | null;
  hash: string;
  plan: PlannedCategory[];
  addOns: PlannedAddOn[];
  documentText: string;
}

/**
 * There is no id before `create_event` lands. Nothing a preview draws follows
 * a link that would use it, so any number would do, and zero is the honest one
 * for "not yet".
 */
const NO_ID_YET = 0;

/** Null until there is a document to read, which needs a date and a start. */
export function previewEvent({
  name,
  organiser,
  startsAt,
  hash,
  plan,
  addOns,
  documentText,
}: EventPreviewInput): EventPreview | null {
  if (startsAt === null || !documentText) return null;

  const document = readEventDocument(documentText);
  if (typeof document === "string") return null;

  const categories = plan
    .filter((category) => category.code.trim())
    .map((category, index): SterunCategory => {
      const quota = Number(category.quota);
      return {
        eventId: NO_ID_YET,
        categoryId: index,
        code: category.code.trim(),
        distanceM: Math.round(Number(category.km) * 1000),
        quota,
        enteredCount: 0,
        priceStroops: parseStroops(category.price || "0"),
        slotsLeft: quota,
      };
    });

  const units = addOnUnits(addOns).map((unit, index): SterunAddOn => {
    const quota = Number(unit.stock);
    return {
      eventId: NO_ID_YET,
      addonId: index,
      code: unit.code,
      priceStroops: parseStroops(unit.price || "0"),
      quota,
      reservedCount: 0,
      unitsLeft: quota,
    };
  });

  return {
    event: {
      eventId: NO_ID_YET,
      organiser,
      name: name.trim(),
      metadataHash: hash,
      uri: "",
      startsAt,
      status: "Open",
    },
    categories,
    addOns: units,
    document,
  };
}
