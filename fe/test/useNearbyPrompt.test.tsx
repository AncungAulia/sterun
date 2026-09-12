/**
 * The browser answers the location prompt whenever it feels like it, which is
 * usually after React has mounted the effect a second time.
 *
 * In development React mounts, cleans up, then mounts again. The first version
 * of this hook dropped any answer that arrived after that cleanup, so on a
 * developer's machine the coordinates were always thrown away and the page
 * silently behaved as if the visitor had refused. These tests drive the answer
 * the way a browser does, late, with the hook mounted under StrictMode.
 */
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNearbyPrompt } from "@/hooks/useNearbyPrompt";
import { readStoredPlace } from "@/lib/area";

const getCurrentPosition = vi.fn();

function Probe() {
  useNearbyPrompt();
  return null;
}

function renderProbe() {
  return render(
    <StrictMode>
      <Probe />
    </StrictMode>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  getCurrentPosition.mockReset();
  Object.defineProperty(window.navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
    writable: true,
  });
});

describe("useNearbyPrompt", () => {
  describe("positive", () => {
    it("keeps an answer that arrives after the effect has been remounted", async () => {
      let answer: PositionCallback | undefined;
      getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
        answer = onSuccess;
      });

      renderProbe();
      await act(async () => {
        answer?.({ coords: { latitude: -6.1754, longitude: 106.8272 } } as GeolocationPosition);
      });

      expect(readStoredPlace().place).toEqual({ mode: "nearby", lat: -6.1754, lng: 106.8272 });
    });
  });

  describe("edge", () => {
    it("asks once however many times React mounts the effect", () => {
      getCurrentPosition.mockImplementation(() => {});

      renderProbe();

      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(readStoredPlace().asked).toBe(true);
    });
  });

  describe("negative", () => {
    it("leaves a place chosen while the prompt was open alone", async () => {
      let answer: PositionCallback | undefined;
      getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
        answer = onSuccess;
      });
      renderProbe();

      const { storePlace } = await import("@/lib/area");
      act(() => {
        storePlace({ countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" });
      });
      await act(async () => {
        answer?.({ coords: { latitude: -6.1754, longitude: 106.8272 } } as GeolocationPosition);
      });

      expect(readStoredPlace().place).toEqual({
        mode: "area",
        countryCode: "ID",
        country: "Indonesia",
        province: "DI Yogyakarta",
      });
    });
  });
});
