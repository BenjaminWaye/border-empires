import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";

type Seen = { eventType: string; commandId: string; playerId: string; code?: string };

// Regression coverage for the "Build Relay Beacon logout" bug: a composite
// settle(+build) order that used to live purely in client-side in-memory
// bookkeeping (autoSettleTargets/autoBuildTargets + the client tick loop)
// now also registers server-side (CLAIM_CONTINUATION_SET), so it completes
// even if the player disconnects and never calls the client tick loop again.
describe("claim continuation (server-durable settle+build tail)", () => {
  it("drives SETTLE then BUILD to completion purely from the server after a winning EXPAND lands -- no client tick loop involved", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 11, y: 10, terrain: "LAND" } // unowned frontier target of the EXPAND
        ],
        activeLocks: []
      }
    });
    const seen: Seen[] = [];
    runtime.onEvent((event) => seen.push(event as SimulationEvent as unknown as Seen));

    // 1. Click "Build Relay Beacon" on the unclaimed tile -- fires EXPAND immediately...
    runtime.submitCommand({
      commandId: "expand-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    // ...and registers the server-durable continuation alongside it.
    runtime.submitCommand({
      commandId: "claim-continuation-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "CLAIM_CONTINUATION_SET",
      payloadJson: JSON.stringify({ x: 11, y: 10, structureType: "RELAY_BEACON" })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "claim-continuation-1" }));

    // 2. Player disconnects right here -- nothing further is sent from a
    // client, and the client's own tick loop (processAutoSettleTargets /
    // processAutoBuildTargets) is never called again in this test. Only the
    // scheduled server-side lock-resolution task below drives the rest.
    const expandResolution = scheduledTasks.find((t) => t.delayMs > 0);
    expect(expandResolution).toBeDefined();
    expandResolution!.task();
    await Promise.resolve();

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 11, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" })
    );

    // 3. The EXPAND landing should have queued (and, since a dev slot was
    // free, immediately dispatched) the SETTLE -- find and fire its
    // scheduled completion, again with no client involvement.
    const settleResolution = scheduledTasks.find((t) => t.delayMs === 60_000);
    expect(settleResolution).toBeDefined();
    settleResolution!.task();
    await Promise.resolve();

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 11, y: 10, ownerId: "player-1", ownershipState: "SETTLED" })
    );

    // 4. The BUILD should have followed automatically once SETTLE completed
    // -- structure construction started, purely server-driven throughout.
    const builtTile = runtime.exportState().tiles.find((t) => t.x === 11 && t.y === 10);
    expect(builtTile?.economicStructureJson).toBeTruthy();
    expect(JSON.parse(builtTile!.economicStructureJson!)).toEqual(
      expect.objectContaining({ type: "RELAY_BEACON", ownerId: "player-1" })
    );
  });

  it("drives SETTLE then BUILD immediately when the tile is already owned+FRONTIER (no EXPAND in flight)", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: Seen[] = [];
    runtime.onEvent((event) => seen.push(event as SimulationEvent as unknown as Seen));

    runtime.submitCommand({
      commandId: "claim-continuation-owned",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CLAIM_CONTINUATION_SET",
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "RELAY_BEACON" })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "claim-continuation-owned" }));

    const settleResolution = scheduledTasks.find((t) => t.delayMs === 60_000);
    expect(settleResolution).toBeDefined();
    settleResolution!.task();
    await Promise.resolve();

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" })
    );
    const settledTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(settledTile?.economicStructureJson).toBeTruthy();
    expect(JSON.parse(settledTile!.economicStructureJson!)).toEqual(
      expect.objectContaining({ type: "RELAY_BEACON", ownerId: "player-1" })
    );
  });

  // Regression for the "settle + build relay beacon settles but never builds"
  // bug. Every other test in this file leaves the player offline
  // (isPlayerSubscribed defaults to false), which hides the failure: offline,
  // tryDrainDevQueue pops and dispatches the SETTLE entry that
  // handleClaimContinuationSetCommand enqueued, so the entry is consumed and
  // the build tail later finds a clear queue for that tileKey.
  //
  // Online, the drain stands down (an active client owns the queue), so that
  // SETTLE entry is never popped -- while the settlement itself proceeds down
  // a completely different path, because the real client fires
  // requestSettlement directly alongside CLAIM_CONTINUATION_SET (see
  // client-action-flow.ts's handleBuildAction). The entry is orphaned from
  // birth, and since devQueueEnqueue de-dupes by tileKey regardless of kind,
  // it then blocks the build tail's own BUILD enqueue -- which leaves the
  // continuation registered forever and nothing ever built.
  it("completes the settle+build tail while the player stays online", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      isPlayerSubscribed: () => true,
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });

    // Exactly what the client sends on "Settle and Build Relay Beacon":
    // the server-durable continuation, then the settle itself.
    runtime.submitCommand({
      commandId: "claim-continuation-online",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CLAIM_CONTINUATION_SET",
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "RELAY_BEACON" })
    });
    runtime.submitCommand({
      commandId: "settle-online",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();

    const settleResolution = scheduledTasks.find((t) => t.delayMs === 60_000);
    expect(settleResolution).toBeDefined();
    settleResolution!.task();
    await Promise.resolve();

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" })
    );
    const settledTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(settledTile?.economicStructureJson).toBeTruthy();
    expect(JSON.parse(settledTile!.economicStructureJson!)).toEqual(
      expect.objectContaining({ type: "RELAY_BEACON", ownerId: "player-1" })
    );
  });

  // The online drain stands down on client-origin entries rather than
  // dispatching them, so it has to *scan* for the first server-origin entry
  // instead of only ever considering the head -- otherwise a single
  // client-queued item parked in front strands the build tail for as long as
  // the player stays connected, which is the same silent stall in a new coat.
  it("drains a server-origin build tail queued behind a client-origin entry while online, leaving that entry alone", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      isPlayerSubscribed: () => true,
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 8, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const summary = (runtime as unknown as {
      summaryForPlayer: (playerId: string) => { devQueue: Array<{ tileKey: string; x: number; y: number; kind: string; queuedAt: number; origin?: string }> };
    }).summaryForPlayer("player-1");

    runtime.submitCommand({
      commandId: "claim-continuation-behind-client-entry",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CLAIM_CONTINUATION_SET",
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "RELAY_BEACON" })
    });
    runtime.submitCommand({
      commandId: "settle-behind-client-entry",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();

    // A build the online client owns and will dispatch itself, sitting ahead
    // of the tail in the queue. The server must skip it, not drain it.
    summary.devQueue.unshift({ tileKey: "8,10", x: 8, y: 10, kind: "SETTLE", queuedAt: 1_000 });

    const settleResolution = scheduledTasks.find((t) => t.delayMs === 60_000);
    expect(settleResolution).toBeDefined();
    settleResolution!.task();
    await Promise.resolve();

    const settledTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(JSON.parse(settledTile!.economicStructureJson!)).toEqual(
      expect.objectContaining({ type: "RELAY_BEACON", ownerId: "player-1" })
    );
    // Untouched: (8,10) is still FRONTIER and still queued, because dispatching
    // it is the online client's job, not ours.
    expect(summary.devQueue).toContainEqual(expect.objectContaining({ tileKey: "8,10", kind: "SETTLE" }));
    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 8, y: 10, ownershipState: "FRONTIER" })
    );
  });

  it("drives BUILD directly with no SETTLE step for the siege ladder (structureSkipsSettledRequirement), even on an owned FRONTIER tile with no EXPAND in flight", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 100, SHARD: 0 }
      }]]),
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 8, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
          // A resource tile so structureShowsOnTile's "resource" visibility
          // rule is satisfied on FRONTIER ground (SIEGE_OUTPOST otherwise
          // only shows on settled/town/support/dock tiles).
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "IRON" }
        ],
        activeLocks: []
      }
    });
    const seen: Seen[] = [];
    runtime.onEvent((event) => seen.push(event as SimulationEvent as unknown as Seen));

    runtime.submitCommand({
      commandId: "claim-continuation-siege",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CLAIM_CONTINUATION_SET",
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "SIEGE_OUTPOST" })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "claim-continuation-siege" }));

    // No SETTLE ever ran -- the tile stays FRONTIER (a SETTLE would have
    // flipped it to SETTLED) and the siege outpost starts construction
    // immediately, synchronously off the CLAIM_CONTINUATION_SET command
    // itself, with no intervening scheduled step to fire.
    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.ownershipState).toBe("FRONTIER");
    expect(tile?.siegeOutpostJson).toContain('"status":"under_construction"');
  });

  // Regression for the "settle completes, tile shows no construction until
  // reselected" bug: resolvePendingSettlement used to build its own
  // TILE_DELTA_BATCH from a settledTile object captured *before* the
  // claim-continuation build tail ran. Since tileDeltaFromState always
  // serializes every overlay field (even as undefined, to distinguish
  // "untouched" from "explicitly cleared"), that stale delta shipped
  // economicStructureJson: undefined *after* the build tail's own delta had
  // already shipped it populated -- wiping the client's view of the
  // in-progress structure until a fresh REQUEST_TILE_DETAIL fetch corrected it.
  it("does not emit a TILE_DELTA_BATCH that clears economicStructure after the build tail already set it", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const tileDeltaBatches: Array<{ commandId: string; economicStructureJson: unknown }> = [];
    runtime.onEvent((event) => {
      if (event.eventType !== "TILE_DELTA_BATCH") return;
      // Reach-owner-change broadcasts (runtime-reach-update/runtime-reach-contested-flush.ts,
      // commandId-prefixed "reach-contested:") can also touch (10,10) independently of the
      // settle/build-tail flow this test is exercising — e.g. before the build tail has set
      // economicStructure — and legitimately carry no economicStructureJson. Excluding them
      // keeps this test scoped to what it actually asserts: the SETTLE-continuation's own
      // delta must not carry an explicit clear.
      if (event.commandId.startsWith("reach-contested:")) return;
      for (const delta of event.tileDeltas) {
        if (delta.x === 10 && delta.y === 10) {
          tileDeltaBatches.push({ commandId: event.commandId, economicStructureJson: delta.economicStructureJson });
        }
      }
    });

    runtime.submitCommand({
      commandId: "claim-continuation-race",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CLAIM_CONTINUATION_SET",
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "RELAY_BEACON" })
    });
    await Promise.resolve();

    const settleResolution = scheduledTasks.find((t) => t.delayMs === 60_000);
    expect(settleResolution).toBeDefined();
    settleResolution!.task();
    await Promise.resolve();

    // The SETTLE's own delta (identified by the settle-continuation command)
    // must not carry an explicit clear of economicStructure now that the
    // build tail has started a structure on this tile in the same turn.
    expect(tileDeltaBatches.length).toBeGreaterThan(0);
    for (const batch of tileDeltaBatches) {
      expect(batch.economicStructureJson).toBeTruthy();
    }
  });

  // Regression for the "restart mid-settle+build drops the build" bug: the
  // cold-restart recovery path (SimulationRuntime constructor, initialState
  // .pendingSettlements) re-schedules and completes a SETTLE that was still
  // pending when the process last restarted, but used to duplicate
  // resolvePendingSettlement's tile-mutation logic without ever calling
  // tryDrainClaimContinuationBuildTail -- so a "Settle and Build X" combo
  // whose SETTLE step survived the restart would complete settlement but
  // silently drop the queued BUILD, leaving the tile permanently SETTLED
  // with nothing built and no error surfaced to the player.
  //
  // claimContinuations isn't itself persisted across a restart today (a
  // separate, pre-existing gap), so this test pokes the recovered player's
  // in-memory summary directly to reproduce the state a real restart would
  // need to hit this path: a pending settlement recovered from
  // initialState, plus a registered claim continuation for the same tile.
  it("drains the claim-continuation build tail when a pending settlement resolves after a cold restart", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 10_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: [],
        pendingSettlements: [
          {
            ownerId: "player-1",
            tileKey: "10,10",
            startedAt: 5_000,
            resolvesAt: 70_000,
            goldCost: 3,
            commandId: "settle-before-restart"
          }
        ]
      }
    });

    (runtime as unknown as {
      summaryForPlayer: (playerId: string) => { claimContinuations: Map<string, { structureType?: string }> };
    }).summaryForPlayer("player-1").claimContinuations.set("10,10", { structureType: "RELAY_BEACON" });

    const recoveredSettleResolution = scheduledTasks.find((t) => t.delayMs === 60_000);
    expect(recoveredSettleResolution).toBeDefined();
    recoveredSettleResolution!.task();
    await Promise.resolve();

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" })
    );
    const settledTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(settledTile?.economicStructureJson).toBeTruthy();
    expect(JSON.parse(settledTile!.economicStructureJson!)).toEqual(
      expect.objectContaining({ type: "RELAY_BEACON", ownerId: "player-1" })
    );
  });
});
