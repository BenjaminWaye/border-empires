import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { ADVANCE_MAX_RANGE_TILES } from "./muster-auto-fire-shared.js";
import { nearestHostileWithinSteps } from "./muster-advance-clear.js";
import { maybeAdvanceFire } from "./muster-advance-fire.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { makePlayer } from "./muster-march-test-support.js";

// The runtime's default world already owns tiles near (10,10), so scenarios
// are written relative to BASE, in an empty part of the map.
const BASE = 60;
type TileInit = { x: number; y: number; terrain: "LAND" | "SEA" | "MOUNTAIN"; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED"; muster?: Record<string, unknown> };

const barb = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "FRONTIER" });
const blocked = (x: number, y: number, terrain: "SEA" | "MOUNTAIN" = "SEA"): TileInit => ({ x: x + BASE, y: y + BASE, terrain });
const neutral = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownershipState: "FRONTIER" });
const rival = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
const owned = (x: number, y: number, muster?: Record<string, unknown>): TileInit => ({
  x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", ...(muster ? { muster } : {})
});
const advanceFlag = (extra: Record<string, unknown> = {}) => ({ ownerId: "player-1", amount: 100, mode: "ADVANCE", updatedAt: 1_000, ...extra });
const column = (x: number, fromY: number, toY: number): TileInit[] =>
  Array.from({ length: toY - fromY + 1 }, (_, i) => neutral(x, fromY + i));

const buildRuntime = (tiles: TileInit[], options: { playerIsAi?: boolean; alliedWithRival?: boolean; broke?: boolean } = {}) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", { ...makePlayer("player-1"), isAi: options.playerIsAi ?? false, points: options.broke ? 0 : 10_000, allies: new Set(options.alliedWithRival ? ["player-2"] : []) }],
      ["player-2", makePlayer("player-2")],
      ["barbarian-1", { ...makePlayer("barbarian-1"), isAi: true }]
    ]),
    initialState: { tiles, activeLocks: [] }
  });

const musterAt = (runtime: SimulationRuntime, x: number, y: number) => {
  const tile = runtime.exportState().tiles.find((entry) => entry.x === x + BASE && entry.y === y + BASE);
  return tile?.musterJson ? JSON.parse(tile.musterJson) : undefined;
};

// Every muster-fired command (ADVANCE attacks and the expansions toward a
// barbarian), as "ACTION:x,y" relative to BASE.
const targets = (events: SimulationEvent[]) =>
  events
    .filter(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
        event.eventType === "COMMAND_ACCEPTED" && /:muster-(advance|march):/.test(event.commandId)
    )
    .map((command) => `${command.actionType}:${command.targetX - BASE},${command.targetY - BASE}`);

describe("ADVANCE clearing enemies in range", () => {
  it("expands toward a barbarian that does not touch its territory", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), ...column(10, 11, 13), barb(10, 14)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual(["EXPAND:10,11"]);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "ADVANCE", clearing: true });
  });

  it("ignores barbarians beyond the range cap", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), ...column(10, 11, 30), barb(10, 10 + ADVANCE_MAX_RANGE_TILES + 1)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "ADVANCE" });
  });

  it("expands toward a rival's border within range, then attacks it", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), ...column(10, 11, 13), rival(10, 14)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual(["EXPAND:10,11"]);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "ADVANCE", clearing: true });
  });

  it("ignores a rival beyond the range cap", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), ...column(10, 11, 30), rival(10, 10 + ADVANCE_MAX_RANGE_TILES + 1)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
  });

  it("heads for the nearer of a barbarian and a rival", () => {
    const runtime = buildRuntime([
      owned(10, 10, advanceFlag()), ...column(10, 11, 13), rival(10, 14),
      neutral(9, 11), neutral(8, 11), neutral(7, 11), barb(6, 11)
    ]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    // The barbarian is 4 tiles away, the rival 4 as well: a tie goes to the barbarian, so the flag steps west.
    expect(targets(seen)).toEqual(["EXPAND:9,11"]);
  });

  it("does not count an enemy across water, even a few tiles away in a straight line", () => {
    // The rival at (10,13) is 3 tiles from the flag, but a wall of sea at y=12
    // (and nothing but undefined map beyond its ends) leaves no way to walk to it.
    const wall = Array.from({ length: 21 }, (_, i) => blocked(i, 12));
    const runtime = buildRuntime([owned(10, 10, advanceFlag({ clearing: true })), neutral(10, 11), ...wall, rival(10, 13)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
    // Nothing reachable is left, so the order is finished.
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "HOLD" });
  });

  it("does not count an enemy on the far side of a mountain range either", () => {
    const range = Array.from({ length: 21 }, (_, i) => blocked(i, 12, "MOUNTAIN"));
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), neutral(10, 11), ...range, barb(10, 13)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
  });

  it("walks around an obstacle over neutral land when the detour is within 10 steps", () => {
    // Sea at (9..11,12); the way round is (11,11) -> (12,12) -> (11,13), 4 steps in all.
    const runtime = buildRuntime([
      owned(10, 10, advanceFlag()),
      blocked(9, 12), blocked(10, 12), blocked(11, 12),
      neutral(11, 11), neutral(12, 12), neutral(11, 13), rival(10, 13)
    ]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual(["EXPAND:11,11"]);
  });

  it("ignores an enemy whose only route is longer than 10 steps", () => {
    // Open land would put the rival at (10,13) 4 steps away, but the only road
    // is a 12-tile detour east around a wall of sea.
    const wall = Array.from({ length: 12 }, (_, i) => blocked(i + 4, 12));
    const detour = [...column(16, 11, 12), neutral(15, 13), neutral(14, 13), neutral(13, 13), neutral(12, 13), neutral(11, 13)];
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), ...Array.from({ length: 6 }, (_, i) => neutral(11 + i, 11)), ...wall, ...detour, rival(10, 13)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
  });

  it("never treats a third player's land as a road", () => {
    // The only way to the rival at (10,15) is through land owned by a player we are allied with.
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), neutral(10, 11), rival(10, 12), { x: 10 + BASE, y: 13 + BASE, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }], { alliedWithRival: true });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
  });

  it("treats an allied or truced player as no target at all", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), ...column(10, 11, 13), rival(10, 14)], { alliedWithRival: true });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
  });

  it("does not attack an ally's tile on its border, and still finishes once only allies are left", () => {
    // The ally's tile is the nearest "enemy" on the border. Without the ally
    // filter the flag would re-pick it forever (the attack is always rejected)
    // and never report the area cleared.
    const runtime = buildRuntime([owned(10, 10, advanceFlag({ clearing: true })), rival(11, 10)], { alliedWithRival: true });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "HOLD" });
  });

  it("does not finish while a rival is still in range", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag({ clearing: true })), ...column(10, 11, 13), rival(10, 14)]);
    runtime.tickMuster(1_000);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "ADVANCE" });
  });

  it("attacks barbarians already touching its territory, from different border tiles, in parallel", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), owned(10, 11), owned(10, 12), barb(11, 12), barb(9, 12)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    runtime.tickMuster(1_000);
    expect(targets(seen).sort()).toEqual(["ATTACK:11,12", "ATTACK:9,12"]);
  });

  it("reports the area cleared and returns to HOLD once it has engaged and nothing hostile is left", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag({ clearing: true })), owned(11, 10)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    const muster = musterAt(runtime, 10, 10);
    expect(muster).toMatchObject({ mode: "HOLD", amount: 100 });
    expect(muster.clearing).toBeUndefined();
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(player?.eventLog).toEqual([expect.objectContaining({ type: "AREA_CLEARED", x: 10 + BASE, y: 10 + BASE })]);
    expect(seen.some((event) => event.eventType === "PLAYER_MESSAGE" && event.playerId === "player-1" && event.payloadJson.includes("AREA_CLEARED"))).toBe(true);
  });

  it("keeps waiting at a quiet front when it never had anything to do", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), owned(11, 10)]);
    runtime.tickMuster(1_000);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "ADVANCE" });
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(player?.eventLog ?? []).toEqual([]);
  });

  it("does not finish while a barbarian is still in range", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag({ clearing: true })), ...column(10, 11, 13), barb(10, 14)]);
    runtime.tickMuster(1_000);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "ADVANCE" });
  });

  it("leaves AI flags alone: no expanding toward barbarians, no finishing", () => {
    const expandRuntime = buildRuntime([owned(10, 10, advanceFlag()), ...column(10, 11, 13), barb(10, 14)], { playerIsAi: true });
    const seen: SimulationEvent[] = [];
    expandRuntime.onEvent((event) => seen.push(event));
    expandRuntime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
    const finishRuntime = buildRuntime([owned(10, 10, advanceFlag({ clearing: true })), owned(11, 10)], { playerIsAi: true });
    finishRuntime.tickMuster(1_000);
    expect(musterAt(finishRuntime, 10, 10)).toMatchObject({ mode: "ADVANCE" });
  });
});

describe("muster flags act every second without being watched", () => {
  it("fires an unwatched human ADVANCE flag on the 1s ticker", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), barb(11, 10)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickWatchedMusterTiles(1_000);
    expect(targets(seen)).toEqual(["ATTACK:11,10"]);
  });

  it("leaves AI flags on the 30s territory-automation cadence", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), barb(11, 10)], { playerIsAi: true });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickWatchedMusterTiles(1_000);
    expect(targets(seen)).toEqual([]);
  });
});

// Regressions from the PR review.
const tileDeltasFor = (events: SimulationEvent[], x: number, y: number) =>
  events.flatMap((event) => (event.eventType === "TILE_DELTA_BATCH" ? event.tileDeltas : [])).filter((delta) => delta.x === x + BASE && delta.y === y + BASE);

describe("ADVANCE clearing: review regressions", () => {
  it("the batched accrual delta cannot overwrite the HOLD sent when the area clears", () => {
    // A minute of accrual queues a delta carrying the pre-completion (ADVANCE) state, and the
    // batch goes out after the completion delta. The client must still end up on HOLD.
    const runtime = buildRuntime([owned(10, 10, advanceFlag({ clearing: true, updatedAt: 1_000 })), owned(11, 10)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(61_000);
    const deltas = tileDeltasFor(seen, 10, 10).filter((delta) => delta.musterJson !== undefined);
    expect(deltas.length).toBeGreaterThan(1);
    expect(JSON.parse(deltas[deltas.length - 1]!.musterJson!)).toMatchObject({ mode: "HOLD" });
  });

  it("tells the client once when a human flag starts clearing", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), barb(11, 10)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    const lastMuster = tileDeltasFor(seen, 10, 10).map((delta) => delta.musterJson).filter(Boolean).pop();
    expect(JSON.parse(lastMuster!)).toMatchObject({ clearing: true });
  });

  it("does not mark an AI flag as clearing", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), barb(11, 10)], { playerIsAi: true });
    runtime.tickMuster(1_000);
    expect(musterAt(runtime, 10, 10)?.clearing).toBeUndefined();
  });

  it("a legacy MARCH flag with a target far beyond the cap still makes progress", () => {
    const runtime = buildRuntime([
      owned(10, 10, { ownerId: "player-1", amount: 100, mode: "MARCH", targetX: 10 + BASE + 40, targetY: 10 + BASE, updatedAt: 1_000 }),
      neutral(11, 10), neutral(12, 10), { x: 10 + 40 + BASE, y: 10 + BASE, terrain: "LAND", ownershipState: "FRONTIER" }
    ]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual(["EXPAND:11,10"]);
  });
});

describe("nearestHostileWithinSteps follows dock and bridge links", () => {
  const land = (x: number, y: number, extra: Record<string, unknown> = {}) => [`${x},${y}`, { x, y, terrain: "LAND", ...extra }] as const;
  const fakeInput = (dockLinks: Array<[string, string[]]>, bridgeLinks: Array<[string, string[]]>) =>
    ({
      players: new Map([["player-1", { id: "player-1", allies: new Set<string>() }]]),
      tiles: new Map([
        land(10, 10, { ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" }),
        land(80, 10, { dockId: "dock-b" }),
        land(81, 10, { ownerId: "barbarian-1", ownershipState: "FRONTIER" })
      ]),
      dockLinksByDockTileKey: new Map(dockLinks),
      aetherBridgeNeighborKeysForPlayer: () => new Map(bridgeLinks)
    }) as unknown as MusterTickInput;
  const flag = { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" } as never;

  it("sees an enemy one step beyond a dock crossing", () => {
    const found = nearestHostileWithinSteps(fakeInput([["10,10", ["80,10"]]], []), flag, "player-1");
    expect(found).toMatchObject({ x: 81, y: 10 });
  });

  it("sees an enemy one step beyond an aether bridge", () => {
    const found = nearestHostileWithinSteps(fakeInput([], [["10,10", ["80,10"]]]), flag, "player-1");
    expect(found).toMatchObject({ x: 81, y: 10 });
  });

  it("does not see it without a link", () => {
    expect(nearestHostileWithinSteps(fakeInput([], []), flag, "player-1")).toBeUndefined();
  });
});

describe("only an accepted command counts as engaging", () => {
  const run = (accepted: boolean) => {
    const flag = { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: { ownerId: "player-1", amount: 100, mode: "ADVANCE", updatedAt: 1_000 } };
    const tiles = new Map<string, unknown>([
      ["10,10", flag],
      ["11,10", { x: 11, y: 10, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "FRONTIER" }]
    ]);
    const cooldowns = new Map<string, number>();
    const input = {
      nowMs: 1_000,
      players: new Map([["player-1", { id: "player-1", isAi: false, allies: new Set<string>() }]]),
      tiles,
      locksByTile: new Map(),
      advanceCooldowns: cooldowns,
      dockLinksByDockTileKey: new Map(),
      aetherBridgeNeighborKeysForPlayer: () => new Map(),
      requiredMusterForTarget: () => 10,
      playerManpowerCap: () => 1_000,
      nextTerritoryAutomationCommandId: () => "cmd",
      handleFrontierCommand: () => ({ accepted }),
      replaceTileState: (key: string, tile: unknown) => tiles.set(key, tile),
      emitEvent: () => {},
      emitPlayerStateUpdate: () => {},
      tileDeltaFromState: (tile: { x: number; y: number }) => ({ x: tile.x, y: tile.y })
    } as unknown as MusterTickInput;
    maybeAdvanceFire(input, flag as never, "player-1");
    return { clearing: (tiles.get("10,10") as { muster: { clearing?: boolean } }).muster.clearing, cooldown: cooldowns.get("10,10") };
  };

  it("marks the flag when the command is accepted", () => {
    expect(run(true).clearing).toBe(true);
  });

  it("neither marks the flag nor retries at once when the command is rejected", () => {
    const rejected = run(false);
    expect(rejected.clearing).toBeUndefined();
    expect(rejected.cooldown).toBeGreaterThan(1_000);
  });
});
