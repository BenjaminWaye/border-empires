import type { DomainTileState } from "@border-empires/game-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Siege rule (owner 2026-11-27, "cut off completely", shared town-siege.ts):
// the sim's authoritative roll defends a town whose owner holds no plot of any
// kind around it, with a rival on its ring, at TOWN_BESIEGED_DEFENSE_MULT; any
// other town is unchanged.
const rolled: Array<{ defMult: number; besieged: boolean | undefined }> = [];
vi.mock("@border-empires/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@border-empires/shared")>();
  return {
    ...actual,
    // Flat terrain so only the siege term differs between the two towns.
    terrainCombatModifiers: () => ({}),
    rollFrontierCombat: (...args: Parameters<typeof actual.rollFrontierCombat>) => {
      const result = actual.rollFrontierCombat(...args);
      rolled.push({ defMult: result.defMult, besieged: args[0].townBesieged });
      return result;
    }
  };
});

const { TOWN_BESIEGED_DEFENSE_MULT, TOWN_BESIEGED_LABEL } = await import("@border-empires/shared");
const { buildLockedCombatResolution } = await import("./runtime-combat-support.js");
const { buildPlayerCombatSummary } = await import("./afc-specializations/afc-player-combat-facts.js");
const { CombatLockIndex } = await import("./combat-lock-index/combat-lock-index.js");
type Ctx = Parameters<typeof buildLockedCombatResolution>[0];

const ATTACKER_ID = "player-attacker";
const DEFENDER_ID = "player-defender";
const TOWN = { x: 6, y: 5 };
const TOWN_KEY = `${TOWN.x},${TOWN.y}`;

/** A garrisoned town ringed by the attacker's frontier, optionally keeping one garrisoned plot of its own. */
const ringTiles = (defenderKeepsPlot: boolean): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = TOWN.x + dx;
      const y = TOWN.y + dy;
      if (dx === 0 && dy === 0) {
        tiles.set(TOWN_KEY, { x, y, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } } as DomainTileState);
        continue;
      }
      const keep = defenderKeepsPlot && dx === 1 && dy === 0;
      tiles.set(`${x},${y}`, { x, y, terrain: "LAND", ownerId: keep ? DEFENDER_ID : ATTACKER_ID, ownershipState: keep ? "SETTLED" : "FRONTIER" });
    }
  }
  return tiles;
};

const makeContext = (tiles: Map<string, DomainTileState>): Ctx => ({
  now: () => 0,
  players: new Map([
    [ATTACKER_ID, { id: ATTACKER_ID, isAi: false, points: 0, manpower: 100, techIds: new Set(), allies: new Set() }],
    [DEFENDER_ID, { id: DEFENDER_ID, isAi: false, points: 0, manpower: 100, techIds: new Set(), allies: new Set() }]
  ]),
  tiles,
  musterTilesByOwner: new Map(),
  musterReservedByKey: new Map(),
  locksByTile: new CombatLockIndex(),
  locksByCommandId: new Map(),
  planetaryDefenseCampCount: () => 0,
  summaryForPlayer: () => ({ settledTileCount: 1, territoryTileKeys: new Set() }) as ReturnType<Ctx["summaryForPlayer"]>,
  replaceTileState: () => {},
  tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
  tileDeltaRevealOnly: (tile) => ({ x: tile.x, y: tile.y }),
  emitEvent: () => {},
  emitPlayerStateUpdate: () => {},
  isStructureDormant: () => false,
  manpowerLossByTileKey: new Map(),
  ownedStructureCountForPlayer: () => 0
});

const attackTown = (ctx: Ctx) =>
  buildLockedCombatResolution(ctx, {
    actionType: "ATTACK",
    commandId: "attack-town",
    playerId: ATTACKER_ID,
    manpowerCost: 40,
    originKey: `${TOWN.x - 1},${TOWN.y}`,
    originX: TOWN.x - 1,
    originY: TOWN.y,
    targetX: TOWN.x,
    targetY: TOWN.y,
    targetKey: TOWN_KEY
  });

describe("buildLockedCombatResolution -- besieged towns", () => {
  beforeEach(() => {
    rolled.length = 0;
  });

  it("weakens a town cut off from its own garrisons and leaves a supplied one unchanged", () => {
    attackTown(makeContext(ringTiles(true)));
    attackTown(makeContext(ringTiles(false)));
    expect(rolled).toHaveLength(2);
    const [supplied, besieged] = rolled;
    expect(supplied!.besieged).toBe(false);
    expect(besieged!.besieged).toBe(true);
    // Garrisoned (1.3) x Town (1.2) with nothing else in play.
    expect(supplied!.defMult).toBeCloseTo(1.3 * 1.2, 6);
    expect(besieged!.defMult).toBeCloseTo(1.3 * 1.2 * TOWN_BESIEGED_DEFENSE_MULT, 6);
  });

  it("does not besiege a fresh town whose ring is still its owner's frontier when attacked from one plot", () => {
    // Regression (post-merge review of #3023): the attacker's own launch plot
    // sat on the ring, so any town without a garrisoned ring plot counted as
    // besieged the moment it was attacked.
    const tiles = ringTiles(false);
    for (const tile of tiles.values()) {
      if (tile.x === TOWN.x && tile.y === TOWN.y) continue;
      if (tile.x === TOWN.x - 1 && tile.y === TOWN.y) continue; // the attacker's launch plot
      tiles.set(`${tile.x},${tile.y}`, { ...tile, ownerId: DEFENDER_ID, ownershipState: "FRONTIER" });
    }
    attackTown(makeContext(tiles));
    expect(rolled.at(-1)!.besieged).toBe(false);
    expect(rolled.at(-1)!.defMult).toBeCloseTo(1.3 * 1.2, 6);
  });

  it("ignores the defender's allies on the ring: they neither besiege nor supply the town", () => {
    const allyId = "player-ally";
    const withAlly = (ringOwner: (dx: number, dy: number) => string): Ctx => {
      const tiles = ringTiles(false);
      for (const tile of tiles.values()) {
        if (tile.x === TOWN.x && tile.y === TOWN.y) continue;
        const owner = ringOwner(tile.x - TOWN.x, tile.y - TOWN.y);
        tiles.set(`${tile.x},${tile.y}`, { ...tile, ownerId: owner, ownershipState: owner === allyId ? "SETTLED" : "FRONTIER" });
      }
      const ctx = makeContext(tiles);
      (ctx.players.get(DEFENDER_ID)!.allies as Set<string>).add(allyId);
      return ctx;
    };
    // Origin (-1, 0) stays the attacker's; everything else is the ally's garrison.
    attackTown(withAlly((dx, dy) => (dx === -1 && dy === 0 ? ATTACKER_ID : allyId)));
    expect(rolled.at(-1)!.besieged).toBe(true);
    // A ring held only by allies is no siege (attack launched from a dock-less origin is irrelevant to the rule).
    const allyOnly = withAlly(() => allyId);
    expect(buildPlayerCombatSummary(
      { ...allyOnly, factoryCountsFor: () => ({ titanium: 0, umbrite: 0 }), isFortDormant: () => false } as Parameters<typeof buildPlayerCombatSummary>[0],
      DEFENDER_ID,
      TOWN
    )?.afcCombatFacts?.targetTownBesieged).toBe(false);
  });

  it("reports the siege to the gateway preview through the defender's combat summary", () => {
    for (const [keepsPlot, expected] of [[true, false], [false, true]] as const) {
      const ctx = makeContext(ringTiles(keepsPlot));
      const summary = buildPlayerCombatSummary(
        { ...ctx, factoryCountsFor: () => ({ titanium: 0, umbrite: 0 }), isFortDormant: () => false } as Parameters<typeof buildPlayerCombatSummary>[0],
        DEFENDER_ID,
        TOWN
      );
      expect(summary?.afcCombatFacts?.targetTownBesieged).toBe(expected);
    }
    expect(TOWN_BESIEGED_LABEL).toBe("Besieged");
  });
});
