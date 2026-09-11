import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AreaPicker } from "@/modules/directory/component/AreaPicker";

const YOGYA = { countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };

describe("AreaPicker", () => {
  describe("positive", () => {
    it("saves the province picked, with its country", async () => {
      const onSave = vi.fn();
      render(<AreaPicker area={null} onSave={onSave} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "Choose your area" }));
      await userEvent.click(await screen.findByRole("combobox", { name: "Province" }));
      await userEvent.click(await screen.findByRole("option", { name: "DI Yogyakarta" }));
      await userEvent.click(screen.getByRole("button", { name: "Save area" }));

      expect(onSave).toHaveBeenCalledWith(YOGYA);
    });

    it("names the saved area on the button", () => {
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);

      expect(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" })).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("starts from the saved area when opened", async () => {
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" }));

      expect(await screen.findByRole("combobox", { name: "Province" })).toHaveTextContent("DI Yogyakarta");
    });

    it("lists a province the data holds twice only once", async () => {
      // places.json carries Indonesia's Maluku and Papua under two ids each.
      // The area is stored by name, so both rows are the same choice.
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "Choose your area" }));
      await userEvent.click(await screen.findByRole("combobox", { name: "Province" }));

      expect(await screen.findAllByRole("option", { name: "Maluku" })).toHaveLength(1);
    });

    it("keeps the province when the same country is picked again", async () => {
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" }));
      await userEvent.click(await screen.findByRole("combobox", { name: "Country" }));
      await userEvent.click(await screen.findByRole("option", { name: "Indonesia" }));

      expect(await screen.findByRole("combobox", { name: "Province" })).toHaveTextContent("DI Yogyakarta");
    });

    it("clears the province when another country is picked", async () => {
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" }));
      await userEvent.click(await screen.findByRole("combobox", { name: "Country" }));
      await userEvent.type(await screen.findByPlaceholderText("Select country"), "Malaysia");
      await userEvent.click(await screen.findByRole("option", { name: "Malaysia" }));

      expect(await screen.findByRole("combobox", { name: "Province" })).toHaveTextContent("Search provinces");
      expect(screen.getByRole("button", { name: "Save area" })).toBeDisabled();
    });

    it("takes a typed province for a country the data has no provinces for", async () => {
      const onSave = vi.fn();
      render(<AreaPicker area={null} onSave={onSave} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "Choose your area" }));
      await userEvent.click(await screen.findByRole("combobox", { name: "Country" }));
      await userEvent.type(await screen.findByPlaceholderText("Select country"), "Gibraltar");
      await userEvent.click(await screen.findByRole("option", { name: "Gibraltar" }));
      await userEvent.type(await screen.findByRole("textbox", { name: "Province" }), "Upper Town");
      await userEvent.click(screen.getByRole("button", { name: "Save area" }));

      expect(onSave).toHaveBeenCalledWith({ countryCode: "GI", country: "Gibraltar", province: "Upper Town" });
    });

    it("clears a saved area", async () => {
      const onClear = vi.fn();
      render(<AreaPicker area={YOGYA} onSave={vi.fn()} onClear={onClear} />);

      await userEvent.click(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" }));
      await userEvent.click(await screen.findByRole("button", { name: "Clear area" }));

      expect(onClear).toHaveBeenCalled();
    });
  });

  describe("negative", () => {
    it("does not save without a province, and offers nothing to clear", async () => {
      render(<AreaPicker area={null} onSave={vi.fn()} onClear={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "Choose your area" }));

      expect(await screen.findByRole("button", { name: "Save area" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Clear area" })).not.toBeInTheDocument();
    });
  });
});
