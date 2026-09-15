/**
 * The country, province and city cascade.
 *
 * Cities used to ship for Indonesia alone, so an organiser in Guangdong picked
 * China, picked Guangdong, and then got a text box. These cover the version
 * that fetches one country's cities on demand, and above all the failure paths:
 * the field must fall back to typing every time the list does not arrive, since
 * a race that cannot be entered into the form is worse than a city typed by
 * hand.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlaceFields, EMPTY_PLACE, type Place } from "@/components/elements/PlaceFields";
import { provincesOf } from "@/lib/places";

const fetchCities = vi.hoisted(() => vi.fn());

vi.mock("@/lib/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/places")>()),
  fetchCities,
}));

const GUANGDONG = provincesOf("CN").find((province) => province.name === "Guangdong")!;
const JAKARTA = provincesOf("ID").find((province) => province.name === "DKI Jakarta")!;

function renderFields(place: Partial<Place> = {}) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<PlaceFields place={{ ...EMPTY_PLACE, ...place }} onChange={onChange} />, {
    wrapper: Wrapper,
  });
  return onChange;
}

beforeEach(() => {
  fetchCities.mockReset();
  fetchCities.mockResolvedValue({});
});

describe("PlaceFields", () => {
  describe("positive", () => {
    it("offers a city list for a province outside Indonesia", async () => {
      // The bug this whole change exists for: China, Guangdong, and a text box.
      fetchCities.mockResolvedValue({ [GUANGDONG.id]: ["Guangzhou", "Shenzhen"] });

      renderFields({ country: "CN", provinceId: String(GUANGDONG.id) });

      expect(await screen.findByRole("combobox", { name: "City" })).toBeInTheDocument();
      expect(fetchCities).toHaveBeenCalledWith("CN");
    });

    it("still offers Indonesian cities, which is what the pilot runs on", async () => {
      fetchCities.mockResolvedValue({ [JAKARTA.id]: ["Jakarta Pusat"] });

      renderFields({ country: "ID", provinceId: String(JAKARTA.id) });

      const city = await screen.findByRole("combobox", { name: "City" });
      await userEvent.setup().click(city);

      expect(await screen.findByRole("option", { name: "Jakarta Pusat" })).toBeInTheDocument();
    });

    it("asks for one country's cities, not for every country's", async () => {
      renderFields({ country: "CN", provinceId: String(GUANGDONG.id) });

      await screen.findByLabelText("City");
      expect(fetchCities).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge", () => {
    it("asks for nothing until a country is chosen", () => {
      renderFields();

      expect(fetchCities).not.toHaveBeenCalled();
    });

    it("lets the city be typed for a province the file has no cities for", async () => {
      // A real gap in the data, not a failure: some provinces carry none.
      fetchCities.mockResolvedValue({ "999999": ["Somewhere else"] });

      renderFields({ country: "CN", provinceId: String(GUANGDONG.id) });

      expect(await screen.findByRole("textbox", { name: "City" })).toBeInTheDocument();
      expect(screen.getByText(/type it/i)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("falls back to typing when the city file cannot be loaded", async () => {
      // `fetchCities` swallows its own errors and returns {}, so this is what
      // an offline organiser sees. The form still has to be completable.
      fetchCities.mockResolvedValue({});

      renderFields({ country: "CN", provinceId: String(GUANGDONG.id) });

      expect(await screen.findByRole("textbox", { name: "City" })).toBeInTheDocument();
    });
  });
});
