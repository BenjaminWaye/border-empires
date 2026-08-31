import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// The client advertises Observatory as granting +5 local vision
// (OBSERVATORY_VISION_BONUS, config.ts — see structure-modifier-catalog-military.ts
// and client-tile-action-detail-text.ts) but nothing in the simulation ever
// applied it: OBSERVATORY_VISION_BONUS was read only for display copy, with
// no equivalent of runtime-outpost-vision.ts's per-tile coverage hookup. This
// pins the fix (runtime-observatory-vision.ts) against the full-export
// visibility path (VisibilityCoverageCache), mirroring runtime.outpost-vision.test.ts.

const makePlayer = (id: string, allies: string[] = []) => ({
  id,
  isAi: false,
  points: 100_000,
  manpower: 100,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(allies)
});

const visibleTileKeys = (runtime: SimulationRuntime, playerId: string): Set<string> =>
  new Set(runtime.exportVisibleStateForPlayer(playerId).tiles.map((t) => `${t.x},${t.y}`));

describe("SimulationRuntime observatory vision bonus", () => {
  it("an active Observatory reveals 5 tiles around itself at boot, independent of base radius", () => {
    // Unlike Relay Beacon (5 free ones before its FOOD-slot waiver runs out —
    // see resource-slot-view.ts), Observatory has no such waiver: it always
    // needs its own CRYSTAL slot, so a GEMS tile is required for it to be
    // active rather than dormant.
    const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
    for (let x = 0; x <= 20; x += 1) {
      for (let y = 5; y <= 15; y += 1) tiles.push({ x, y, terrain: "LAND" });
    }
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...tiles,
          {
            x: 10,
            y: 10,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const,
            observatory: { ownerId: "player-1", status: "active" as const }
          },
          { x: 0, y: 5, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "GEMS" as const }
        ],
        activeLocks: []
      }
    });

    const keys = visibleTileKeys(runtime, "player-1");
    expect(keys.has("15,10")).toBe(true); // dx=5, within the flat bonus
    expect(keys.has("16,10")).toBe(false); // dx=6, outside it
  });

  it("an ally's Observatory ring is visible to the player, and withdraws when the alliance breaks", async () => {
    const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
    for (let x = 20; x <= 40; x += 1) {
      for (let y = 25; y <= 35; y += 1) tiles.push({ x, y, terrain: "LAND" });
    }
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...tiles,
          {
            x: 30,
            y: 30,
            terrain: "LAND" as const,
            ownerId: "player-2",
            ownershipState: "SETTLED" as const,
            observatory: { ownerId: "player-2", status: "active" as const }
          },
          { x: 20, y: 25, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED" as const, resource: "GEMS" as const }
        ],
        activeLocks: []
      }
    });

    const inAreaKeys = () => new Set(runtime.exportTilesInAreaForPlayer("player-1", 30, 30, 6).map((t) => `${t.x},${t.y}`));

    expect(inAreaKeys().has("35,30")).toBe(false);

    runtime.submitCommand({
      commandId: "sync-alliance-on",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: true })
    });
    await Promise.resolve();

    expect(inAreaKeys().has("35,30")).toBe(true);

    runtime.submitCommand({
      commandId: "sync-alliance-off",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: false })
    });
    await Promise.resolve();

    expect(inAreaKeys().has("35,30")).toBe(false);
  });

  it("losing the CRYSTAL supply behind an Observatory drops its vision ring, without the Observatory's own tile changing", async () => {
    const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
    for (let x = 0; x <= 20; x += 1) {
      for (let y = 5; y <= 15; y += 1) tiles.push({ x, y, terrain: "LAND" });
    }
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...tiles,
          {
            x: 10,
            y: 10,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const,
            observatory: { ownerId: "player-1", status: "active" as const }
          },
          // The one CRYSTAL slot that keeps the Observatory powered.
          { x: 19, y: 5, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "GEMS" as const }
        ],
        activeLocks: []
      }
    });

    expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(true);

    runtime.submitCommand({
      commandId: "abandon-gems",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE" as any,
      payloadJson: JSON.stringify({ x: 19, y: 5 })
    });
    await Promise.resolve();

    // The Observatory's own tile never changed — only the GEMS tile did —
    // but it's now dormant for lack of a CRYSTAL slot, so its ring is gone.
    expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(false);
  });
});
