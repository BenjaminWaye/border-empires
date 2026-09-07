import { afterEach, describe, expect, it, vi } from "vitest";

import { applyGatewayInitialState, applyGatewayTileDeltaBatch } from "./client-gateway-sync.js";
import { isMusterUnlocked } from "../client-muster-unlock/client-muster-unlock-storage.js";
import type { DiscoveryTipId } from "../client-discovery-tips/client-discovery-tips.js";
import type { Tile } from "../client-types.js";

const stubWindowStorage = (): void => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
};

const createDeps = (me = "me") => ({
  state: {
    me,
    tiles: new Map<string, Tile>(),
    tilesRevision: 0,
    tilesRevisionChangedKeys: new Set<string>(),
    tilesRevisionOverflowed: false,
    incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
    discoveredTiles: new Set<string>(),
    upkeepLastTick: { foodCoverage: 1 },
    mods: { income: 1.0 },
    discoveryTipQueue: [] as DiscoveryTipId[],
    authEmail: "a@example.com"
  },
  keyFor: (x: number, y: number) => `${x},${y}`,
  mergeIncomingTileDetail: (_existing: Tile | undefined, incoming: Tile) => incoming,
  mergeServerTileWithOptimisticState: (tile: Tile) => tile
});

describe("first enemy contact unlocks mustering", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("marks mustering unlocked and enqueues the discovery tip the first time an enemy tile is seen", () => {
    stubWindowStorage();
    const deps = createDeps();

    expect(isMusterUnlocked("a@example.com")).toBe(false);

    applyGatewayTileDeltaBatch(deps, [{ x: 5, y: 5, terrain: "LAND", ownerId: "rival-1", ownershipState: "SETTLED" }]);

    expect(isMusterUnlocked("a@example.com")).toBe(true);
    expect(deps.state.discoveryTipQueue).toContain("ENEMY_EMPIRE");
  });

  it("does not unlock mustering for a newly-seen barbarian tile", () => {
    stubWindowStorage();
    const deps = createDeps();

    applyGatewayTileDeltaBatch(deps, [{ x: 5, y: 5, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "BARBARIAN" }]);

    expect(isMusterUnlocked("a@example.com")).toBe(false);
  });

  it("does not unlock mustering for the player's own tile", () => {
    stubWindowStorage();
    const deps = createDeps("me");

    applyGatewayTileDeltaBatch(deps, [{ x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }]);

    expect(isMusterUnlocked("a@example.com")).toBe(false);
  });

  it("unlocks mustering when a tile already known as neutral flips to a rival owner (not just on first sighting)", () => {
    stubWindowStorage();
    const deps = createDeps();
    // Simulates a tile the player scouted early (already in state.tiles as
    // neutral) that a rival empire later settles — `wasKnown` is true for
    // this delta, so the unlock must not depend on the "newly seen" gate.
    deps.state.tiles.set("5,5", { x: 5, y: 5, terrain: "LAND" });

    applyGatewayTileDeltaBatch(deps, [{ x: 5, y: 5, ownerId: "rival-1", ownershipState: "SETTLED" }]);

    expect(isMusterUnlocked("a@example.com")).toBe(true);
    expect(deps.state.discoveryTipQueue).toContain("ENEMY_EMPIRE");
  });
});

describe("first enemy contact unlocks mustering from the initial bootstrap snapshot", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("unlocks mustering when a rival-owned tile is already visible in the initial state load (e.g. a fresh device with no localStorage flag)", () => {
    stubWindowStorage();
    const deps = createDeps();

    expect(isMusterUnlocked("a@example.com")).toBe(false);

    applyGatewayInitialState(deps, {
      tiles: [{ x: 5, y: 5, terrain: "LAND", ownerId: "rival-1", ownershipState: "SETTLED" }]
    });

    expect(isMusterUnlocked("a@example.com")).toBe(true);
  });

  it("does not unlock mustering from an own or barbarian tile in the initial snapshot", () => {
    stubWindowStorage();
    const deps = createDeps("me");

    applyGatewayInitialState(deps, {
      tiles: [
        { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
        { x: 2, y: 2, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "BARBARIAN" }
      ]
    });

    expect(isMusterUnlocked("a@example.com")).toBe(false);
  });
});
