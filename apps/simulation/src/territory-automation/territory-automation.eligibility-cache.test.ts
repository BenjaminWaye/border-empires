import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { orderedAutoSettlementTileKeys } from "./territory-automation.js";

/**
 * 2026-07-29 login-stall investigation: hasTownSupport is an 8-neighbor scan
 * and was being re-run for every frontier tile on every single rebuild, even
 * for tiles whose eligibility hadn't changed. orderedAutoSettlementTileKeys
 * now accepts an optional read-through eligibilityCache (owned/TTL-managed
 * by the caller) so a cache hit skips the hasTownSupport call entirely.
 */

const resourceTile = (x: number, y: number, playerId: string): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: playerId, ownershipState: "FRONTIER", resource: "FARM"
});

const plainFrontierTile = (x: number, y: number, playerId: string): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: playerId, ownershipState: "FRONTIER"
});

describe("orderedAutoSettlementTileKeys — eligibility cache", () => {
  it("skips hasTownSupport on a cache hit and reuses the stored result", () => {
    const tiles = new Map<string, DomainTileState>([
      ["0,0", plainFrontierTile(0, 0, "player-1")]
    ]);
    const cacheStore = new Map<string, boolean>();
    let hasTownSupportCalls = 0;
    const deps = {
      getTile: (tileKey: string) => tiles.get(tileKey),
      isBlocked: () => false,
      hasTownSupport: () => {
        hasTownSupportCalls += 1;
        return false;
      },
      isRevealedToPlayer: () => true,
      eligibilityCache: {
        get: (tileKey: string) => cacheStore.get(tileKey),
        set: (tileKey: string, eligible: boolean) => { cacheStore.set(tileKey, eligible); }
      }
    };

    const first = orderedAutoSettlementTileKeys("player-1", ["0,0"], deps);
    expect(first).toEqual([]); // no resource/town/dockId, hasTownSupport returned false
    expect(hasTownSupportCalls).toBe(1);

    const second = orderedAutoSettlementTileKeys("player-1", ["0,0"], deps);
    expect(second).toEqual([]);
    // Cache hit — must NOT re-run the expensive neighbor scan.
    expect(hasTownSupportCalls).toBe(1);
  });

  it("never calls hasTownSupport when the tile is cheaply eligible via resource/town/dockId, but still requires resources to be revealed", () => {
    const tiles = new Map<string, DomainTileState>([
      ["1,1", resourceTile(1, 1, "player-1")]
    ]);
    let hasTownSupportCalls = 0;
    const baseDeps = {
      getTile: (tileKey: string) => tiles.get(tileKey),
      isBlocked: () => false,
      hasTownSupport: () => { hasTownSupportCalls += 1; return false; }
    };

    const revealed = orderedAutoSettlementTileKeys("player-1", ["1,1"], { ...baseDeps, isRevealedToPlayer: () => true });
    expect(revealed).toEqual(["1,1"]);
    expect(hasTownSupportCalls).toBe(0); // short-circuited by tile.resource

    const unrevealed = orderedAutoSettlementTileKeys("player-1", ["1,1"], { ...baseDeps, isRevealedToPlayer: () => false });
    expect(unrevealed).toEqual([]); // resource tile not yet revealed to the player must not auto-settle
    expect(hasTownSupportCalls).toBe(0);
  });

  it("always checks isBlocked fresh even when eligibility is cached (locks/pending settlements are transient)", () => {
    const tiles = new Map<string, DomainTileState>([
      ["2,2", plainFrontierTile(2, 2, "player-1")]
    ]);
    const cacheStore = new Map<string, boolean>();
    let blocked = false;
    const deps = {
      getTile: (tileKey: string) => tiles.get(tileKey),
      isBlocked: () => blocked,
      hasTownSupport: () => true,
      isRevealedToPlayer: () => true,
      eligibilityCache: {
        get: (tileKey: string) => cacheStore.get(tileKey),
        set: (tileKey: string, eligible: boolean) => { cacheStore.set(tileKey, eligible); }
      }
    };

    expect(orderedAutoSettlementTileKeys("player-1", ["2,2"], deps)).toEqual(["2,2"]);

    blocked = true;
    // Even though eligibility is cached as true, a fresh lock must still
    // exclude the tile from this call's result.
    expect(orderedAutoSettlementTileKeys("player-1", ["2,2"], deps)).toEqual([]);

    blocked = false;
    expect(orderedAutoSettlementTileKeys("player-1", ["2,2"], deps)).toEqual(["2,2"]);
  });

  it("without an eligibilityCache, behaves exactly as before (always re-evaluates)", () => {
    const tiles = new Map<string, DomainTileState>([
      ["3,3", plainFrontierTile(3, 3, "player-1")]
    ]);
    let hasTownSupportCalls = 0;
    const deps = {
      getTile: (tileKey: string) => tiles.get(tileKey),
      isBlocked: () => false,
      hasTownSupport: () => { hasTownSupportCalls += 1; return true; },
      isRevealedToPlayer: () => true
    };
    orderedAutoSettlementTileKeys("player-1", ["3,3"], deps);
    orderedAutoSettlementTileKeys("player-1", ["3,3"], deps);
    expect(hasTownSupportCalls).toBe(2);
  });
});
