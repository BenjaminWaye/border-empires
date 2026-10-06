import { describe, expect, it } from "vitest";
import { OUTPOST_REACH_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, wrapX, wrapY } from "@border-empires/shared";
import { chooseBestRelayBeaconBuild } from "./relay-beacon-command-planner.js";
import type { StructurePlannerTile } from "./structure-command-planner.js";

const player = { id: "ai-1", points: 0, manpower: 500, settledTileCount: 47, townCount: 3 };
const tile = (x: number, y: number, extra: Partial<StructurePlannerTile> = {}): StructurePlannerTile => ({
  x, y, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED", ...extra
});

// An existing relay covers the first water cells. The proposed coastal relay
// must still use those cells to recognize ocean behind its existing reach.
const coast = (x: number, y: number, inlandFog = false, prize = false) => {
  const candidate = tile(x, y);
  const existing = tile(wrapX(x - 2, WORLD_WIDTH), wrapY(y + (inlandFog ? 2 : 0), WORLD_HEIGHT), {
    economicStructure: { ownerId: player.id, type: "RELAY_BEACON", status: "active" }
  });
  const tiles = new Map<string, StructurePlannerTile>();
  for (let dy = -OUTPOST_REACH_RADIUS; dy <= OUTPOST_REACH_RADIUS; dy += 1) {
    for (let dx = -OUTPOST_REACH_RADIUS; dx <= OUTPOST_REACH_RADIUS; dx += 1) {
      if (dx === OUTPOST_REACH_RADIUS || (inlandFog && dy === -OUTPOST_REACH_RADIUS)) continue;
      const cell = tile(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT), dx <= 0 ? {} : {
        terrain: "COASTAL_SEA", ownerId: undefined, ownershipState: undefined
      });
      tiles.set(`${cell.x},${cell.y}`, cell);
    }
  }
  for (const cell of [existing, candidate]) tiles.set(`${cell.x},${cell.y}`, cell);
  if (prize) {
    const cell = tile(wrapX(x + OUTPOST_REACH_RADIUS, WORLD_WIDTH), y, {
      ownerId: undefined, ownershipState: undefined, resource: "IRON"
    });
    tiles.set(`${cell.x},${cell.y}`, cell);
  }
  return { candidate, tiles };
};

const choose = (fixture: ReturnType<typeof coast>) => chooseBestRelayBeaconBuild(
  player, [...fixture.tiles.values()], fixture.tiles, [fixture.candidate]
);

describe("relay coastal fog scoring across existing reach", () => {
  it.each([[102, 100], [WORLD_WIDTH - 2, WORLD_HEIGHT - 2]])(
    "rejects offshore fog behind water already inside reach at %i,%i", (x, y) => {
      expect(choose(coast(x, y))).toBeUndefined();
    }
  );

  it("keeps inland exploration available when offshore fog is shadowed", () => {
    expect(choose(coast(102, 100, true))?.siteValue).toBe(16);
  });

  it("does not veto exploration across a one-tile strait", () => {
    const fixture = coast(102, 100);
    for (const cell of fixture.tiles.values()) {
      if (cell.x >= 103 && cell.x <= 105) cell.terrain = "LAND";
    }
    expect(choose(fixture)?.siteValue).toBe(16);
  });

  it("still values a visible neutral prize beyond the water", () => {
    expect(choose(coast(102, 100, false, true))?.siteValue).toBe(8);
  });

  it("keeps tile lookup work bounded to one fixed box per candidate", () => {
    const fixture = coast(102, 100);
    let reads = 0;
    const lookup = { get: (key: string) => { reads += 1; return fixture.tiles.get(key); } };
    chooseBestRelayBeaconBuild(player, [...fixture.tiles.values()], lookup, [fixture.candidate]);
    // Structure visibility checks a fixed 16-cell neighborhood as well.
    expect(reads).toBeLessThanOrEqual((OUTPOST_REACH_RADIUS * 2 + 1) ** 2 - 1 + 16);
  });
});
