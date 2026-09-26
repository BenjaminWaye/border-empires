import { describe, expect, it } from "vitest";
import type { GameInitState, GameTile } from "./game-socket.js";
import { buildBeaconSites, buildTileIndex, buildViewport, buildViewportFrontier } from "./viewport.js";

const PLAYER = "me";
const RIVAL = "rival";

const stateWithTiles = (tiles: GameTile[]): GameInitState => ({
  playerId: PLAYER,
  playerName: "",
  gold: 0,
  manpower: 0,
  manpowerCap: 0,
  manpowerRegenPerMinute: 0,
  tiles,
  eventLog: [],
  autoSettlementQueue: [],
  techIds: [],
  resourceSlots: { supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } }
});

// Mirrors apps/simulation/src/runtime-frontier-command.ts's actual EXPAND
// validation: isInReach(me, target) || isEnemyBorderContact. A tile with no
// reachOwnerId at all satisfies neither and must be excluded -- offering it
// as a frontier target would get rejected server-side as OUT_OF_REACH.
describe("buildViewportFrontier reach gating", () => {
  it("excludes a neutral tile with no reachOwnerId at all", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, reachOwnerId: PLAYER },
      { x: 1, y: 0 } // no ownerId, no reachOwnerId
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)).toBeUndefined();
  });

  it("includes a neutral tile within my own reach", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, reachOwnerId: PLAYER },
      { x: 1, y: 0, reachOwnerId: PLAYER }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)).toBeDefined();
  });

  it("includes a neutral tile inside a rival's reach when the origin is inside my own (border contact)", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, reachOwnerId: PLAYER },
      { x: 1, y: 0, reachOwnerId: RIVAL }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)).toBeDefined();
  });

  it("excludes a neutral tile inside a rival's reach when the origin is NOT inside my own reach", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER }, // owned, but no reach of my own here
      { x: 1, y: 0, reachOwnerId: RIVAL }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)).toBeUndefined();
  });

  it("never reach-gates an enemy-owned tile (ATTACK is not reach-gated)", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, reachOwnerId: PLAYER },
      { x: 1, y: 0, ownerId: RIVAL } // no reachOwnerId at all
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const frontier = buildViewportFrontier(index, { x: 0, y: 0 }, PLAYER);
    expect(frontier.find((tile) => tile.x === 1 && tile.y === 0)?.ownerId).toBe(RIVAL);
  });
});

const AMPLE_RESOURCE_SLOTS = {
  supply: { FOOD: 99, TITANIUM: 99, CRYSTAL: 99, UMBRITE: 99 },
  demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
};
const NO_FREE_FOOD_SLOTS = {
  supply: { FOOD: 0, TITANIUM: 99, CRYSTAL: 99, UMBRITE: 99 },
  demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
};

// buildBeaconSites eligibility mirrors what actually makes a tile a valid
// BUILD_ECONOMIC_STRUCTURE(RELAY_BEACON) target: settled (not a bare
// FRONTIER claim), on the edge of the empire, and not already built on.
describe("buildBeaconSites", () => {
  it("includes a settled edge tile with no existing structure", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" },
      { x: 1, y: 0 } // neutral neighbor -- makes (0,0) an edge tile
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildBeaconSites(index, { x: 0, y: 0 }, PLAYER, AMPLE_RESOURCE_SLOTS);
    expect(sites).toContainEqual({ x: 0, y: 0 });
  });

  it("excludes an owned tile that is only FRONTIER, not SETTLED", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER" },
      { x: 1, y: 0 }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildBeaconSites(index, { x: 0, y: 0 }, PLAYER, AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("excludes a settled tile with no non-owned neighbor (interior, not edge)", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: PLAYER },
      { x: -1, y: 0, ownerId: PLAYER },
      { x: 0, y: 1, ownerId: PLAYER },
      { x: 0, y: -1, ownerId: PLAYER }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildBeaconSites(index, { x: 0, y: 0 }, PLAYER, AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("excludes a settled edge tile that already has an economic structure", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", economicStructureJson: "{}" },
      { x: 1, y: 0 }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildBeaconSites(index, { x: 0, y: 0 }, PLAYER, AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  // Mirrors apps/simulation/src/runtime-structure-command-handlers.ts's
  // actual RELAY_BEACON build rejection ("tile already has structure"),
  // which fires on an existing Observatory or Siege Outpost even when
  // economicStructureJson is empty -- offering such a tile as a beaconSite
  // would send the LLM into a build that can never succeed.
  it("excludes a settled edge tile with an observatory", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", observatoryJson: "{}" },
      { x: 1, y: 0 }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildBeaconSites(index, { x: 0, y: 0 }, PLAYER, AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("excludes a settled edge tile with a siege outpost", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", siegeOutpostJson: "{}" },
      { x: 1, y: 0 }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildBeaconSites(index, { x: 0, y: 0 }, PLAYER, AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  // A Relay Beacon occupies a FOOD slot beyond the first
  // RELAY_BEACON_FREE_FOOD_SLOT_COUNT (5) a player owns -- verified against
  // apps/simulation/src/runtime-structure-command-handlers.ts's
  // hasFreeResourceSlots. Below that count it's free regardless of FOOD slots.
  it("excludes an otherwise-eligible site when 5 beacons are already owned and there's no free FOOD slot", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" },
      { x: 1, y: 0 },
      ...Array.from({ length: 5 }, (_, i) => ({
        x: 10 + i,
        y: 10,
        ownerId: PLAYER,
        ownershipState: "SETTLED" as const,
        economicStructureJson: JSON.stringify({ type: "RELAY_BEACON" })
      }))
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildBeaconSites(index, { x: 0, y: 0 }, PLAYER, NO_FREE_FOOD_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("still allows a 5th beacon (under the free-slot count) even with no free FOOD slot", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" },
      { x: 1, y: 0 },
      ...Array.from({ length: 4 }, (_, i) => ({
        x: 10 + i,
        y: 10,
        ownerId: PLAYER,
        ownershipState: "SETTLED" as const,
        economicStructureJson: JSON.stringify({ type: "RELAY_BEACON" })
      }))
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildBeaconSites(index, { x: 0, y: 0 }, PLAYER, NO_FREE_FOOD_SLOTS);
    expect(sites).toContainEqual({ x: 0, y: 0 });
  });
});

// waystationJson stays populated forever once a waystation activates (see
// packages/shared/src/waystation-types.ts) -- only an unactivated one is
// still worth reaching toward.
describe("isWaystation flag on viewport tiles", () => {
  it("flags a dormant (unactivated) waystation tile", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, waystationJson: JSON.stringify({ activated: false }) }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const viewport = buildViewport(index, { x: 0, y: 0 });
    expect(viewport.find((tile) => tile.x === 0 && tile.y === 0)?.isWaystation).toBe(true);
  });

  it("does not flag a waystation tile whose reward was already claimed", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, waystationJson: JSON.stringify({ activated: true, grantedEffect: "VISION" }) }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const viewport = buildViewport(index, { x: 0, y: 0 });
    expect(viewport.find((tile) => tile.x === 0 && tile.y === 0)?.isWaystation).toBeUndefined();
  });
});
