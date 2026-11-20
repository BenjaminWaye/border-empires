import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { ADVANCE_MAX_RANGE_TILES } from "./muster-auto-fire-shared.js";
import { makePlayer } from "./muster-march-test-support.js";
import { parseSetMusterPayload } from "../runtime-command-parsers.js";

// "Hunt Planetary Defense" was removed with Planetary Defense camps
// (docs/planetary-defense-camps-plan.md): camps don't move, so there is nothing
// to chase. A flag saved mid-hunt (MusterState.hunt still set) and a hunt order
// from an older client both behave as a plain ADVANCE.

const BASE = 60;
type TileInit = { x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED"; muster?: Record<string, unknown> };

const barb = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "FRONTIER" });
const rival = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" });
const neutral = (x: number, y: number): TileInit => ({ x: x + BASE, y: y + BASE, terrain: "LAND", ownershipState: "FRONTIER" });
const owned = (x: number, y: number, muster?: Record<string, unknown>): TileInit => ({
  x: x + BASE, y: y + BASE, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", ...(muster ? { muster } : {})
});
const huntFlag = (extra: Record<string, unknown> = {}) => ({ ownerId: "player-1", amount: 100, mode: "ADVANCE", hunt: true, clearing: true, updatedAt: 1_000, ...extra });

const buildRuntime = (tiles: TileInit[], activeLocks: unknown[] = []) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", { ...makePlayer("player-1"), isAi: false, points: 10_000, mods: { attack: 1, defense: 1, income: 1, vision: ADVANCE_MAX_RANGE_TILES + 2 } }],
      ["player-2", makePlayer("player-2")],
      ["barbarian-1", { ...makePlayer("barbarian-1"), isAi: true }]
    ]),
    initialState: { tiles, activeLocks: activeLocks as never[] }
  });

const musterAt = (runtime: SimulationRuntime, x: number, y: number) => {
  const tile = runtime.exportState().tiles.find((entry) => entry.x === x + BASE && entry.y === y + BASE);
  return tile?.musterJson ? JSON.parse(tile.musterJson) : undefined;
};

const targets = (events: SimulationEvent[]) =>
  events
    .filter(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
        event.eventType === "COMMAND_ACCEPTED" && /:muster-(advance|march):/.test(event.commandId)
    )
    .map((command) => `${command.actionType}:${command.targetX - BASE},${command.targetY - BASE}`);

const tick = (runtime: SimulationRuntime): SimulationEvent[] => {
  const seen: SimulationEvent[] = [];
  runtime.onEvent((event) => seen.push(event));
  runtime.tickMuster(1_000);
  return seen;
};

describe("flags saved mid-hunt after Hunt Planetary Defense was removed", () => {
  it("advance on the nearest hostile like any ADVANCE flag, rivals included", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag({ targetX: 10 + BASE, targetY: 12 + BASE })), rival(11, 10), owned(10, 11), barb(10, 12)]);
    expect(targets(tick(runtime))).toEqual(["ATTACK:11,10"]);
  });

  it("report a plain area clear, not a Planetary Defense one, and drop the old order on HOLD", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag({ targetX: 10 + BASE, targetY: 12 + BASE })), owned(10, 11)]);
    tick(runtime);
    const muster = musterAt(runtime, 10, 10);
    expect(muster).toMatchObject({ mode: "HOLD" });
    expect(muster.hunt).toBeUndefined();
    expect(muster.targetX).toBeUndefined();
  });
});

describe("SET_MUSTER hunt payload from older clients", () => {
  it("is ignored: the order is a plain ADVANCE", () => {
    expect(parseSetMusterPayload(JSON.stringify({ x: 1, y: 2, mode: "ADVANCE", hunt: true }))).toEqual({ x: 1, y: 2, mode: "ADVANCE" });
  });
});
