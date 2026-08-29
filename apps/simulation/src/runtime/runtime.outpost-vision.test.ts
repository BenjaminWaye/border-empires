import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";

// A Relay Beacon reveals a flat 5-tile ring around itself (RELAY_BEACON_VISION_BONUS,
// config.ts); Survey Corps's outpostVisionRadiusBonus tech effect adds +1 on
// top for both Light and Siege Outposts. Pins the full-export visibility path
// (backed by VisibilityCoverageCache) for the outpost vision bonus feature —
// see runtime-outpost-vision.ts.

const makePlayer = (id: string, techIds: string[] = [], allies: string[] = []) => ({
  id,
  isAi: false,
  points: 100_000,
  manpower: 100,
  techIds: new Set<string>(techIds),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(allies)
});

const visibleTileKeys = (runtime: SimulationRuntime, playerId: string): Set<string> =>
  new Set(runtime.exportVisibleStateForPlayer(playerId).tiles.map((t) => `${t.x},${t.y}`));

describe("SimulationRuntime outpost vision bonus", () => {
  it("an active Relay Beacon reveals 5 tiles around itself at boot, independent of base radius", () => {
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
            economicStructure: { ownerId: "player-1", type: "RELAY_BEACON" as const, status: "active" as const }
          }
        ],
        activeLocks: []
      }
    });

    const keys = visibleTileKeys(runtime, "player-1");
    expect(keys.has("15,10")).toBe(true); // dx=5, within the flat bonus
    expect(keys.has("16,10")).toBe(false); // dx=6, outside it
  });

  it("building a Siege Outpost on a Relay Beacon tile is rejected — no in-place upgrade — and the beacon's vision bonus is unaffected", async () => {
    vi.useFakeTimers();
    try {
      const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
      for (let x = 0; x <= 20; x += 1) {
        for (let y = 5; y <= 15; y += 1) tiles.push({ x, y, terrain: "LAND" });
      }
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", makePlayer("player-1", ["leatherworking"], [])]]),
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
              economicStructure: { ownerId: "player-1", type: "RELAY_BEACON" as const, status: "active" as const }
            },
            // A free UMBRITE slot — SIEGE_OUTPOST's resource-slot requirement.
            { x: 0, y: 0, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "UMBRITE" as const }
          ],
          activeLocks: []
        }
      });

      expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(true);

      const rejections: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "upgrade-siege-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 0,
        issuedAt: Date.now(),
        type: "BUILD_STRUCTURE" as any,
        payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "SIEGE_OUTPOST" })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("SIEGE_OUTPOST"));
      await Promise.resolve();

      expect(rejections).toEqual([{ code: "BUILD_INVALID", message: "tile already has structure" }]);
      // The Relay Beacon was never replaced, so its flat vision bonus stands.
      expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an ally's Relay Beacon ring is visible to the player, and withdraws when the alliance breaks", async () => {
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
            economicStructure: { ownerId: "player-2", type: "RELAY_BEACON" as const, status: "active" as const }
          }
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

  it("manually disabling an active Relay Beacon drops its vision ring; re-enabling restores it", async () => {
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
            economicStructure: { ownerId: "player-1", type: "RELAY_BEACON" as const, status: "active" as const }
          },
          // Nearby SETTLED town, within TOWN_REACH_RADIUS of the beacon's own
          // tile — keeps the beacon's tile in reach independently of the
          // beacon itself, so disabling it doesn't also unsettle its own
          // ground (reassessBorderOnAnchorDeactivation vacates a tile only
          // when NOTHING covers it, own or rival). Without this, a beacon
          // that is the *sole* anchor over its own tile anywhere would
          // permanently lose that tile the moment it's disabled — this test
          // is about the enable/disable → vision mechanism, not that edge
          // case (see runtime-reach-loss-unsettle.test.ts for that one).
          {
            x: 11,
            y: 11,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const,
            town: { type: "FARMING", populationTier: "TOWN" }
          }
        ],
        activeLocks: []
      }
    });

    expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(true);

    runtime.submitCommand({
      commandId: "disable-outpost",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SET_CONVERTER_STRUCTURE_ENABLED" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, enabled: false })
    });
    await Promise.resolve();

    expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(false);

    runtime.submitCommand({
      commandId: "enable-outpost",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_CONVERTER_STRUCTURE_ENABLED" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, enabled: true })
    });
    await Promise.resolve();

    expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(true);
  });

  it("losing the FOOD tile that was covering a beyond-the-free-5 Relay Beacon drops its vision ring, without the outpost's own tile changing", async () => {
    const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
    for (let x = 0; x <= 20; x += 1) {
      for (let y = 5; y <= 15; y += 1) tiles.push({ x, y, terrain: "LAND" });
    }
    // Five free (waived) Relay Beacons, well out of the way, plus a sixth —
    // the first one that actually draws a FOOD slot — at (10, 10). A single
    // FARM tile supplies exactly the 1 FOOD slot it needs.
    const freeOutposts = [0, 1, 2, 3, 4].map((i) => ({
      x: i,
      y: 20 + i,
      terrain: "LAND" as const,
      ownerId: "player-1",
      ownershipState: "SETTLED" as const,
      economicStructure: { ownerId: "player-1", type: "RELAY_BEACON" as const, status: "active" as const, activatedAt: 100 + i }
    }));
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...tiles,
          ...freeOutposts,
          {
            x: 10,
            y: 10,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const,
            economicStructure: { ownerId: "player-1", type: "RELAY_BEACON" as const, status: "active" as const, activatedAt: 200 }
          },
          // The one FOOD slot that keeps the sixth outpost powered.
          { x: 19, y: 5, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "FARM" as const }
        ],
        activeLocks: []
      }
    });

    expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(true);

    runtime.submitCommand({
      commandId: "abandon-farm",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE" as any,
      payloadJson: JSON.stringify({ x: 19, y: 5 })
    });
    await Promise.resolve();

    // The sixth outpost's own tile never changed — only the FARM tile did —
    // but it's now dormant for lack of a FOOD slot, so its ring is gone.
    expect(visibleTileKeys(runtime, "player-1").has("15,10")).toBe(false);
  });
});
