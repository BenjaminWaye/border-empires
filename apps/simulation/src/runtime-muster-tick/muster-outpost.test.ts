import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import { SWEEP_BUDGET_CAP } from "@border-empires/shared";

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

const buildRuntime = () =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: {
      tiles: [
        // Player-1 owns a settled tile with a fully-charged, sweep-active siege outpost.
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          siegeOutpost: {
            ownerId: "player-1",
            status: "active",
            variant: "SIEGE_OUTPOST",
            sweepBudget: SWEEP_BUDGET_CAP,
            sweepActive: true,
            sweepBudgetUpdatedAt: 1_000
          }
        },
        // Adjacent enemy frontier tile — the outpost would normally auto-capture this.
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      activeLocks: []
    }
  });

describe("Phase 6: outpost sweep gate", () => {
  it("does NOT auto-capture adjacent enemy tile when MUSTER_SYSTEM_ENABLED is true", () => {
    const runtime = buildRuntime();
    for (let i = 0; i < 10; i++) {
      runtime.tickTerritoryAutomation(1_000 + i * 5_000);
    }
    const enemy = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
    expect(enemy?.ownerId).toBe("player-2");
  });

  it("muster tile inside outpost 5×5 fills faster than one outside", async () => {
    const nowFn = { t: 1_000 };
    const runtime = new SimulationRuntime({
      now: () => nowFn.t,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          // Siege outpost at (10,10) — depot zone covers (8–12, 8–12).
          {
            x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            siegeOutpost: {
              ownerId: "player-1",
              status: "active",
              variant: "SIEGE_OUTPOST",
              sweepBudget: SWEEP_BUDGET_CAP,
              sweepActive: false,
              sweepBudgetUpdatedAt: 1_000
            }
          },
          // Muster tile INSIDE the depot zone (adjacent to outpost).
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          // Muster tile OUTSIDE the depot zone (far away).
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    // Place muster flags on both tiles.
    runtime.submitCommand({
      commandId: "set-inside", sessionId: "s", playerId: "player-1", clientSeq: 1,
      issuedAt: 1_000, type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 11, mode: "HOLD" })
    });
    await Promise.resolve();
    runtime.submitCommand({
      commandId: "set-outside", sessionId: "s", playerId: "player-1", clientSeq: 2,
      issuedAt: 1_000, type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 20, y: 20, mode: "HOLD" })
    });
    await Promise.resolve();

    // Advance 10 minutes and tick muster.
    nowFn.t = 1_000 + 10 * 60_000;
    runtime.tickMuster(nowFn.t);

    const inside = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
    const outside = runtime.exportState().tiles.find((t) => t.x === 20 && t.y === 20);
    const insideAmt = inside?.musterJson ? (JSON.parse(inside.musterJson) as { amount: number }).amount : 0;
    const outsideAmt = outside?.musterJson ? (JSON.parse(outside.musterJson) as { amount: number }).amount : 0;
    expect(insideAmt).toBeGreaterThan(outsideAmt);
  });
});
