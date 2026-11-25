// Playtest Run 5 (Henrik): the guide marked grain the tile menu called "Outside your reach". The checklist
// judged reach with the client's local approximation while the menu uses the server's border, so the two
// disagreed. Given the server's border, the checklist must not point at food outside it.
import { describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { onboardingChecklistState } from "./client-onboarding-checklist.js";

const ME = "player-1";
const tiles = new Map<string, Tile>(
  [
    { x: 5, y: 5, terrain: "LAND", ownerId: ME, ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN" } },
    { x: 6, y: 5, terrain: "LAND", resource: "FARM" }
  ].map((t) => [tileKey(t.x, t.y), t as unknown as Tile])
);

describe("onboarding checklist follows the server's border", () => {
  it("points at grain inside the local approximation only when the server agrees it is in reach", () => {
    expect(onboardingChecklistState(tiles, ME, null, { completed: false }).step).toBe("EXPAND_FOOD");
    const outside = onboardingChecklistState(tiles, ME, null, { completed: false, reach: new Set([tileKey(5, 5)]) });
    expect(outside.step).toBe("EXPAND_RELAY_BEACON");
    expect(outside.highlightTiles).not.toContainEqual({ x: 6, y: 5 });
    const inside = onboardingChecklistState(tiles, ME, null, { completed: false, reach: new Set([tileKey(5, 5), tileKey(6, 5)]) });
    expect(inside.highlightTiles).toContainEqual({ x: 6, y: 5 });
  });
});
