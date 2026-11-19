import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { TOWN_RETURN_WINDOW_MS } from "@border-empires/shared";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// SETTLE_DIPLOMACY_TERMS with a "return a town" term: the town the
// proposer captured from the target goes back to the target in the same
// step as the coin, and the new owner survives a restart either way the
// simulation restores (checkpoint, or checkpoint + replayed events).
const NOW = 10 * 60 * 60_000;
const TOWN = { x: 4, y: 4 };

const townTile = (ownerId: string, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  ...TOWN, terrain: "LAND", ownerId, ownershipState: "FRONTIER", captureHoldUntil: NOW + 60_000,
  town: { name: "Oakridge", type: "FARMING", populationTier: "TOWN", population: 900 },
  fort: { ownerId, status: "active", activatedAt: 0 },
  ...extra
});

const captured = (capturedAt: number, from = "player-2") => ({
  id: `town-captured:${capturedAt}`, kind: "TOWN_CAPTURED" as const, playerId: "player-1", occurredAt: capturedAt, ...TOWN,
  townName: "Oakridge", townTier: "TOWN" as const, townSurvived: true, populationBefore: 1_000, populationAfter: 900,
  capturedStructureTypes: [], counterpartyPlayerId: from
});

const world = (options: { capturedAt?: number; from?: string; tile?: DomainTileState } = {}) => {
  const runtime = new SimulationRuntime({
    now: () => NOW,
    seedTiles: new Map(),
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 100 })],
      ["player-2", buildPlayer("player-2", { points: 100 })]
    ]),
    initialState: {
      tiles: [
        options.tile ?? townTile("player-1"),
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 9, y: 9, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
      ],
      activeLocks: []
    }
  });
  runtime.restoreActivityLogs({ territory: [], combat: [], personalImpacts: [captured(options.capturedAt ?? NOW - 60_000, options.from)] } as never);
  return runtime;
};

const settle = async (runtime: SimulationRuntime, payload: Record<string, unknown>, commandId = "diplomacy-settle:towns") => {
  runtime.submitCommand({
    commandId, sessionId: "system-runtime:social", playerId: "player-2", clientSeq: 0, issuedAt: NOW,
    type: "SETTLE_DIPLOMACY_TERMS", payloadJson: JSON.stringify({ proposerId: "player-1", targetId: "player-2", ...payload })
  });
  await Promise.resolve();
};
const returnTown = { proposerPays: { gold: 10, towns: [TOWN] }, targetPays: { gold: 0 } };
const tileAt = (runtime: SimulationRuntime) => runtime.exportState().tiles.find((tile) => tile.x === TOWN.x && tile.y === TOWN.y);
const points = (runtime: SimulationRuntime, id: string) => runtime.exportState().players.find((player) => player.id === id)?.points;

describe("simulation runtime — returning a captured town in a deal", () => {
  it("lists the town as returnable to the empire it was taken from", () => {
    const runtime = world();
    expect(runtime.getPlayerTradeHoldings("player-1")?.returnableTowns).toEqual([
      expect.objectContaining({ ...TOWN, toPlayerId: "player-2", name: "Oakridge", tier: "TOWN", capturedAt: NOW - 60_000 })
    ]);
    expect(runtime.getPlayerTradeHoldings("player-2")?.returnableTowns).toEqual([]);
  });

  it("hands the town back settled, with its structures, in the same step as the coin", async () => {
    const runtime = world();
    const events = collectEvents(runtime);
    await settle(runtime, returnTown);

    expect(events.map((event) => event.eventType)).toContain("COMMAND_RESOLVED");
    const tile = tileAt(runtime);
    expect(tile).toMatchObject({ ownerId: "player-2", ownershipState: "SETTLED" });
    expect(tile?.captureHoldUntil).toBeUndefined();
    expect(JSON.parse(tile?.fortJson ?? "{}")).toMatchObject({ ownerId: "player-2", status: "active" });
    expect(JSON.parse(tile?.townJson ?? "{}")).toMatchObject({ name: "Oakridge", population: 900 });
    expect(points(runtime, "player-1")).toBe(90);
    expect(points(runtime, "player-2")).toBe(110);
    // Returned once, it is no longer the giver's to return.
    expect(runtime.getPlayerTradeHoldings("player-1")?.returnableTowns).toEqual([]);
  });

  it("rejects the whole deal, coin included, when the town wasn't taken from them recently", async () => {
    for (const options of [{ capturedAt: NOW - TOWN_RETURN_WINDOW_MS - 1 }, { from: "player-3" }]) {
      const runtime = world(options);
      const events = collectEvents(runtime);
      await settle(runtime, returnTown);
      expect(events.find((event) => event.eventType === "COMMAND_REJECTED")).toMatchObject({ message: "the town at (4, 4) wasn't taken from them in the last day" });
      expect(tileAt(runtime)?.ownerId).toBe("player-1");
      expect(points(runtime, "player-1")).toBe(100);
    }
  });

  it("rejects the deal when the giver no longer holds the town", async () => {
    const runtime = world({ tile: townTile("player-3") });
    const events = collectEvents(runtime);
    await settle(runtime, returnTown);
    expect(events.find((event) => event.eventType === "COMMAND_REJECTED")).toMatchObject({ message: "player-1 no longer holds the town at (4, 4)" });
    expect(points(runtime, "player-2")).toBe(100);
  });

  it("pays a fell-through deal back: a refund returns the town without the capture check", async () => {
    const runtime = world();
    await settle(runtime, returnTown);
    await settle(runtime, { proposerPays: { gold: 0 }, targetPays: { gold: 10, towns: [TOWN] }, refund: true }, "diplomacy-settle:refund");
    expect(tileAt(runtime)).toMatchObject({ ownerId: "player-1", ownershipState: "SETTLED" });
    expect(points(runtime, "player-1")).toBe(100);
  });

  it("keeps the returned town across a restart from the checkpoint", async () => {
    const runtime = world();
    await settle(runtime, returnTown);
    const restarted = new SimulationRuntime({ now: () => NOW + 1, seedTiles: new Map(), initialState: runtime.exportSnapshotSections().initialState });
    expect(tileAt(restarted)).toMatchObject({ ownerId: "player-2", ownershipState: "SETTLED" });
    expect(JSON.parse(tileAt(restarted)?.townJson ?? "{}")).toMatchObject({ name: "Oakridge" });
  });

  it("keeps the returned town when recovery replays the settlement's events onto an older checkpoint", async () => {
    const runtime = world();
    const checkpoint = runtime.exportState();
    const events = collectEvents(runtime);
    await settle(runtime, returnTown);
    const recovered = applySimulationEventsToRecoveredState(checkpoint, events);
    expect(recovered.tiles.find((tile) => tile.x === TOWN.x && tile.y === TOWN.y)).toMatchObject({ ownerId: "player-2", ownershipState: "SETTLED" });
  });
});
