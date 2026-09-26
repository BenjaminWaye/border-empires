import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { waystationOverviewLines } from "./client-tile-overview-modifiers.js";

const deps: { me: string; prettyToken: (v: string) => string; techName?: (id: string) => string | undefined } = { me: "me", prettyToken: (v) => v.charAt(0) + v.slice(1).toLowerCase() };
const tile = (waystation: Tile["waystation"]): Tile => ({ x: 1, y: 1, terrain: "LAND", ...(waystation !== undefined ? { waystation } : {}) }) as Tile;
const text = (t: Tile, d = deps): string => waystationOverviewLines(t, d).map((l) => l.html.replace(/<[^>]+>/g, "")).join(" | ");

describe("waystationOverviewLines", () => {
  it("is empty for tiles without a waystation", () => {
    expect(waystationOverviewLines(tile(undefined), deps)).toEqual([]);
    expect(waystationOverviewLines(tile(null), deps)).toEqual([]);
  });
  it("shows a Waystation section, Dormant status and how to activate", () => {
    const lines = waystationOverviewLines(tile({ activated: false }), deps);
    expect(lines[0]).toEqual({ html: "Waystation", kind: "section" });
    expect(text(tile({ activated: false }))).toMatch(/Status:Dormant \| Claim or capture this tile/);
  });
  it("shows Active status, granted effect and activator", () => {
    expect(text(tile({ activated: true, activatedByPlayerId: "me", grantedEffect: "RESOURCE_SLOT", grantedResource: "TITANIUM" }))).toBe(
      "Waystation | Status:Active | Granted:+1 Titanium resource slot | Activated by:You"
    );
    expect(text(tile({ activated: true, activatedByPlayerId: "o", grantedEffect: "TECH", grantedTechId: "t1" }), { ...deps, techName: () => "Masonry" })).toBe(
      "Waystation | Status:Active | Granted:Unlocked Masonry | Activated by:Another player"
    );
  });
  it("omits Granted for no-op activations", () => {
    expect(text(tile({ activated: true, activatedByPlayerId: "me", grantedEffect: "TECH" }))).toBe("Waystation | Status:Active | Activated by:You");
  });
});
