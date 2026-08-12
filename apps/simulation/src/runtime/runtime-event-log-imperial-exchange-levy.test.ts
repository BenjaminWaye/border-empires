import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";

// §20 of the manpower-economy-rewrite plan: Imperial Exchange Levy hits/casts
// are the second launch event type for the durable per-player event log —
// both sides of the interaction get their own entry (§15/§20).
describe("§20 event log — Imperial Exchange Levy", () => {
  it("appends a hit entry for the victim and a cast entry for the caster", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 0,
            manpower: 10_000,
            techIds: new Set(["exchange-levy"]),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ],
        [
          "player-2",
          {
            id: "player-2",
            name: "Rival",
            isAi: true,
            points: 300,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "IMPERIAL_EXCHANGE", status: "active" }
          },
          {
            x: 1,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
          },
          // Five GEMS tiles: 1 CRYSTAL slot for the Aether Tower, 4 for the
          // Imperial Exchange's own permanent upkeep (§12, bumped from 1 to
          // 4 when it started consuming its 3 Parts on completion) — any
          // fewer would leave the Exchange dormant and the levy rejected.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 8, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 10, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "cmd-levy",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 10, toY: 0 })
    });
    await Promise.resolve();

    const state = runtime.exportState();
    const caster = state.players.find((p) => p.id === "player-1");
    const victim = state.players.find((p) => p.id === "player-2");
    expect(caster?.eventLog).toHaveLength(1);
    expect(caster?.eventLog?.[0]).toMatchObject({ type: "IMPERIAL_EXCHANGE_LEVY_CAST", text: "You levied Rival for 300 gold.", x: 0, y: 0 });
    expect(victim?.eventLog).toHaveLength(1);
    expect(victim?.eventLog?.[0]).toMatchObject({
      type: "IMPERIAL_EXCHANGE_LEVY_HIT",
      text: "You were hit by an Imperial Exchange Levy by player-1 — lost 300 gold.",
      x: 10,
      y: 0
    });
  });
});
