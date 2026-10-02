import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { COMBAT_LOCK_MS, MUSTER_TRANSIT_MS_PER_TILE } from "@border-empires/shared";

type SeedTileInput = RecoveredSimulationState["tiles"][number];

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

// Flag at (50,50) holding `amount`. A SETTLED enemy sits one hop away at
// (51,50); a cheap FRONTIER enemy sits three hops away at (47,50).
const scenario = (amount: number, settledFort?: "WOODEN_FORT" | "FORT" | "THUNDER_BASTION") => {
  const tiles: SeedTileInput[] = [
    {
      x: 50,
      y: 50,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      muster: { ownerId: "player-1", amount, mode: "ADVANCE", updatedAt: 1_000 }
    },
    { x: 49, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
    { x: 48, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
    { x: 47, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
    {
      x: 51,
      y: 50,
      terrain: "LAND",
      ownerId: "player-2",
      ownershipState: "SETTLED",
      ...(settledFort ? { fort: { ownerId: "player-2", status: "active" as const, variant: settledFort } } : {})
    }
  ];
  return new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: { tiles, activeLocks: [] }
  });
};

const runOnce = async (runtime: SimulationRuntime) => {
  runtime.tickMuster(1_000);
  await Promise.resolve();
  vi.advanceTimersByTime(COMBAT_LOCK_MS + MUSTER_TRANSIT_MS_PER_TILE * 4 + 100);
  const tiles = runtime.exportState().tiles;
  return {
    frontier: tiles.find((t) => t.x === 47 && t.y === 50),
    flag: tiles.find((t) => t.x === 50 && t.y === 50)
  };
};

describe("ADVANCE saves up for its nearest target", () => {
  it("does not spend on a cheaper, farther frontier tile while it can't yet afford the nearer settled one", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // 30 mustered: enough for the frontier tile (15) but not the settled one (60).
      const { frontier, flag } = await runOnce(scenario(30));
      expect(frontier?.ownerId).toBe("player-2");
      const muster = JSON.parse(flag?.musterJson ?? "{}");
      expect(muster.amount).toBe(30);
      expect(muster.insufficientManpower).toBe(true);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("attacks the settled tile once it has saved enough, leaving the frontier tile alone", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = scenario(60);
      const { frontier } = await runOnce(runtime);
      expect(frontier?.ownerId).toBe("player-2");
      expect(runtime.exportState().tiles.find((t) => t.x === 51 && t.y === 50)?.ownerId).toBe("player-1");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("saves up for a Palisade (150), which is within the flag cap", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { frontier, flag } = await runOnce(scenario(30, "WOODEN_FORT"));
      expect(frontier?.ownerId).toBe("player-2");
      const muster = JSON.parse(flag?.musterJson ?? "{}");
      expect(muster.amount).toBe(30);
      expect(muster.unfundableTarget).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("skips a Fort (300) above the flag cap, tells the player, and keeps attacking what it can afford", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { frontier, flag } = await runOnce(scenario(30, "FORT"));
      expect(frontier?.ownerId).toBe("player-1");
      expect(JSON.parse(flag?.musterJson ?? "{}").unfundableTarget).toEqual({ x: 51, y: 50, required: 300 });
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("attacks a Fort above the flag cap once the flag already holds the full cost", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = scenario(300, "FORT");
      const { frontier } = await runOnce(runtime);
      expect(frontier?.ownerId).toBe("player-2");
      expect(runtime.exportState().tiles.find((t) => t.x === 51 && t.y === 50)?.ownerId).toBe("player-1");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
