import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { AETHER_SHIELD_LEGEND_LINE, observatoryOverviewLines } from "./client-tile-menu-observatory-lines.js";

const NOW = 1_000_000;
const deps = (protector?: { x: number; y: number }) => ({ me: "me", nowMs: NOW, ownMaxShots: 3, hostileObservatoryProtectingTile: () => protector });
const towerTile = (ownerId: string, observatory: Partial<NonNullable<Tile["observatory"]>> = {}): Tile =>
  ({ x: 3, y: 3, terrain: "LAND", ownerId, observatory: { ownerId, status: "active", ...observatory } }) as Tile;

describe("observatoryOverviewLines", () => {
  it("explains the map glow when an Aether Tower is selected -- yours or an enemy's", () => {
    expect(observatoryOverviewLines(towerTile("me"), deps())).toContain(AETHER_SHIELD_LEGEND_LINE);
    expect(observatoryOverviewLines(towerTile("enemy"), deps())).toContain(AETHER_SHIELD_LEGEND_LINE);
    expect(AETHER_SHIELD_LEGEND_LINE).toMatch(/blue.*red/s);
  });

  it("says which enemy tower shields a selected enemy tile", () => {
    const lines = observatoryOverviewLines({ x: 5, y: 6, terrain: "LAND", ownerId: "enemy" } as Tile, deps({ x: 20, y: 21 }));
    expect(lines[0]).toContain("Shielded by an enemy Aether Tower at (20, 21)");
    expect(lines).not.toContain(AETHER_SHIELD_LEGEND_LINE);
  });

  it("adds nothing for a plain tile that isn't shielded, nor a shield line for your own tile", () => {
    expect(observatoryOverviewLines({ x: 5, y: 6, terrain: "LAND", ownerId: "enemy" } as Tile, deps())).toEqual([]);
    expect(observatoryOverviewLines({ x: 5, y: 6, terrain: "LAND", ownerId: "me" } as Tile, deps({ x: 1, y: 1 }))).toEqual([]);
  });

  it("says an empty tower isn't shielding and when its next shot comes back", () => {
    const lines = observatoryOverviewLines(towerTile("me", { shotsUsedAt: [NOW - 3_600_000, NOW - 1, NOW], cooldownUntil: NOW + 82_800_000 }), deps());
    expect(lines.some((line) => line.includes("out of shots") && line.includes("not protecting"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Shots: 0 of 3 left · next back in 23h."))).toBe(true);
  });
});
