import { describe, expect, it } from "vitest";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  handleWaypointEnqueueCommand,
  tryDrainWaypointQueue,
  type RuntimeWaypointQueueCommandContext
} from "./runtime-waypoint-queue-command-handlers.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

const PLAYER_ID = "player-1";

function makeSummary(): PlayerRuntimeSummary {
  return {
    territoryTileKeys: new Set(),
    frontierTileKeys: new Set(),
    hotFrontierTileKeys: new Set(),
    strategicFrontierTileKeys: new Set(),
    buildCandidateTileKeys: new Set(),
    settledTileCount: 0,
    townCount: 0,
    ownedTownTierByTile: new Map(),
    goldIncomePerMinute: 0,
    strategicProductionPerMinute: { TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0, FOOD: 0 },
    activeDevelopmentProcessCount: 0,
    pendingSettlementsByTile: new Map(),
    fishFoodPerMinute: 0,
    lastActiveAtMs: 0,
    devQueue: [],
    waypointQueue: [],
    claimContinuations: new Map()
  };
}

type MakeContextOptions = {
  tiles?: Map<string, DomainTileState>;
  // Maps a "should this dispatch succeed" decision per (x,y); default true.
  dispatchResultFor?: (x: number, y: number, actionType: FrontierCommandType) => boolean;
  // Rejection code to report when dispatchResultFor returns false; defaults
  // to a non-retryable code so existing "drop and move on" tests keep their
  // meaning without having to specify one.
  rejectionCode?: string;
  // Defaults to false (offline) -- the drain's whole purpose is offline
  // continuation, so that's the meaningful default for these tests. See the
  // dedicated "does not drain while the player is online" test below.
  isPlayerOnline?: boolean;
};

function makeContext(options: MakeContextOptions = {}) {
  const summary = makeSummary();
  const tiles = options.tiles ?? new Map<string, DomainTileState>();
  const events: SimulationEvent[] = [];
  const rejections: { code: string; message: string }[] = [];
  const dispatched: { command: CommandEnvelope; actionType: FrontierCommandType }[] = [];

  const context: RuntimeWaypointQueueCommandContext = {
    summaryForPlayer: () => summary,
    now: () => 1000,
    emitEvent: (event) => events.push(event),
    rejectCommand: (_command, code, message) => rejections.push({ code, message }),
    tileAt: (x, y) => tiles.get(`${x},${y}`),
    isHostileOwner: (playerId, targetOwnerId) => Boolean(targetOwnerId) && targetOwnerId !== playerId && targetOwnerId !== "ally-1",
    nextDrainCommandId: (playerId, x, y) => `drain:${playerId}:${x},${y}`,
    isPlayerOnline: () => options.isPlayerOnline ?? false,
    dispatchFrontierCommand: (command, actionType) => {
      dispatched.push({ command, actionType });
      if (!options.dispatchResultFor) return { accepted: true };
      const payload = JSON.parse(command.payloadJson) as { toX: number; toY: number };
      const accepted = options.dispatchResultFor(payload.toX, payload.toY, actionType);
      return accepted ? { accepted: true } : { accepted: false, code: options.rejectionCode ?? "BARRIER" };
    }
  };

  return { context, summary, events, rejections, dispatched, tiles };
}

function tile(x: number, y: number, overrides: Partial<DomainTileState> = {}): DomainTileState {
  return { x, y, terrain: "LAND", ...overrides };
}

describe("tryDrainWaypointQueue", () => {
  it("dispatches an EXPAND for a neutral queued target", () => {
    const tiles = new Map([["5,5", tile(5, 5)]]);
    const { context, summary, dispatched } = makeContext({ tiles });
    summary.waypointQueue = [{ target: { x: 5, y: 5 }, queuedAt: 0 }];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.actionType).toBe("EXPAND");
    expect(summary.waypointQueue).toHaveLength(0);
  });

  it("dispatches an ATTACK for a barbarian-held queued target", () => {
    const tiles = new Map([["5,5", tile(5, 5, { ownerId: "barbarian-1" })]]);
    const { context, summary, dispatched } = makeContext({ tiles });
    summary.waypointQueue = [{ target: { x: 5, y: 5 }, queuedAt: 0 }];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.actionType).toBe("ATTACK");
  });

  it("dispatches an ATTACK for a trackBarbarian entry that followed the target onto a rival tile", () => {
    const tiles = new Map([["5,5", tile(5, 5, { ownerId: "rival-1" })]]);
    const { context, summary, dispatched } = makeContext({ tiles });
    summary.waypointQueue = [{ target: { x: 5, y: 5 }, queuedAt: 0, trackBarbarian: true }];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.actionType).toBe("ATTACK");
  });

  it("does not auto-declare war on a rival's settled tile without trackBarbarian, and moves on to the next entry", () => {
    const tiles = new Map([
      ["5,5", tile(5, 5, { ownerId: "rival-1" })],
      ["6,6", tile(6, 6)]
    ]);
    const { context, summary, dispatched } = makeContext({ tiles });
    summary.waypointQueue = [
      { target: { x: 5, y: 5 }, queuedAt: 0 },
      { target: { x: 6, y: 6 }, queuedAt: 1 }
    ];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.actionType).toBe("EXPAND");
    expect(summary.waypointQueue).toHaveLength(0);
  });

  it("drops an entry already owned by the player (reached while offline) and proceeds to the next entry", () => {
    const tiles = new Map([
      ["5,5", tile(5, 5, { ownerId: PLAYER_ID })],
      ["6,6", tile(6, 6)]
    ]);
    const { context, summary, dispatched } = makeContext({ tiles });
    summary.waypointQueue = [
      { target: { x: 5, y: 5 }, queuedAt: 0 },
      { target: { x: 6, y: 6 }, queuedAt: 1 }
    ];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.command.payloadJson).toContain('"toX":6');
    expect(summary.waypointQueue).toHaveLength(0);
  });

  it("drops a rejected (e.g. no longer adjacent) entry and tries the next one instead of stalling", () => {
    const tiles = new Map([
      ["5,5", tile(5, 5)],
      ["6,6", tile(6, 6)]
    ]);
    const { context, summary, dispatched } = makeContext({
      tiles,
      dispatchResultFor: (x) => x !== 5 // reject the first target, accept the second
    });
    summary.waypointQueue = [
      { target: { x: 5, y: 5 }, queuedAt: 0 },
      { target: { x: 6, y: 6 }, queuedAt: 1 }
    ];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(2);
    expect(summary.waypointQueue).toHaveLength(0);
  });

  it("drops an entry whose target tile no longer exists", () => {
    const { context, summary, dispatched } = makeContext({ tiles: new Map() });
    summary.waypointQueue = [{ target: { x: 5, y: 5 }, queuedAt: 0 }];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(0);
    expect(summary.waypointQueue).toHaveLength(0);
  });

  it("stops after one successful dispatch, leaving later entries queued", () => {
    const tiles = new Map([
      ["5,5", tile(5, 5)],
      ["6,6", tile(6, 6)]
    ]);
    const { context, summary, dispatched } = makeContext({ tiles });
    summary.waypointQueue = [
      { target: { x: 5, y: 5 }, queuedAt: 0 },
      { target: { x: 6, y: 6 }, queuedAt: 1 }
    ];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(1);
    expect(summary.waypointQueue).toEqual([{ target: { x: 6, y: 6 }, queuedAt: 1 }]);
  });

  it("does nothing on an empty queue", () => {
    const { context, summary, dispatched } = makeContext();
    tryDrainWaypointQueue(context, PLAYER_ID);
    expect(dispatched).toHaveLength(0);
    expect(summary.waypointQueue).toHaveLength(0);
  });

  it("does not drain at all while the player has a live connection", () => {
    // A connected client already drives its own waypoint queue -- the
    // in-process drain racing it would win almost every time (no network
    // round trip) and bounce the client's own attempt off a rejection on
    // every hop. The drain must be a no-op whenever isPlayerOnline is true.
    const tiles = new Map([["5,5", tile(5, 5)]]);
    const { context, summary, dispatched } = makeContext({ tiles, isPlayerOnline: true });
    summary.waypointQueue = [{ target: { x: 5, y: 5 }, queuedAt: 0 }];

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(0);
    expect(summary.waypointQueue).toHaveLength(1);
  });

  it("puts a retryably-rejected entry (e.g. NOT_ADJACENT) back at the front instead of dropping it", () => {
    // The offline drain issues each queued target directly (no multi-hop
    // replanning) -- a target that isn't adjacent to owned territory *yet*
    // is not a dead entry, it's one that needs another resolve/enqueue cycle
    // to become reachable as the player's border grows. Dropping it here was
    // the bug: an offline player's queued far-away target vanished the first
    // time the drain touched it.
    const tiles = new Map([
      ["5,5", tile(5, 5)],
      ["6,6", tile(6, 6)]
    ]);
    const { context, summary, dispatched } = makeContext({
      tiles,
      dispatchResultFor: () => false,
      rejectionCode: "NOT_ADJACENT"
    });
    summary.waypointQueue = [
      { target: { x: 5, y: 5 }, queuedAt: 0 },
      { target: { x: 6, y: 6 }, queuedAt: 1 }
    ];

    tryDrainWaypointQueue(context, PLAYER_ID);

    // Stops at the first attempt (matching the existing "one live dispatch
    // attempt per drain call" semantics) with the rejected entry restored to
    // the front, ahead of the entry that was never tried.
    expect(dispatched).toHaveLength(1);
    expect(summary.waypointQueue).toEqual([
      { target: { x: 5, y: 5 }, queuedAt: 0 },
      { target: { x: 6, y: 6 }, queuedAt: 1 }
    ]);
  });
});

describe("handleWaypointEnqueueCommand", () => {
  it("attempts an immediate drain right after a successful enqueue", () => {
    const tiles = new Map([["5,5", tile(5, 5)]]);
    const { context, summary, dispatched, events } = makeContext({ tiles });
    const command: CommandEnvelope = {
      commandId: "cmd-1",
      sessionId: "s1",
      playerId: PLAYER_ID,
      clientSeq: 1,
      issuedAt: 1000,
      type: "WAYPOINT_ENQUEUE",
      payloadJson: JSON.stringify({ x: 5, y: 5 })
    } as unknown as CommandEnvelope;

    handleWaypointEnqueueCommand(context, command);

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED")).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(summary.waypointQueue).toHaveLength(0);
  });
});
