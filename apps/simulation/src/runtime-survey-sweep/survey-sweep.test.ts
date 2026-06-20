import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";

type SurveySweepPayload = {
  type: "SURVEY_SWEEP_RESULT";
  center: { x: number; y: number };
  halfExtent: number;
  pings: Array<{ x: number; y: number; kind: "resource" | "town" }>;
};

const makePlayer = (id: string, techIds: string[] = []) => ({
  id,
  isAi: false,
  points: 1_000,
  manpower: 1_000,
  techIds: new Set<string>(techIds),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 100, SUPPLY: 0, SHARD: 0 }
});

describe("survey sweep", () => {
  it("returns coarse hidden resource and town pings without revealing visible or specific resource details", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1", ["surveying"])],
        ["player-2", makePlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            observatory: { ownerId: "player-1", status: "active" }
          },
          { x: 2, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "IRON" },
          { x: 25, y: 0, terrain: "LAND", resource: "IRON" },
          { x: 20, y: 20, terrain: "LAND", resource: "GEMS" },
          { x: 21, y: 20, terrain: "LAND", resource: "WOOD" },
          { x: 0, y: 25, terrain: "LAND", resource: "IRON" },
          {
            x: 22,
            y: 20,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "TOWN", name: "Hidden Market" }
          }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    runtime.submitCommand({
      commandId: "survey-sweep-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SURVEY_SWEEP",
      payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
    await Promise.resolve();

    const result = events.find(
      (event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "SURVEY_SWEEP_RESULT"
    );
    expect(result).toBeDefined();
    const payload = JSON.parse(result?.payloadJson ?? "{}") as SurveySweepPayload;
    expect(payload.center).toEqual({ x: 0, y: 0 });
    expect(payload.halfExtent).toBe(25);
    expect(payload.pings).toEqual([
      { x: 25, y: 0, kind: "resource" },
      { x: 20, y: 20, kind: "resource" },
      { x: 21, y: 20, kind: "resource" },
      { x: 0, y: 25, kind: "resource" },
      { x: 22, y: 20, kind: "town" }
    ]);
    expect(payload.pings).not.toContainEqual({ x: 2, y: 0, kind: "resource" });
    expect(JSON.stringify(payload)).not.toContain("GEMS");
    expect(JSON.stringify(payload)).not.toContain("WOOD");

    const state = runtime.exportState();
    const player = state.players.find((entry) => entry.id === "player-1");
    const observatoryTile = state.tiles.find((tile) => tile.x === 0 && tile.y === 0);
    const observatory = observatoryTile?.observatoryJson
      ? JSON.parse(observatoryTile.observatoryJson) as { cooldownUntil?: number }
      : undefined;
    expect(player?.strategicResources.CRYSTAL).toBe(70);
    expect(observatory?.cooldownUntil).toBe(721_000);
  });
});
