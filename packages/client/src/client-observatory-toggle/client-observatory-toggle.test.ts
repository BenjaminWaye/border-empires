import { describe, expect, it } from "vitest";

import { observatoryToggleMenuEntries, structureToggleMenuEntries } from "./client-observatory-toggle.js";
import type { Tile, TileActionDef } from "../client-types.js";

const deps = {
  buildDetailTextForAction: (actionId: string) => `detail:${actionId}`,
  formatCooldownShort: (ms: number) => `${ms}ms`,
  tileActionAvailability: (enabled: boolean, reason: string, cost?: string): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> =>
    enabled ? { disabled: false, ...(cost ? { cost } : {}) } : { disabled: true, disabledReason: reason, ...(cost ? { cost } : {}) }
};

const towerTile = (status: string, overrides: Partial<Tile> = {}): Tile =>
  ({
    x: 1,
    y: 1,
    ownerId: "me",
    ownershipState: "SETTLED",
    observatory: { ownerId: "me", status },
    ...overrides
  }) as unknown as Tile;

describe("Aether Tower toggle menu entries", () => {
  it("offers Disable on an active tower", () => {
    const entries = observatoryToggleMenuEntries(towerTile("active"), deps);
    expect(entries.map((entry) => entry.id)).toEqual(["disable_observatory"]);
    expect(entries[0]?.label).toBe("Disable Aether Tower");
    expect(entries[0]?.disabled).toBeUndefined();
  });

  it("offers Enable on a disabled tower", () => {
    const entries = observatoryToggleMenuEntries(towerTile("inactive"), deps);
    expect(entries.map((entry) => entry.id)).toEqual(["enable_observatory"]);
    expect(entries[0]?.disabled).toBe(false);
  });

  it("blocks Enable on an unsettled tile with the reason shown", () => {
    const entries = observatoryToggleMenuEntries(towerTile("inactive", { ownershipState: "FRONTIER" } as Partial<Tile>), deps);
    expect(entries[0]).toMatchObject({ disabled: true, disabledReason: "Tile is not settled" });
  });

  it("offers nothing while the tower is building or being removed", () => {
    expect(observatoryToggleMenuEntries(towerTile("under_construction"), deps)).toEqual([]);
    expect(observatoryToggleMenuEntries(towerTile("removing"), deps)).toEqual([]);
  });

  it("offers nothing for the Watchtower Engine's free tower", () => {
    const tile = towerTile("active", { naturalWonder: { type: "WATCHTOWER_ENGINE" } } as unknown as Partial<Tile>);
    expect(observatoryToggleMenuEntries(tile, deps)).toEqual([]);
  });

  it("combines converter and tower toggles for a tile carrying both", () => {
    const tile = towerTile("active", {
      economicStructure: { ownerId: "me", type: "MINTWORKS", status: "active" }
    } as unknown as Partial<Tile>);
    expect(structureToggleMenuEntries(tile, deps).map((entry) => entry.id)).toEqual([
      "disable_converter_structure",
      "disable_observatory"
    ]);
  });
});
