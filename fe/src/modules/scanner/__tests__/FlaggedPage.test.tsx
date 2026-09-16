import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FlaggedPage, listForOrganiser, refusalLine } from "@/modules/scanner/FlaggedPage";
import { enqueueClaim, markClaim, type QueuedClaim } from "@/modules/scanner/lib/scanner-store";

let eventId = 950;

const scannedAt = new Date(2026, 8, 27, 9, 43).toISOString();
const collected = String(Math.floor(new Date(2026, 8, 27, 9, 41).getTime() / 1000));

function row(overrides: Partial<QueuedClaim>): QueuedClaim {
  return { tokenId: 1, bibNo: 128, eventId, scannedAt, status: "refused", ...overrides };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<FlaggedPage eventId={eventId} />, { wrapper });
}

beforeEach(() => {
  eventId += 1;
});

describe("the words", () => {
  it("says when the pack was collected elsewhere, when the chain said", () => {
    expect(refusalLine(row({ reason: "already-claimed", claimedAt: collected }))).toBe(
      "Already collected elsewhere at 09:41",
    );
    expect(refusalLine(row({ reason: "already-claimed" }))).toBe("Already collected elsewhere");
    expect(refusalLine(row({ reason: "not-found" }))).toBe("Not an entry in this race");
  });

  it("copies as plain lines an organiser can read in a chat", () => {
    expect(
      listForOrganiser("Sasando Run 2026", [
        row({ bibNo: 128, reason: "already-claimed", claimedAt: collected }),
        row({ bibNo: 204, reason: "not-found" }),
      ]),
    ).toBe(
      [
        "Refused claims for Sasando Run 2026",
        "Bib 128: Already collected elsewhere at 09:41. Handed over at this desk at 09:43.",
        "Bib 204: Not an entry in this race. Handed over at this desk at 09:43.",
      ].join("\n"),
    );
  });
});

describe("FlaggedPage", () => {
  it("lists only the refused claims, and warns a second pack may have gone out", async () => {
    await enqueueClaim(row({ tokenId: 9501, bibNo: 128, status: "waiting" }));
    await enqueueClaim(row({ tokenId: 9502, bibNo: 133, status: "waiting" }));
    await markClaim(9501, { status: "refused", reason: "already-claimed", claimedAt: collected });
    await markClaim(9502, { status: "sent", ledger: 5 });

    renderPage();

    expect(await screen.findByRole("heading", { name: "1 refused" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Refused claims" })).toHaveTextContent("Bib 128");
    expect(screen.queryByText("Bib 133")).not.toBeInTheDocument();
    expect(screen.getByText(/a second race pack may have gone out/)).toBeInTheDocument();
  });

  it("copies the list, and says so", async () => {
    await enqueueClaim(row({ tokenId: 9511, status: "refused", reason: "already-claimed" }));
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Copy list for the organiser" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Bib 128: Already collected elsewhere."));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("offers a screenshot when the browser will not copy", async () => {
    await enqueueClaim(row({ tokenId: 9521, status: "refused", reason: "not-found" }));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Copy list for the organiser" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Take a screenshot of this list instead.");
    expect(screen.queryByText(/a second race pack may have gone out/)).not.toBeInTheDocument();
  });

  it("says nothing was refused when nothing was", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Nothing refused" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
