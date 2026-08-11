/**
 * Perf regression guard for the outpost-vision dormancy resync
 * (runtime-outpost-vision.ts / markOutpostVisionDormancyDirty in runtime.ts).
 *
 * tickFortGarrison/tickMuster mutate many of a player's tiles via
 * replaceTileState in tight per-tile loops, with no emitPlayerStateUpdate in
 * between — the one hook that would otherwise coalesce a dormancy rebuild.
 * An earlier version of the dormancy-aware outpost-vision fix resynced
 * eagerly inside replaceTileState itself, which meant a single 30s
 * tickTerritoryAutomation sweep touching N tiles for an outpost-owning player
 * forced N separate O(territory) resourceSlotDormancyForPlayer rebuilds
 * instead of one. Pins the fix: replaceTileState only marks the owner dirty
 * (O(1)), and the actual resync is flushed once per tick from
 * tickTerritoryAutomation's flushAllOutpostVisionDormancyResyncs call.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { FORT_GARRISON_CAP_BY_VARIANT } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime.js";

const CAP = FORT_GARRISON_CAP_BY_VARIANT.FORT ?? 120;

const makePlayer = (id: string, manpower: number) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("outpost-vision dormancy resync perf (tick-driven mutations)", () => {
  it("resyncs an outpost-owning player's dormancy once per tick, not once per depleted fort", async () => {
    const FORT_COUNT = 6;
    const tiles: unknown[] = [];
    for (let i = 0; i < FORT_COUNT; i += 1) {
      tiles.push({
        x: 10 + i,
        y: 10,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        fort: { ownerId: "player-1", status: "active", variant: "FORT", garrison: 0, garrisonCap: CAP, garrisonUpdatedAt: 1_000 }
      });
      // Each FORT needs its own free TITANIUM slot (§5.4) to stay non-dormant.
      tiles.push({ x: 10 + i, y: 9, terrain: "LAND", resource: "TITANIUM", ownerId: "player-1", ownershipState: "SETTLED" });
    }
    // A Light Outpost, well clear of the forts, so this player is a
    // markOutpostVisionDormancyDirty candidate on every one of their tile
    // mutations this tick (the "hasOutposts" bail passes).
    tiles.push({
      x: 30,
      y: 30,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "active" }
    });

    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", { ...makePlayer("player-1", 1_000), manpower: 1_000 }]]),
      initialState: { tiles: tiles as never, activeLocks: [] }
    });

    const dormantSpy = vi.spyOn(runtime, "isStructureDormant");
    dormantSpy.mockClear();

    // 10 minutes of overflow is enough for every fort to have headroom to
    // fill, so tickFortGarrison calls replaceTileState once per fort.
    await runtime.tickTerritoryAutomation(1_000 + 10 * 60_000);

    // Baseline: tickFortGarrison's own dormancy gate reads isStructureDormant
    // once per fort (FORT_COUNT calls) — that cost is pre-existing and
    // unrelated to the outpost-vision resync. On top of that, the dormancy
    // resync should add exactly one more batch of calls (bounded by this
    // player's outpost count — 1 — not by how many forts just mutated).
    // The regression this guards against would show FORT_COUNT extra calls
    // (one full resync attempt per fort mutation) instead of 1.
    const calls = dormantSpy.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(FORT_COUNT + 1);
    expect(calls).toBeGreaterThan(FORT_COUNT); // the outpost resync did run at least once

    dormantSpy.mockRestore();
  });
});
