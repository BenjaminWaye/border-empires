import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { COMBAT_LOCK_MS, MUSTER_TRANSIT_MS_PER_TILE } from "@border-empires/shared";

// Both flags in this layout fire from their own tile (adjacent to their
// target) -- 1-tile floor on the mechanical travel-time delay.
const RESOLVE_MS = COMBAT_LOCK_MS + MUSTER_TRANSIT_MS_PER_TILE;

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

// One ADVANCE flag at (10,10) with two additional owned tiles, each with its
// own adjacent enemy. This gives the parallel-flight regression three targets
// to launch before the first combat timer resolves.
const buildTwoFrontRuntime = (musterAmount: number, targets: "FRONTIER" | "SETTLED") =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          muster: { ownerId: "player-1", amount: musterAmount, mode: "ADVANCE", updatedAt: 1_000 }
        },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: targets },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 11, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: targets },
        { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 12, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: targets },
        { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 13, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: targets }
      ],
      activeLocks: []
    }
  });

const acceptedAttackCount = (events: SimulationEvent[]): number =>
  events.filter(
    (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
      event.eventType === "COMMAND_ACCEPTED" && event.commandId.includes(":muster-advance:")
  ).length;

const rejectedAttackCount = (events: SimulationEvent[]): number =>
  events.filter(
    (event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
      event.eventType === "COMMAND_REJECTED" && event.commandId.includes(":muster-advance:")
  ).length;

describe("muster ADVANCE parallel attacks", () => {
  it("launches up to three attacks while earlier attacks are still resolving", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = buildTwoFrontRuntime(60, "FRONTIER");
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      // Tick 1: first attack launches (FRONTIER targets cost 15 ≤ 60).
      runtime.tickMuster(1_000);
      await Promise.resolve();
      expect(acceptedAttackCount(seen)).toBe(1);

      // Tick 2 while the first attack is still in flight: a second attack can
      // now launch from the next unlocked owned tile.
      runtime.tickMuster(1_100);
      await Promise.resolve();
      expect(acceptedAttackCount(seen)).toBe(2);
      expect(rejectedAttackCount(seen)).toBe(0);

      // A third target can launch before either earlier attack resolves.
      runtime.tickMuster(1_200);
      await Promise.resolve();
      expect(acceptedAttackCount(seen)).toBe(3);
      const flagSnapshot = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(flagSnapshot?.musterJson ? JSON.parse(flagSnapshot.musterJson).inFlightCount : undefined).toBe(3);

      // The fourth attempt is capped until a lock resolves.
      runtime.tickMuster(1_300);
      await Promise.resolve();
      expect(acceptedAttackCount(seen)).toBe(3);

      // Let the first attack resolve, freeing a concurrency slot. D20
      // (docs/replenishment-update-plan.md) removed the flag's own manpower
      // cap, so during this ~32s wait the flag also keeps accruing straight
      // from the player's pool (previously capped at ~15, it's now free to
      // grow toward the full 150) -- enough to fund the 4th, previously
      // untouched, target once that slot opens up.
      vi.advanceTimersByTime(RESOLVE_MS + 100);
      runtime.tickMuster(1_000 + RESOLVE_MS + 100);
      await Promise.resolve();
      expect(acceptedAttackCount(seen)).toBe(4);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not re-send a doomed underfunded strike while an attack is in flight", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // SETTLED targets cost MUSTER_ATTACK_COST (60). After the first strike
      // reserves the whole flag, a second strike is unaffordable — it must be
      // held back entirely instead of being rejected by the server every tick.
      const runtime = buildTwoFrontRuntime(60, "SETTLED");
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      runtime.tickMuster(1_000);
      await Promise.resolve();
      expect(acceptedAttackCount(seen)).toBe(1);

      runtime.tickMuster(1_100);
      await Promise.resolve();
      expect(acceptedAttackCount(seen)).toBe(1);
      expect(rejectedAttackCount(seen)).toBe(0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("submits no command at all when the flag cannot afford any attackable target", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // 40 muster is below the 60 MUSTER_ATTACK_COST of the SETTLED target, so
      // neither a COMMAND_ACCEPTED nor a COMMAND_REJECTED should be emitted.
      const runtime = buildTwoFrontRuntime(40, "SETTLED");
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      runtime.tickMuster(1_000);
      await Promise.resolve();
      expect(acceptedAttackCount(seen)).toBe(0);
      expect(rejectedAttackCount(seen)).toBe(0);

      const target = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
      expect(target?.ownerId).toBe("player-2");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
