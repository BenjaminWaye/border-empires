import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

/**
 * Regression (persona playtest, achiever): a town dropped out of the empire
 * without anyone capturing it and the Chronicle had no entry for it; its 24h
 * summary still read "0 towns lost". Only a capture used to write a TOWN_LOST
 * card. Every other way a town leaves its owner (here, Abandon Territory) now
 * writes one too, with no captor.
 */
describe("a town that leaves your empire without a captor", () => {
  it("gets a TOWN_LOST card in the personal timeline and counts as a town lost", async () => {
    const nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      scheduleAfter: () => undefined,
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
          { x: 21, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 22, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 23, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Arccrown Battery", type: "FARMING", populationTier: "TOWN", population: 400 } }
        ],
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "abandon-town",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: nowMs,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 23, y: 20 })
    });
    await Promise.resolve();

    expect(events.some((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "abandon-town")).toBe(false);
    expect(runtime.wireDeltaForTileKey("23,20", "player-1")?.ownerId).toBeUndefined();
    const timeline = runtime.getPersonalActivityTimeline("player-1", 0, nowMs + 1);
    expect(timeline.summary.townsLost).toBe(1);
    expect(timeline.cards).toContainEqual(expect.objectContaining({
      kind: "TOWN_LOST", townName: "Arccrown Battery", x: 23, y: 20, townSurvived: true, populationBefore: 400, populationAfter: 400
    }));
    const lost = timeline.cards.find((card) => card.kind === "TOWN_LOST");
    expect(lost && "counterpartyPlayerId" in lost ? lost.counterpartyPlayerId : undefined).toBeUndefined();
  });
});
