import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { waystationOverviewLine } from "./client-tile-overview-modifiers.js";

const deps = { me: "me", prettyToken: (v: string) => v.charAt(0) + v.slice(1).toLowerCase() };
const tile = (waystation: Tile["waystation"]): Tile => ({ x: 1, y: 1, terrain: "LAND", ...(waystation !== undefined ? { waystation } : {}) }) as Tile;

describe("waystationOverviewLine", () => {
  it("is absent for tiles without a waystation", () => {
    expect(waystationOverviewLine(tile(undefined), deps)).toBeUndefined();
    expect(waystationOverviewLine(tile(null), deps)).toBeUndefined();
  });
  it("reports dormant sites", () => {
    expect(waystationOverviewLine(tile({ activated: false }), deps)).toMatch(/Dormant/);
  });
  it("reports active sites with the granted effect and activator", () => {
    const line = waystationOverviewLine(tile({ activated: true, activatedByPlayerId: "me", grantedEffect: "RESOURCE_SLOT", grantedResource: "TITANIUM" }), deps);
    expect(line).toBe("Waystation: Active (activated by you). Granted: +1 Titanium resource slot.");
    expect(waystationOverviewLine(tile({ activated: true, activatedByPlayerId: "other", grantedEffect: "TECH", grantedTechId: "t1" }), { ...deps, techName: () => "Masonry" })).toBe(
      "Waystation: Active (activated by another player). Granted: unlocked Masonry."
    );
  });
  it("omits the granted clause for no-op activations", () => {
    expect(waystationOverviewLine(tile({ activated: true, activatedByPlayerId: "me", grantedEffect: "TECH" }), deps)).toBe("Waystation: Active (activated by you).");
  });
});
