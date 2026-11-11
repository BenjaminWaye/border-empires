import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { clearWaystationsAroundAfcLanding, withoutLandingWaystation } from "./afc-landing-waystation-clear.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

const SIZE = 25;
const dormant = { waystation: { activated: false } } satisfies Partial<DomainTileState>;

const buildWorld = (overrides: Record<string, Partial<DomainTileState>> = {}): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const key = simulationTileKey(x, y);
      tiles.set(key, { x, y, terrain: "LAND", ...overrides[key] });
    }
  }
  return tiles;
};

const run = (tiles: Map<string, DomainTileState>) => {
  const replaced: Array<{ tileKey: string; commandId: string | undefined }> = [];
  const logs: Array<Record<string, unknown>> = [];
  const removed = clearWaystationsAroundAfcLanding(
    {
      tiles,
      replaceTileState: (tileKey, tile, commandId) => {
        tiles.set(tileKey, tile);
        replaced.push({ tileKey, commandId });
      },
      runtimeLogInfo: (payload) => logs.push(payload)
    },
    10,
    10,
    "cmd-1"
  );
  return { removed, replaced, logs };
};

describe("clearWaystationsAroundAfcLanding", () => {
  it("removes unclaimed dormant waystations inside the landing's reach disk, keeping other features", () => {
    const tiles = buildWorld({
      "11,10": { ...dormant, resource: "FARM" },
      "13,13": dormant, // far corner of the radius-3 square
      "10,10": dormant // the landing tile: left for withoutLandingWaystation, so no stale unowned delta
    });
    const { removed, replaced, logs } = run(tiles);
    expect(removed.map((tile) => simulationTileKey(tile.x, tile.y)).sort()).toEqual(["11,10", "13,13"]);
    expect(tiles.get("11,10")).toEqual({ x: 11, y: 10, terrain: "LAND", resource: "FARM" });
    expect(tiles.get("13,13")).toEqual({ x: 13, y: 13, terrain: "LAND" });
    expect(tiles.get("10,10")?.waystation).toEqual({ activated: false });
    expect(replaced.every((entry) => entry.commandId === "cmd-1")).toBe(true);
    expect(logs).toEqual([{ type: "afc_landing_waystations_cleared", commandId: "cmd-1", x: 10, y: 10, cleared: 2 }]);
  });

  it("leaves waystations outside the disk, already activated, or on owned tiles", () => {
    const activated = { waystation: { activated: true, activatedByPlayerId: "p2", grantedEffect: "GOLD" as const } };
    const tiles = buildWorld({
      "14,10": dormant, // radius 4: outside
      "11,11": activated,
      "9,9": { ...dormant, ownerId: "p2", ownershipState: "FRONTIER" }
    });
    const { removed, logs } = run(tiles);
    expect(removed).toEqual([]);
    expect(logs).toEqual([]);
    expect(tiles.get("14,10")?.waystation).toEqual({ activated: false });
    expect(tiles.get("11,11")?.waystation).toEqual(activated.waystation);
    expect(tiles.get("9,9")?.waystation).toEqual({ activated: false });
  });
});

describe("withoutLandingWaystation", () => {
  it("strips a dormant waystation and keeps an activated one", () => {
    expect(withoutLandingWaystation({ x: 1, y: 1, terrain: "LAND", ...dormant })).toEqual({ x: 1, y: 1, terrain: "LAND" });
    const activated: DomainTileState = { x: 1, y: 1, terrain: "LAND", waystation: { activated: true } };
    expect(withoutLandingWaystation(activated)).toBe(activated);
  });
});
