import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { targetFortPerimeterVariantFor } from "./runtime-combat-target-fort.js";

const NOW = 5_000_000;
const tile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", ...extra }) as DomainTileState;
const fortTile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState =>
  tile(x, y, { fort: { ownerId: "p1", status: "active", variant: "FORT" } as DomainTileState["fort"], ...extra });

const ctxFor = (tiles: DomainTileState[], dormant: string[] = []) => ({
  now: () => NOW,
  isStructureDormant: (_playerId: string, key: string) => dormant.includes(key),
  tiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t]))
});

describe("targetFortPerimeterVariantFor", () => {
  it("returns the covering fort for a garrisoned neighbour", () => {
    const target = tile(11, 10);
    expect(targetFortPerimeterVariantFor(ctxFor([fortTile(10, 10), target]), target, "p1")).toBe("FORT");
  });

  it("ignores dormant forts and forts held under capture", () => {
    const target = tile(11, 10);
    expect(targetFortPerimeterVariantFor(ctxFor([fortTile(10, 10), target], ["10,10"]), target, "p1")).toBeUndefined();
    const held = fortTile(10, 10, { captureHoldUntil: NOW + 10_000, ownershipState: "FRONTIER" });
    expect(targetFortPerimeterVariantFor(ctxFor([held, target]), target, "p1")).toBeUndefined();
  });

  it("gives frontier targets nothing", () => {
    const target = tile(11, 10, { ownershipState: "FRONTIER" });
    expect(targetFortPerimeterVariantFor(ctxFor([fortTile(10, 10), target]), target, "p1")).toBeUndefined();
  });
});
