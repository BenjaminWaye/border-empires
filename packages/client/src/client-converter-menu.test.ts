import { describe, expect, it } from "vitest";

import { converterStructureMenuEntries } from "./client-converter-menu.js";
import type { Tile } from "./client-types.js";

const baseDeps = {
  buildDetailTextForAction: () => "",
  formatCooldownShort: () => "",
  tileActionAvailability: (enabled: boolean, reason: string, cost = "") => ({
    disabled: !enabled,
    disabledReason: reason,
    cost
  })
};

const inactiveStructureTile = (
  type: NonNullable<Tile["economicStructure"]>["type"],
  ownershipState: Tile["ownershipState"]
): Tile =>
  ({
    x: 0,
    y: 0,
    terrain: "LAND",
    ownerId: "me",
    ownershipState,
    economicStructure: { type, status: "inactive", disabledUntil: 0 }
  }) as Tile;

describe("Enable <structure> — disabled on an unsettled (FRONTIER) tile, for any building", () => {
  it.each([
    ["RELAY_BEACON"],
    ["UMBRITE_SYNTHESIZER"],
    ["TITANIUM_WEAPONS_FACTORY"]
  ] as const)("disables Enable %s with 'Tile is not settled' on a FRONTIER tile", (type) => {
    const entries = converterStructureMenuEntries(inactiveStructureTile(type, "FRONTIER"), baseDeps);
    const enableAction = entries.find((action) => action.id === "enable_converter_structure");
    expect(enableAction).toBeDefined();
    expect(enableAction?.disabled).toBe(true);
    expect(enableAction?.disabledReason).toBe("Tile is not settled");
  });

  it("leaves Enable <structure> enabled (by normal downtime rules) on a SETTLED tile", () => {
    const entries = converterStructureMenuEntries(inactiveStructureTile("RELAY_BEACON", "SETTLED"), baseDeps);
    const enableAction = entries.find((action) => action.id === "enable_converter_structure");
    expect(enableAction).toBeDefined();
    expect(enableAction?.disabled).toBeFalsy();
  });
});
