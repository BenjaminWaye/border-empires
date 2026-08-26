import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Regression coverage for the reach-border "vacate on deactivation" change
// (packages/shared/src/reach/reach.ts, reassessBorderOnAnchorDeactivation):
// disabling/losing an anchor no longer leaves ground it uniquely covered
// sticky forever — a SETTLED tile out there downgrades back to FRONTIER once
// nothing (own or rival) covers it. This includes the anchor's own founding
// tile: a disk always covers itself, so an anchor that is the *sole* cover
// over its own tile anywhere unsettles that tile too when it deactivates —
// no special-cased exemption. Recovery requires extending reach back over
// the tile from elsewhere (another anchor, or expanding in from adjacent
// territory) before it can be SETTLEd again; a fully isolated outpost with
// nothing else nearby has no such "elsewhere" and is lost for good.

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 100_000,
  manpower: 1_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const ownershipOf = (runtime: SimulationRuntime, x: number, y: number) =>
  runtime.exportState().tiles.find((tile) => tile.x === x && tile.y === y);

describe("SimulationRuntime — reach loss unsettles ground, including the anchor's own tile", () => {
  it("disabling the sole Relay Beacon covering a distant SETTLED tile downgrades it to FRONTIER, and the beacon's own tile too", async () => {
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
          // Within OUTPOST_REACH_RADIUS (5) of the beacon, and nothing else
          // (no town, no rival) ever covers it.
          { x: 14, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const }
        ],
        activeLocks: []
      }
    });

    expect(ownershipOf(runtime, 14, 10)).toMatchObject({ ownerId: "player-1", ownershipState: "SETTLED" });
    expect(ownershipOf(runtime, 10, 10)).toMatchObject({ ownerId: "player-1", ownershipState: "SETTLED" });

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

    // Both the peripheral tile AND the beacon's own tile fell entirely out
    // of reach (nothing else covers either one) and unsettle.
    expect(ownershipOf(runtime, 14, 10)).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(ownershipOf(runtime, 10, 10)).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
  });

  it("a beacon still covered by a nearby town keeps its own tile SETTLED when disabled", async () => {
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
          // Within TOWN_REACH_RADIUS (3) of the beacon's own tile — an
          // independent anchor still covers it after the beacon deactivates.
          { x: 11, y: 11, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, town: { type: "FARMING", populationTier: "TOWN" } }
        ],
        activeLocks: []
      }
    });

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

    expect(ownershipOf(runtime, 10, 10)).toMatchObject({ ownerId: "player-1", ownershipState: "SETTLED" });
  });
});
