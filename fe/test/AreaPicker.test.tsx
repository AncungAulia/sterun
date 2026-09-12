/**
 * The picker, over the real places dataset.
 *
 * ## Why this file gets longer than the default timeout
 *
 * The picker's form is `React.lazy` and the first render in the file pulls in
 * `src/data/places.json`, 176 KB of it, which Vite then has to transform and
 * hand to the module graph. That is a one off cost, but it lands inside the
 * first case that opens the dialog, and with the whole suite running in
 * parallel it has gone past the 5 s default and failed a case that passes in
 * about a second when the file runs alone. A timeout is the honest fix: the
 * work is real, and the alternative would be stubbing the dataset away, which
 * would leave nothing testing what this file exists to test (a country whose
 * provinces the data does not have, a province listed twice, the whole country
 * offered first).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Area } from "@/lib/area";
import { AreaPicker } from "@/modules/directory/component/AreaPicker";

vi.setConfig({ testTimeout: 20_000 });

const YOGYA = { countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };
const INDONESIA = { countryCode: "ID", country: "Indonesia" };

/** The picker with a place that actually changes, the way the page holds it. */
function Harness({
  initial = null,
  onSave = () => {},
  onClear = () => {},
}: {
  initial?: Area | null;
  onSave?: (area: Area) => void;
  onClear?: () => void;
}) {
  const [area, setArea] = useState<Area | null>(initial);
  return (
    <AreaPicker
      area={area}
      onSave={(next) => {
        onSave(next);
        setArea(next);
      }}
      onClear={() => {
        onClear();
        setArea(null);
      }}
    />
  );
}

async function openPicker(name: string) {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("dialog", { name: "Location" });
}

describe("AreaPicker", () => {
  describe("positive", () => {
    it("reads All locations when no place is chosen", () => {
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={vi.fn()} />);

      expect(screen.getByRole("button", { name: "All locations" })).toBeInTheDocument();
    });

    it("names the saved place on the button", () => {
      const { rerender } = render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);
      expect(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" })).toBeInTheDocument();

      rerender(<AreaPicker area={INDONESIA} onSave={vi.fn()} onClear={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Indonesia" })).toBeInTheDocument();
    });

    it("saves the province picked, with its country", async () => {
      const onSave = vi.fn();
      render(<Harness onSave={onSave} />);

      await openPicker("All locations");
      await userEvent.click(await screen.findByRole("combobox", { name: "Province" }));
      await userEvent.click(await screen.findByRole("option", { name: "DI Yogyakarta" }));
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0]).toStrictEqual(YOGYA);
      expect(await screen.findByRole("button", { name: "DI Yogyakarta, Indonesia" })).toBeInTheDocument();
    });

    it("saves All of Indonesia as the whole country, and the button names only the country", async () => {
      const onSave = vi.fn();
      render(<Harness initial={YOGYA} onSave={onSave} />);

      await openPicker("DI Yogyakarta, Indonesia");
      await userEvent.click(await screen.findByRole("combobox", { name: "Province" }));
      await userEvent.click(await screen.findByRole("option", { name: "All of Indonesia" }));
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));

      // Strict: a whole country carries no province key at all, not an empty one.
      expect(onSave.mock.calls[0][0]).toStrictEqual(INDONESIA);
      expect(await screen.findByRole("button", { name: "Indonesia" })).toBeInTheDocument();
    });

    it("clears a saved place with All locations", async () => {
      const onClear = vi.fn();
      render(<Harness initial={YOGYA} onClear={onClear} />);

      const dialog = await openPicker("DI Yogyakarta, Indonesia");
      await userEvent.click(within(dialog).getByRole("button", { name: "All locations" }));

      expect(onClear).toHaveBeenCalledTimes(1);
      expect(await screen.findByRole("button", { name: "All locations" })).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("is titled Location, with no description text for a screen reader to point at", async () => {
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={vi.fn()} />);

      const dialog = await openPicker("All locations");

      expect(dialog).not.toHaveAttribute("aria-describedby");
      expect(within(dialog).queryByText(/province get a row|saved in this browser/i)).not.toBeInTheDocument();
    });

    it("starts on Indonesia and the whole country when nothing is saved", async () => {
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={vi.fn()} />);

      await openPicker("All locations");

      expect(await screen.findByRole("combobox", { name: "Country" })).toHaveTextContent("Indonesia");
      expect(screen.getByRole("combobox", { name: "Province" })).toHaveTextContent("All of Indonesia");
      expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    });

    it("applies the whole default country without touching either select", async () => {
      const onSave = vi.fn();
      render(<Harness onSave={onSave} />);

      await openPicker("All locations");
      await userEvent.click(await screen.findByRole("button", { name: "Apply" }));

      expect(onSave.mock.calls[0][0]).toStrictEqual(INDONESIA);
      expect(await screen.findByRole("button", { name: "Indonesia" })).toBeInTheDocument();
    });

    it("starts from the saved province when opened", async () => {
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);

      await openPicker("DI Yogyakarta, Indonesia");

      expect(await screen.findByRole("combobox", { name: "Province" })).toHaveTextContent("DI Yogyakarta");
    });

    it("starts on All of the saved country when no province was saved", async () => {
      render(<AreaPicker area={{ countryCode: "MY", country: "Malaysia" }} onSave={vi.fn()} onClear={vi.fn()} />);

      await openPicker("Malaysia");

      expect(await screen.findByRole("combobox", { name: "Country" })).toHaveTextContent("Malaysia");
      expect(screen.getByRole("combobox", { name: "Province" })).toHaveTextContent("All of Malaysia");
    });

    it("offers the whole country as the first province", async () => {
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={vi.fn()} />);

      await openPicker("All locations");
      await userEvent.click(await screen.findByRole("combobox", { name: "Province" }));

      const options = await screen.findAllByRole("option");
      expect(options[0]).toHaveTextContent("All of Indonesia");
      expect(options.filter((option) => /^All of/.test(option.textContent ?? ""))).toHaveLength(1);
    });

    it("lists a province the data holds twice only once", async () => {
      // places.json carries Indonesia's Maluku and Papua under two ids each.
      // The area is stored by name, so both rows are the same choice.
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={vi.fn()} />);

      await openPicker("All locations");
      await userEvent.click(await screen.findByRole("combobox", { name: "Province" }));

      expect(await screen.findAllByRole("option", { name: "Maluku" })).toHaveLength(1);
    });

    it("keeps the province when the same country is picked again", async () => {
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);

      await openPicker("DI Yogyakarta, Indonesia");
      await userEvent.click(await screen.findByRole("combobox", { name: "Country" }));
      await userEvent.click(await screen.findByRole("option", { name: "Indonesia" }));

      expect(await screen.findByRole("combobox", { name: "Province" })).toHaveTextContent("DI Yogyakarta");
    });

    it("goes back to the whole country when another country is picked", async () => {
      const onSave = vi.fn();
      render(<Harness initial={YOGYA} onSave={onSave} />);

      await openPicker("DI Yogyakarta, Indonesia");
      await userEvent.click(await screen.findByRole("combobox", { name: "Country" }));
      await userEvent.type(await screen.findByPlaceholderText("Select country"), "Malaysia");
      await userEvent.click(await screen.findByRole("option", { name: "Malaysia" }));

      expect(await screen.findByRole("combobox", { name: "Province" })).toHaveTextContent("All of Malaysia");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(onSave.mock.calls[0][0]).toStrictEqual({ countryCode: "MY", country: "Malaysia" });
    });

    it("takes a typed province for a country the data has no provinces for", async () => {
      const onSave = vi.fn();
      render(<AreaPicker area={null} onSave={onSave} onClear={vi.fn()} />);

      await openPicker("All locations");
      await userEvent.click(await screen.findByRole("combobox", { name: "Country" }));
      await userEvent.type(await screen.findByPlaceholderText("Select country"), "Gibraltar");
      await userEvent.click(await screen.findByRole("option", { name: "Gibraltar" }));
      await userEvent.type(await screen.findByRole("textbox", { name: "Province" }), "  Upper Town ");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));

      expect(onSave.mock.calls[0][0]).toStrictEqual({ countryCode: "GI", country: "Gibraltar", province: "Upper Town" });
    });

    it("saves the whole country when that typed province is left blank", async () => {
      const onSave = vi.fn();
      render(<AreaPicker area={null} onSave={onSave} onClear={vi.fn()} />);

      await openPicker("All locations");
      await userEvent.click(await screen.findByRole("combobox", { name: "Country" }));
      await userEvent.type(await screen.findByPlaceholderText("Select country"), "Gibraltar");
      await userEvent.click(await screen.findByRole("option", { name: "Gibraltar" }));
      await userEvent.type(await screen.findByRole("textbox", { name: "Province" }), "   ");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));

      expect(onSave.mock.calls[0][0]).toStrictEqual({ countryCode: "GI", country: "Gibraltar" });
    });
  });

  describe("negative", () => {
    it("offers nothing to clear when no place is saved", async () => {
      const onClear = vi.fn();
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={onClear} />);

      const dialog = await openPicker("All locations");

      expect(within(dialog).getByRole("button", { name: "Apply" })).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: "All locations" })).not.toBeInTheDocument();
      expect(onClear).not.toHaveBeenCalled();
    });

    it("saves nothing when the dialog is closed without Apply", async () => {
      const onSave = vi.fn();
      render(<Harness initial={YOGYA} onSave={onSave} />);

      await openPicker("DI Yogyakarta, Indonesia");
      await userEvent.click(await screen.findByRole("combobox", { name: "Province" }));
      await userEvent.click(await screen.findByRole("option", { name: "All of Indonesia" }));
      await userEvent.keyboard("{Escape}");

      expect(await screen.findByRole("button", { name: "DI Yogyakarta, Indonesia" })).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
