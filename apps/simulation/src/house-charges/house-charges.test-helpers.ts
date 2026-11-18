import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { DEFAULT_AUTO_SETTLE_PREFS, type PopulationTier } from "@border-empires/shared";

// A small hand-built world for House Charges tests, in the top-left corner of
// the real (wrapping) world; every unlisted tile is absent, which reads as sea:
//   main island    LAND x 0..39, y 0..29, landing site (AFC) for "p1" at (20,15)
//   desert patch   SAND x 25..32, y 2..6 (40 tiles) inside the main island
//   small island   LAND x 44..51, y 10..14 (40 tiles), a Survey Claim target
//   towns          Vell (8,15) and Harrowmere (30,20), both Town tier
//   relic          (20,25)
export const HOME = { x: 20, y: 15 };
export const VELL = "8,15";
export const HARROWMERE = "30,20";
export const RELIC = "20,25";

const town = (name: string, populationTier: PopulationTier): DomainTileState["town"] => ({ type: "MARKET", populationTier, name });

export const buildChargeWorld = (): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  const put = (tile: DomainTileState): void => {
    tiles.set(`${tile.x},${tile.y}`, tile);
  };
  for (let y = 0; y < 30; y += 1) {
    for (let x = 0; x < 40; x += 1) {
      const desert = x >= 25 && x <= 32 && y >= 2 && y <= 6;
      put({ x, y, terrain: "LAND", landBiome: desert ? "SAND" : "GRASS" });
    }
  }
  for (let y = 10; y < 15; y += 1) for (let x = 44; x < 52; x += 1) put({ x, y, terrain: "LAND", landBiome: "GRASS" });
  put({ ...tiles.get(VELL)!, town: town("Vell", "TOWN") });
  put({ ...tiles.get(HARROWMERE)!, town: town("Harrowmere", "TOWN") });
  put({ ...tiles.get(RELIC)!, naturalWonder: { type: "FOUNDRY_HEART", relicVersion: 1, remainingUses: 3 } });
  put({ ...tiles.get(`${HOME.x},${HOME.y}`)!, ownerId: "p1", ownershipState: "SETTLED", afc: { ownerId: "p1", status: "active", landedAt: 1 } });
  return tiles;
};

/** Garrisons the given tile keys for `ownerId`. */
export const garrisonKeys = (tiles: Map<string, DomainTileState>, ownerId: string, keys: Iterable<string>): void => {
  for (const key of keys) {
    const tile = tiles.get(key);
    if (tile) tiles.set(key, { ...tile, ownerId, ownershipState: "SETTLED" });
  }
};

/** An L-shaped road from Vell (8,15) east to (30,15), then south to Harrowmere (30,20). */
export const charterRoadKeys = (): string[] => {
  const keys: string[] = [];
  for (let x = 8; x <= 30; x += 1) keys.push(`${x},15`);
  for (let y = 16; y <= 20; y += 1) keys.push(`30,${y}`);
  return keys;
};

export const makeChargePlayer = (id: string, overrides: Partial<DomainPlayer> = {}): DomainPlayer => ({
  id,
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set(),
  allies: new Set(),
  autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS },
  ...overrides
});
