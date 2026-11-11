// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StructureTierOption } from "../client-types.js";
import { hideStructureTierSheet, isStructureTierSheetOpen, showStructureTierSheet } from "./client-structure-tier-sheet.js";

const options: StructureTierOption[] = [
  { structureType: "PALISADE", variant: "PALISADE", label: "Palisade", stat: "Defense ×1.35", cost: "30 manpower", disabled: false },
  { structureType: "FORT", tier: "THUNDER_BASTION", variant: "THUNDER_BASTION", label: "Thunder Bastion", stat: "Defense ×6.50", cost: "960 manpower", disabled: true, disabledReason: "Requires Steelworking" }
];

describe("showStructureTierSheet", () => {
  afterEach(() => hideStructureTierSheet());

  it("lists every tier, disabling a locked one with its reason", () => {
    showStructureTierSheet({ title: "Fortify", options, onPick: vi.fn() });
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tier-sheet-option"));
    expect(buttons.map((button) => button.querySelector(".tier-sheet-option-label")?.textContent)).toEqual(["Palisade", "Thunder Bastion"]);
    expect(buttons[1]?.disabled).toBe(true);
    expect(buttons[1]?.textContent).toContain("Requires Steelworking");
  });

  it("picks an enabled tier and closes", () => {
    const onPick = vi.fn();
    showStructureTierSheet({ title: "Fortify", options, onPick });
    document.querySelector<HTMLButtonElement>(".tier-sheet-option")?.click();
    expect(onPick).toHaveBeenCalledWith(options[0]);
    expect(isStructureTierSheetOpen()).toBe(false);
  });

  it("never picks a disabled tier, and Cancel closes without picking", () => {
    const onPick = vi.fn();
    showStructureTierSheet({ title: "Fortify", options, onPick });
    document.querySelectorAll<HTMLButtonElement>(".tier-sheet-option")[1]?.click();
    expect(onPick).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>("[data-tier-cancel]")?.click();
    expect(isStructureTierSheetOpen()).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });
});
