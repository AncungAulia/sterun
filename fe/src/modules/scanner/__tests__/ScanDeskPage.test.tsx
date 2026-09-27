/**
 * The desk, end to end on one phone: a roster in IndexedDB (fake-indexeddb, so
 * the real store runs), a real verdict computed from the frozen vectors, and
 * only the camera and the clock check mocked, since jsdom has neither.
 *
 * The scenario the ticket asks a third party to run is here in miniature:
 * scan (HAND OVER), scan the same pass again (ALREADY CLAIMED), show an old
 * screenshot (CODE EXPIRED), and type a code when the camera will not work.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraState } from "@/modules/scanner/hooks/useCamera";
import type { ScannedCode } from "@/modules/scanner/lib/payload";

const cameraState = vi.hoisted(() => ({ current: "running" as CameraState }));
vi.mock("@/modules/scanner/hooks/useCamera", () => ({
  useCamera: () => ({ videoRef: { current: null }, state: cameraState.current }),
}));

const reader = vi.hoisted(() => ({ onRead: null as ((scanned: ScannedCode) => void) | null }));
vi.mock("@/modules/scanner/hooks/useQrReader", () => ({
  useQrReader: ({ onRead }: { onRead: (scanned: ScannedCode) => void }) => {
    reader.onRead = onRead;
    return { state: "ready", engine: "jsqr" };
  },
}));

const measureDrift = vi.hoisted(() => vi.fn());
vi.mock("@/modules/scanner/lib/clock", () => ({ measureDrift }));

import { ScanDeskPage } from "@/modules/scanner/ScanDeskPage";
import { listClaims, saveRoster, type StoredRoster } from "@/modules/scanner/lib/scanner-store";

// tp-01 / vf-01, vf-04: one secret, a current code and one two steps old.
const SECRET = "9c1f0a7d4e2b63859f0d17c4a6e28b30d5f74196ac30e5b82f6d1904c7ba3e58";
const NOW_S = 1_772_100_000;
const STEP = 59_070_000;

let eventId = 500;

function rosterFor(id: number, driftSeconds = 0): StoredRoster {
  return {
    eventId: id,
    raceName: "Sasando Run 2026",
    categories: [{ categoryId: 0, code: "10K" }],
    snapshotLedger: 4_469_811,
    generatedAt: new Date(NOW_S * 1000).toISOString(),
    downloadedAt: new Date(NOW_S * 1000).toISOString(),
    driftSeconds,
    totp: { digits: 6, stepSeconds: 30, toleranceSteps: 1 },
    entries: [
      {
        tokenId: 1,
        bibNo: 128,
        categoryId: 0,
        state: "Entered",
        nameFragment: "Budi S.",
        addOns: [],
        totpSecret: SECRET,
      },
    ],
  };
}

function renderDesk(id: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ScanDeskPage eventId={id} />, { wrapper });
}

async function scan(scanned: ScannedCode) {
  await waitFor(() => expect(reader.onRead).not.toBeNull());
  await act(async () => reader.onRead!(scanned));
}

const vibrate = vi.fn();

beforeEach(() => {
  eventId += 1;
  cameraState.current = "running";
  reader.onRead = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_S * 1000);
  measureDrift.mockImplementation(async (stored: number) => ({ driftSeconds: stored, source: "stored" }));
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
  vibrate.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a phone with no roster for this race", () => {
  it("sends the volunteer back to download one", async () => {
    renderDesk(eventId);
    expect(await screen.findByRole("heading", { name: "No roster on this phone" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pick a race" })).toHaveAttribute("href", "/scan");
  });
});

describe("scanning", () => {
  it("hands over for a current code, records the claim first, then refuses the same pass", async () => {
    await saveRoster(rosterFor(eventId));
    renderDesk(eventId);
    expect(await screen.findByText("0 queued")).toBeInTheDocument();

    await scan({ tokenId: 1, step: STEP, code: "911070" });

    const handOver = await screen.findByRole("status", { name: "Hand over" });
    expect(handOver).toHaveTextContent("128");
    expect(handOver).toHaveTextContent("Budi S.");
    expect(await listClaims(eventId)).toEqual([
      expect.objectContaining({ tokenId: 1, bibNo: 128, status: "waiting" }),
    ]);
    expect(vibrate).toHaveBeenLastCalledWith([120]);
    expect(await screen.findByText("1 claim waiting to send")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next runner" }));
    expect(await screen.findByText("1 queued")).toBeInTheDocument();

    await scan({ tokenId: 1, step: STEP, code: "911070" });
    const claimed = await screen.findByRole("alert", { name: "Already claimed" });
    expect(claimed).toHaveTextContent("at this desk");
    expect(vibrate).toHaveBeenLastCalledWith([90, 70, 90]);
    expect(await listClaims(eventId)).toHaveLength(1);
  });

  it("refuses a screenshot two steps old, and records nothing", async () => {
    await saveRoster(rosterFor(eventId));
    renderDesk(eventId);
    await screen.findByText("0 queued");

    await scan({ tokenId: 1, step: STEP - 2, code: "943926" });

    expect(await screen.findByRole("alert", { name: "Code expired" })).toBeInTheDocument();
    expect(await listClaims(eventId)).toEqual([]);
  });

  it("says a pass from another race is not on this roster", async () => {
    await saveRoster(rosterFor(eventId));
    renderDesk(eventId);
    await screen.findByText("0 queued");

    await scan({ tokenId: 99, step: STEP, code: "911070" });
    expect(await screen.findByRole("alert", { name: "Not on roster" })).toBeInTheDocument();
  });

  it("opens the typing sheet from an expired code, and hands over from what is typed", async () => {
    await saveRoster(rosterFor(eventId));
    renderDesk(eventId);
    await screen.findByText("0 queued");

    await scan({ tokenId: 1, step: STEP - 2, code: "943926" });
    await userEvent.click(await screen.findByRole("button", { name: "Type the code instead" }));

    await userEvent.type(screen.getByLabelText("Six-digit code"), "911070");
    await userEvent.type(screen.getByLabelText("Bib number"), "128");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByRole("status", { name: "Hand over" })).toBeInTheDocument();
  });
});

describe("when the camera will not work", () => {
  it("opens on typing, says why, and still reaches a verdict", async () => {
    cameraState.current = "denied";
    await saveRoster(rosterFor(eventId));
    renderDesk(eventId);

    expect(await screen.findByText(/camera is not allowed for this site/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to camera" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Six-digit code"), "000000");
    await userEvent.type(screen.getByLabelText("Bib number"), "128");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByRole("alert", { name: "Code expired" })).toBeInTheDocument();
  });
});

describe("the clock", () => {
  it("warns when this phone is further off than the codes allow", async () => {
    await saveRoster(rosterFor(eventId, 240));
    renderDesk(eventId);

    expect(await screen.findByText("This phone's clock is 4 minutes fast")).toBeInTheDocument();
  });

  it("stays quiet inside the tolerance", async () => {
    await saveRoster(rosterFor(eventId, 20));
    renderDesk(eventId);

    await screen.findByText("0 queued");
    expect(screen.queryByText(/This phone's clock is/)).not.toBeInTheDocument();
  });

  it("clears once a check finds the clock fixed", async () => {
    await saveRoster(rosterFor(eventId, 240));
    renderDesk(eventId);
    await screen.findByText("This phone's clock is 4 minutes fast");

    measureDrift.mockResolvedValue({ driftSeconds: 1, source: "server" });
    await userEvent.click(screen.getByRole("button", { name: "I fixed it, check again" }));

    await waitFor(() => expect(screen.queryByText(/This phone's clock is/)).not.toBeInTheDocument());
  });

  it("takes the volunteer's word when nothing can prove the clock either way", async () => {
    await saveRoster(rosterFor(eventId, 240));
    renderDesk(eventId);
    await screen.findByText("This phone's clock is 4 minutes fast");

    await userEvent.click(screen.getByRole("button", { name: "I fixed it, check again" }));

    await waitFor(() => expect(screen.queryByText(/This phone's clock is/)).not.toBeInTheDocument());
  });
});
