/**
 * The burst both success screens fire: the wizard's Done step and, from
 * STE-21, the entry flow's success page. Extracted so the two stay one effect.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const confetti = vi.hoisted(() => vi.fn());
vi.mock("canvas-confetti", () => ({ default: confetti }));

import { fireConfetti } from "@/lib/confetti";

describe("fireConfetti", () => {
  beforeEach(() => {
    confetti.mockReset();
  });

  it("fires the first burst, then the second", async () => {
    fireConfetti();
    await vi.waitFor(() => expect(confetti).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(confetti).toHaveBeenCalledTimes(2), { timeout: 1000 });
  });

  it("fires nothing when the viewer asks for reduced motion", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    fireConfetti();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confetti).not.toHaveBeenCalled();
  });

  it("does not throw when the library fails to load", async () => {
    confetti.mockImplementation(() => {
      throw new Error("no canvas");
    });
    expect(() => fireConfetti()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
