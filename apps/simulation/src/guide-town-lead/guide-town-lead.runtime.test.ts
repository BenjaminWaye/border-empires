import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

type Town = { name: string; type: "MARKET"; populationTier: "SETTLEMENT" | "TOWN"; goldPerMinute?: number };
const town = (name: string, populationTier: Town["populationTier"]): Town => ({ name, type: "MARKET", populationTier, goldPerMinute: 1 });

// Playtest Run 4: the guide needs to know where a real town is to point a townless House's drone at it.
describe("guide town lead on PLAYER_UPDATE", () => {
  const leadAfterIncome = (ownTownTier: Town["populationTier"], isAi = false): unknown => {
    const runtime = new SimulationRuntime({ now: () => 100_000, initialPlayers: new Map([["p", buildPlayer("p", { isAi })]]), seedTiles: new Map(), initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", afc: { ownerId: "p", status: "active", activatedAt: 0 } },
        { x: 11, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: town("Home", ownTownTier) },
        { x: 40, y: 10, terrain: "LAND", town: town("Far", "TOWN") },
        { x: 25, y: 10, terrain: "LAND", town: town("Near", "TOWN") }
      ],
      activeLocks: []
    } });
    const events = collectEvents(runtime);
    runtime.applyPassiveIncome(100_000 - 15_000, Number.MAX_SAFE_INTEGER);
    runtime.applyPassiveIncome(100_000, Number.MAX_SAFE_INTEGER);
    const update = events
      .filter((event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> => event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE" && event.playerId === "p")
      .at(-1);
    return update ? (JSON.parse(update.payloadJson) as { guideTownLead?: unknown }).guideTownLead : "no PLAYER_UPDATE";
  };

  it("sends the nearest unowned town while the player's only town is their landing settlement", () => {
    expect(leadAfterIncome("SETTLEMENT")).toEqual({ x: 25, y: 10 });
  });

  // Review of PR #2933: PLAYER_UPDATE runs for AI players too; they never read the guide, so they skip the scan.
  it("sends no lead to an AI player", () => {
    expect(leadAfterIncome("SETTLEMENT", true)).toBeNull();
  });

  it("sends null once the player holds a town, so the client drops its lead", () => {
    expect(leadAfterIncome("TOWN")).toBeNull();
  });
});
