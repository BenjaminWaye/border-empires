import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// RETORT_RECAST (Manifest plan §7 item 9): rewrites an owned resource tile's
// kind into a different industrial class. Previously had a full client UI
// (target picker, FX layer, 20-min cooldown) but no server handler anywhere,
// so the command was silently dropped -- see docs/manifest-retort-recast-plan.md.
describe("RETORT_RECAST", () => {
  const baseState = (): Array<Record<string, unknown>> => [
    { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
    // §5.4: CRYSTAL supply so player-1's Observatory isn't dormant.
    { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
    // Target: an owned FARM tile within the caster's observatory range.
    { x: 2, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
  ];

  it("recasts an owned resource tile into a different class, including Umbrite", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["matterwright-retort"]), strategicResources: { CRYSTAL: 500 } })]
      ]),
      initialState: { tiles: baseState() as never, activeLocks: [] }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "retort-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "RETORT_RECAST",
      payloadJson: JSON.stringify({ x: 2, y: 0, targetResource: "UMBRITE" })
    });
    await Promise.resolve();

    expect(events.some((event) => event.eventType === "COMMAND_REJECTED")).toBe(false);
    expect(events.some((event) => event.eventType === "COMMAND_RESOLVED" && event.commandId === "retort-1")).toBe(true);

    const state = runtime.exportState();
    const targetTile = state.tiles.find((tile) => tile.x === 2 && tile.y === 0);
    expect(targetTile?.resource).toBe("UMBRITE");
  });

  it("rejects without the Matterwright Retort Module", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, strategicResources: { CRYSTAL: 500 } })]
      ]),
      initialState: { tiles: baseState() as never, activeLocks: [] }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "retort-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "RETORT_RECAST",
      payloadJson: JSON.stringify({ x: 2, y: 0, targetResource: "UMBRITE" })
    });
    await Promise.resolve();

    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "retort-2",
      code: "RETORT_RECAST_INVALID",
      message: "requires Matterwright Retort Module"
    }));
  });

  it("rejects recasting a tile into its own resource class", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["matterwright-retort"]), strategicResources: { CRYSTAL: 500 } })]
      ]),
      initialState: { tiles: baseState() as never, activeLocks: [] }
    });
    const events = collectEvents(runtime);

    // FARM's target tile is already "food" class, and so is FISH -- recasting
    // FARM -> FARM should reject the same as any other same-class no-op.
    runtime.submitCommand({
      commandId: "retort-3",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "RETORT_RECAST",
      payloadJson: JSON.stringify({ x: 2, y: 0, targetResource: "FARM" })
    });
    await Promise.resolve();

    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "retort-3",
      code: "RETORT_RECAST_INVALID",
      message: "already that resource class"
    }));
  });
});
