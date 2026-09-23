import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenPass } from "@/modules/pass/OpenPass";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const latestEntry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/entry-store", () => ({ latestEntry }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OpenPass, where the installed app starts", () => {
  it("opens the pass this phone holds", async () => {
    latestEntry.mockResolvedValue({ tokenId: 31 });

    render(<OpenPass />);

    // `replace`: Back from the pass leaves the app rather than bouncing here.
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/pass/31"));
  });

  it("offers the way to the entry first, on a phone that holds no pass", async () => {
    // A runner who entered on a laptop, or whose installed copy keeps storage
    // of its own, has an entry and no pass. The profile lists it.
    latestEntry.mockResolvedValue(undefined);

    render(<OpenPass />);

    expect(await screen.findByText("No pass on this phone")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find my entries" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: "Browse races" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Race pack desk" })).toHaveAttribute("href", "/scan");
    expect(replace).not.toHaveBeenCalled();
  });

  it("says the same when the browser will not open its storage at all", async () => {
    // Private mode, or a browser with IndexedDB switched off. A dead end here
    // is a home screen icon that opens nothing.
    latestEntry.mockRejectedValue(new Error("no storage"));

    render(<OpenPass />);

    expect(await screen.findByText("No pass on this phone")).toBeInTheDocument();
  });

  it("shows a loading state rather than the empty answer while it looks", () => {
    latestEntry.mockReturnValue(new Promise(() => {}));

    render(<OpenPass />);

    expect(screen.getByRole("status", { name: "Opening your pass" })).toBeInTheDocument();
    expect(screen.queryByText("No pass on this phone")).not.toBeInTheDocument();
  });
});
