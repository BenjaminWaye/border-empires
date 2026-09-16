import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";

type Seen = { eventType: string; commandId: string; playerId: string; code?: string };

// Claim-continuation behaviour specific to a player who stays *connected*.
// Split out of runtime.claim-continuation.test.ts (at the 500-line cap); that
// file covers the offline/durability side, where the server drain owns the
// dev queue. Online the client owns it instead, which is a different enough
// set of rules -- and was the blind spot that let the "settle + build settles
// but never builds" bug ship green.
describe("claim continuation while the player is online", () => {
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

  // A placement-overlay structure (FOUNDRY/WATERWORKS) is dispatched by the
  // client once the player picks the exact tile, which may not be the tile
  // that was settled. Queueing a build tail for it while they're online would
  // leave an entry keyed to the settled tile that drains on logout and puts up
  // a structure at coordinates the player may have explicitly declined.
  // Offline there's no overlay to answer it, so the best-effort build stays.
  it("leaves placement-overlay builds to an online client, but still queues them offline", async () => {
    const runFoundrySettleBuild = async (online: boolean) => {
      const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledTasks.push({ delayMs, task });
        },
        isPlayerSubscribed: () => online,
        initialState: {
          tiles: [
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });
      const summary = (runtime as unknown as {
        summaryForPlayer: (playerId: string) => { devQueue: Array<{ tileKey: string; kind: string }>; claimContinuations: Map<string, { structureType?: string }> };
      }).summaryForPlayer("player-1");
      const commandIds: string[] = [];
      runtime.onEvent((event) => commandIds.push((event as SimulationEvent as unknown as Seen).commandId));

      runtime.submitCommand({
        commandId: `claim-continuation-foundry-${online}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "CLAIM_CONTINUATION_SET",
        payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "FOUNDRY" })
      });
      runtime.submitCommand({
        commandId: `settle-foundry-${online}`,
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
      return { summary, commandIds };
    };

    // Online: the client owns the placement, so no build is queued or
    // dispatched against the settled tile to fire behind the player's back.
    const online = await runFoundrySettleBuild(true);
    expect(online.summary.devQueue.filter((entry) => entry.tileKey === "10,10" && entry.kind === "BUILD")).toEqual([]);
    expect(online.summary.claimContinuations.has("10,10")).toBe(false);
    expect(online.commandIds.some((id) => id?.includes("dev-queue-drain"))).toBe(false);

    // Offline: no overlay can answer, so the best-effort build on the settled
    // tile is still queued and dispatched, exactly as before.
    const offline = await runFoundrySettleBuild(false);
    expect(offline.commandIds.some((id) => id?.includes("dev-queue-drain"))).toBe(true);
  });

});
