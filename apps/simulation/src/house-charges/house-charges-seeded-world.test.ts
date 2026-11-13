import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { HOUSE_CHARGE_TARGET_CAP, HOUSE_CHARGE_TOWN_CAP } from "@border-empires/shared";
import { createSeasonSeedWorld } from "../season-seed-world.js";
import { runHouseChargesPass } from "./house-charges-ticker.js";

// Acceptance check from docs/house-charges-plan.md against the real season
// worldgen: on continent maps with about 100 empires, at least 95% of Houses
// keep two charges, and no target exceeds its holder cap. Multi-second
// world generation, so this runs in the slow pass (vitest.slow.config.ts).
const noopPlayer = (id: string, isAi: boolean): DomainPlayer =>
  ({ id, isAi, points: 0, manpower: 0, techIds: new Set(), allies: new Set() }) as unknown as DomainPlayer;

/** Lands each empire's AFC on its starting town, as the runtime's AFC grant does at boot. */
const landEveryEmpire = (tiles: Map<string, DomainTileState>): void => {
  const landed = new Set<string>();
  for (const [key, tile] of tiles) {
    const ownerId = tile.ownerId;
    if (!ownerId || ownerId === "barbarian-1" || landed.has(ownerId) || !tile.town) continue;
    landed.add(ownerId);
    tiles.set(key, { ...tile, afc: { ownerId, status: "active", landedAt: 1 } });
  }
};

describe("House Charges on seeded continent worlds", () => {
  for (const seed of [4242, 9001]) {
    it(`deals two charges to at least 95% of 100 empires (seed ${seed})`, () => {
      const world = createSeasonSeedWorld(seed, noopPlayer, { humanPlayerCount: 0, aiPlayerCount: 100, style: "continents" });
      const tiles = world.tiles as Map<string, DomainTileState>;
      landEveryEmpire(tiles);
      const players = new Map([...world.players].filter(([id]) => id !== "barbarian-1"));
      runHouseChargesPass(tiles, players, 1_000);

      const dealt = [...players.values()].filter((player) => player.houseCharges);
      const withTwo = dealt.filter((player) => player.houseCharges!.keptIds.length === 2);
      expect(dealt.length).toBeGreaterThanOrEqual(95);
      expect(withTwo.length / dealt.length).toBeGreaterThanOrEqual(0.95);

      const holders = new Map<string, number>();
      for (const player of dealt) {
        for (const charge of player.houseCharges!.offered) for (const target of charge.targets) holders.set(target.key, (holders.get(target.key) ?? 0) + 1);
      }
      for (const [key, count] of holders) expect(count).toBeLessThanOrEqual(key.startsWith("town:") ? HOUSE_CHARGE_TOWN_CAP : HOUSE_CHARGE_TARGET_CAP);
    }, 300_000);
  }
});
