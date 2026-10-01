import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { ADVANCE_MAX_RANGE_TILES } from "./muster-auto-fire-shared.js";
import { makePlayer } from "./muster-march-test-support.js";

// The runtime's default world already owns tiles near (10,10), so scenarios
// are written relative to BASE, in an empty part of the map.
const BASE = 60;
type TileInit = { x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED"; muster?: Record<string, unknown> };

const barb = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "FRONTIER" });
const neutral = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownershipState: "FRONTIER" });
const rival = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
const owned = (x: number, y: number, muster?: Record<string, unknown>): TileInit => ({
  x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", ...(muster ? { muster } : {})
});
const advanceFlag = (extra: Record<string, unknown> = {}) => ({ ownerId: "player-1", amount: 100, mode: "ADVANCE", updatedAt: 1_000, ...extra });
const column = (x: number, fromY: number, toY: number): TileInit[] =>
  Array.from({ length: toY - fromY + 1 }, (_, i) => neutral(x, fromY + i));

const buildRuntime = (tiles: TileInit[], options: { playerIsAi?: boolean } = {}) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", { ...makePlayer("player-1"), isAi: options.playerIsAi ?? false }],
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

describe("ADVANCE clearing barbarians in the wilderness", () => {
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

  it("never expands toward another player's land", () => {
    const runtime = buildRuntime([owned(10, 10, advanceFlag()), ...column(10, 11, 13), rival(10, 14)]);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    expect(targets(seen)).toEqual([]);
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
