import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import { FORT_GARRISON_CAP_BY_VARIANT, FRONTIER_ATTACK_MUSTER_COST, MUSTER_ATTACK_COST } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";

const CAP = FORT_GARRISON_CAP_BY_VARIANT["FORT"] ?? 120;

const makePlayer = (id: string, manpower: number, defenseMod = 1) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: defenseMod, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const fortGarrison = (runtime: SimulationRuntime, x: number, y: number): number | undefined => {
  const tile = runtime.exportState().tiles.find((t) => t.x === x && t.y === y);
  if (!tile?.fortJson) return undefined;
  const f = JSON.parse(tile.fortJson) as { garrison?: number };
  return f.garrison;
};

describe("Phase 7: fort garrison containers", () => {
  it("fort fills from overflow when the player pool is at cap", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", { ...makePlayer("player-1", 500), manpower: 500 }]
      ]),
      initialState: {
        tiles: [
          {
            x: 10, y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: {
              ownerId: "player-1",
              status: "active",
              variant: "FORT",
              garrison: 0,
              garrisonCap: CAP,
              garrisonUpdatedAt: 1_000
            }
          }
        ],
        activeLocks: []
      }
    });

    // With player at full pool, 10 minutes of overflow should fill garrison.
    runtime.tickFortGarrison(1_000 + 10 * 60_000);
    const g = fortGarrison(runtime, 10, 10);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThanOrEqual(CAP);
  });

  it("two depleted forts each fill at half the rate of a single fort", () => {
    const buildRuntimeWithForts = (fortCount: 1 | 2) =>
      new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", { ...makePlayer("player-1", 500), manpower: 500 }]]),
        initialState: {
          tiles: [
            {
              x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
              fort: { ownerId: "player-1", status: "active", variant: "FORT", garrison: 0, garrisonCap: CAP, garrisonUpdatedAt: 1_000 }
            },
            ...(fortCount === 2 ? [{
              x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
              fort: { ownerId: "player-1", status: "active", variant: "FORT" as const, garrison: 0, garrisonCap: CAP, garrisonUpdatedAt: 1_000 }
            }] : [])
          ],
          activeLocks: []
        }
      });

    const r1 = buildRuntimeWithForts(1);
    const r2 = buildRuntimeWithForts(2);
    const elapsed = 1_000 + 10 * 60_000;
    r1.tickFortGarrison(elapsed);
    r2.tickFortGarrison(elapsed);

    const g1 = fortGarrison(r1, 10, 10) ?? 0;
    const g2 = fortGarrison(r2, 10, 10) ?? 0;
    // Single-fort case should fill more than each fort in the two-fort case.
    expect(g1).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(0);
    // Approximately half (within 5% tolerance since regen and elapsed are exact).
    expect(g2).toBeCloseTo(g1 / 2, 1);
  });

  it("half-full garrison raises required muster above the base MUSTER_ATTACK_COST (SETTLED target only — forts on FRONTIER targets never raise the cost)", () => {
    const buildRuntime = (garrison: number) =>
      new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1", 999)]]),
        initialState: {
          tiles: [
            {
              x: 10, y: 11,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              fort: {
                ownerId: "player-1",
                status: "active",
                variant: "FORT",
                garrison,
                garrisonCap: CAP,
                garrisonUpdatedAt: 1_000
              }
            }
          ],
          activeLocks: []
        }
      });

    const internalTile = (tile: SimulationRuntime) =>
      (tile as unknown as { tiles: Map<string, unknown> }).tiles.get(simulationTileKey(10, 11));

    const requiredFor = (garrison: number): number => {
      const rt = buildRuntime(garrison);
      return (rt as unknown as { requiredMusterForTarget(t: unknown): number })
        .requiredMusterForTarget(internalTile(rt));
    };

    expect(requiredFor(0)).toBe(MUSTER_ATTACK_COST);
    expect(requiredFor(MUSTER_ATTACK_COST + 1)).toBeGreaterThan(MUSTER_ATTACK_COST);
    expect(requiredFor(CAP)).toBe(CAP);
  });

  it("a fort built on a FRONTIER (un-settled) target never raises required muster above FRONTIER_ATTACK_MUSTER_COST — forts only defend once SETTLED", () => {
    const buildRuntime = (garrison: number) =>
      new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1", 999)]]),
        initialState: {
          tiles: [
            {
              x: 10, y: 11,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              fort: { ownerId: "player-1", status: "active", variant: "FORT", garrison, garrisonCap: CAP, garrisonUpdatedAt: 1_000 }
            }
          ],
          activeLocks: []
        }
      });
    const internalTile = (tile: SimulationRuntime) =>
      (tile as unknown as { tiles: Map<string, unknown> }).tiles.get(simulationTileKey(10, 11));
    const requiredFor = (garrison: number): number => {
      const rt = buildRuntime(garrison);
      return (rt as unknown as { requiredMusterForTarget(t: unknown): number })
        .requiredMusterForTarget(internalTile(rt));
    };
    expect(requiredFor(0)).toBe(FRONTIER_ATTACK_MUSTER_COST);
    expect(requiredFor(CAP)).toBe(FRONTIER_ATTACK_MUSTER_COST);
  });

  it("repulsed assault reduces fort garrison (attrition)", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1", 999)]]),
      initialState: {
        tiles: [
          {
            x: 10, y: 11,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: {
              ownerId: "player-1",
              status: "active",
              variant: "FORT",
              garrison: CAP,
              garrisonCap: CAP,
              garrisonUpdatedAt: 1_000
            }
          }
        ],
        activeLocks: []
      }
    });

    // Directly invoke the private attrition method.
    (runtime as unknown as { applyFortGarrisonAttrition(key: string, force: number): void })
      .applyFortGarrisonAttrition(simulationTileKey(10, 11), MUSTER_ATTACK_COST);

    const g = fortGarrison(runtime, 10, 11) ?? CAP;
    expect(g).toBeLessThan(CAP);
    expect(g).toBeGreaterThanOrEqual(0);
  });
});
