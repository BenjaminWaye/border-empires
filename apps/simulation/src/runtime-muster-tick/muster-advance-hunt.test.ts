import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { ADVANCE_MAX_RANGE_TILES } from "./muster-auto-fire-shared.js";
import { makePlayer } from "./muster-march-test-support.js";
import { parseSetMusterPayload } from "../runtime-command-parsers.js";

// "Hunt Planetary Defense": an ADVANCE flag with MusterState.hunt only takes
// barbarian tiles, goes for the tile the player clicked (targetX/Y) first, and
// re-picks the nearest patrol every search so one that walks off is chased.

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

describe("Hunt Planetary Defense flags", () => {
  it("attacks a Planetary Defense tile and leaves a nearer rival alone", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag()), rival(11, 10), owned(10, 11), barb(10, 12)]);
    expect(targets(tick(runtime))).toEqual(["ATTACK:10,12"]);
  });

  it("goes for the tile the player clicked first while it is still Planetary Defense", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag({ targetX: 12 + BASE, targetY: 10 + BASE })), barb(10, 11), owned(11, 10), barb(12, 10)]);
    expect(targets(tick(runtime))).toEqual(["ATTACK:12,10"]);
  });

  it("chases the nearest patrol when the clicked tile is no longer Planetary Defense", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag({ targetX: 12 + BASE, targetY: 10 + BASE })), barb(10, 11), owned(11, 10), neutral(12, 10)]);
    expect(targets(tick(runtime))).toEqual(["ATTACK:10,11"]);
  });

  it("expands toward Planetary Defense but never toward a rival", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag()), neutral(10, 11), barb(10, 12), neutral(11, 10), rival(12, 10)]);
    expect(targets(tick(runtime))).toEqual(["EXPAND:10,11"]);
  });

  it("reports Planetary Defense cleared and holds again when only rivals are left", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag({ targetX: 12 + BASE, targetY: 10 + BASE })), rival(11, 10)]);
    const seen = tick(runtime);
    expect(targets(seen)).toEqual([]);
    const muster = musterAt(runtime, 10, 10);
    expect(muster).toMatchObject({ mode: "HOLD", amount: 100 });
    expect(muster.hunt).toBeUndefined();
    expect(muster.targetX).toBeUndefined();
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(player?.eventLog).toEqual([expect.objectContaining({ type: "AREA_CLEARED", text: expect.stringContaining("Planetary Defense cleared") })]);
  });

  // Review regression: a hunt set with nothing reachable reported a false
  // "Planetary Defense cleared" on its first search.
  it("keeps waiting, without claiming a clear, when it has engaged nothing yet", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag({ clearing: undefined })), rival(11, 10)]);
    tick(runtime);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "ADVANCE", hunt: true, noTargetInRange: true });
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(player?.eventLog ?? []).toEqual([]);
  });

  it("waits for a patrol that is mid-capture of our land instead of calling the area clear", () => {
    // The patrol launched from (10,12) and left it at launch, so for now it
    // stands on no tile: only its in-flight attack on (10,11) shows it is here.
    const resolvesAt = 1_000 + COMBAT_LOCK_MS;
    const runtime = buildRuntime([owned(10, 10, huntFlag()), owned(10, 11), neutral(10, 12)], [{
      commandId: "barb-in-flight",
      playerId: "barbarian-1",
      actionType: "ATTACK",
      originX: 10 + BASE, originY: 12 + BASE,
      targetX: 10 + BASE, targetY: 11 + BASE,
      originKey: `${10 + BASE},${12 + BASE}`,
      targetKey: `${10 + BASE},${11 + BASE}`,
      resolvesAt
    }]);
    const seen = tick(runtime);
    expect(targets(seen)).toEqual([]);
    expect(musterAt(runtime, 10, 10)).toMatchObject({ mode: "ADVANCE", hunt: true, nextActionAt: resolvesAt });
  });

  // Review regression (PR #2716): a new hunt order sat out the previous
  // order's 10s "nothing in range" cooldown, so the patrol walked off.
  it("ignores a cooldown left by an earlier order once the flag is re-ordered to hunt", () => {
    const stale = buildRuntime([owned(10, 10, huntFlag({ clearing: undefined })), owned(10, 11), barb(10, 12)]);
    stale["musterAdvanceCooldowns"].set(`${10 + BASE},${10 + BASE}`, 11_000);
    expect(targets(tick(stale))).toEqual(["ATTACK:10,12"]);

    const waiting = buildRuntime([owned(10, 10, huntFlag({ clearing: undefined, nextActionAt: 11_000, noTargetInRange: true })), owned(10, 11), barb(10, 12)]);
    waiting["musterAdvanceCooldowns"].set(`${10 + BASE},${10 + BASE}`, 11_000);
    expect(targets(tick(waiting))).toEqual([]);
  });

  it("a plain ADVANCE flag still attacks the nearer rival", () => {
    const runtime = buildRuntime([owned(10, 10, huntFlag({ hunt: undefined })), rival(11, 10), owned(10, 11), barb(10, 12)]);
    expect(targets(tick(runtime))).toEqual(["ATTACK:11,10"]);
  });
});

describe("SET_MUSTER hunt payload", () => {
  it("keeps hunt on ADVANCE only", () => {
    expect(parseSetMusterPayload(JSON.stringify({ x: 1, y: 2, mode: "ADVANCE", hunt: true }))).toMatchObject({ hunt: true });
    expect(parseSetMusterPayload(JSON.stringify({ x: 1, y: 2, mode: "HOLD", hunt: true }))?.hunt).toBeUndefined();
  });
});
