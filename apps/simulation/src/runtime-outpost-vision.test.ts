import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  outpostVisionBonusStructureType,
  reconcileOutpostVisionBonus,
  resyncPlayerOutpostVisionBonuses,
  seedOutpostVisionBonus,
  type OutpostVisionCoverageDeps
} from "./runtime-outpost-vision.js";
import type { RuntimePlayer } from "./runtime-types.js";

// Direct unit coverage for the dormancy-aware core (as opposed to the
// full-runtime integration tests in runtime/runtime.outpost-vision.test.ts) —
// a fake coverage sink records set/remove calls so the "went dormant" /
// "manually disabled" / "regained a slot" transitions can be asserted without
// standing up a whole SimulationRuntime + territory just to flip one player's
// FOOD supply.

const makePlayer = (id: string, techIds: string[] = []): RuntimePlayer =>
  ({
    id,
    isAi: false,
    points: 0,
    manpower: 0,
    techIds: new Set(techIds),
    domainIds: new Set(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set()
  }) as unknown as RuntimePlayer;

type RecordedCall = { kind: "set" | "remove"; sourceId: string; x: number; y: number; radius?: number };

const fakeCoverage = () => {
  const calls: RecordedCall[] = [];
  const tracked = new Map<string, number>();
  const key = (sourceId: string, x: number, y: number): string => `${sourceId}:${x},${y}`;
  return {
    calls,
    tracked,
    setOutpostVisionBonus: (sourceId: string, x: number, y: number, bonusRadius: number): void => {
      calls.push({ kind: "set", sourceId, x, y, radius: bonusRadius });
      tracked.set(key(sourceId, x, y), bonusRadius);
    },
    removeOutpostVisionBonus: (sourceId: string, x: number, y: number): void => {
      calls.push({ kind: "remove", sourceId, x, y });
      tracked.delete(key(sourceId, x, y));
    }
  };
};

const outpostTile = (overrides: Partial<DomainTileState> = {}): DomainTileState =>
  ({
    x: 5,
    y: 5,
    terrain: "LAND",
    ownerId: "player-1",
    ownershipState: "SETTLED",
    economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "active" },
    ...overrides
  }) as DomainTileState;

describe("outpostVisionBonusStructureType", () => {
  it("treats a manually disabled (inactive) Light Outpost as absent, same as under_construction", () => {
    const inactive = outpostTile({ economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "inactive" } });
    expect(outpostVisionBonusStructureType(inactive, "player-1")).toBeUndefined();
  });

  it("still treats a removing Light Outpost as present (grace period)", () => {
    const removing = outpostTile({ economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "removing" } });
    expect(outpostVisionBonusStructureType(removing, "player-1")).toBe("LIGHT_OUTPOST");
  });
});

describe("seedOutpostVisionBonus dormancy handling", () => {
  it("grants the base 5-tile bonus for an active, non-dormant Light Outpost", () => {
    const coverage = fakeCoverage();
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")]]),
      isStructureDormant: () => false,
      coverage
    };
    seedOutpostVisionBonus(deps, outpostTile());
    expect(coverage.calls).toEqual([{ kind: "set", sourceId: "player-1", x: 5, y: 5, radius: 5 }]);
  });

  it("grants no bonus for a dormant (food-starved) Light Outpost, even though it's active", () => {
    const coverage = fakeCoverage();
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")]]),
      isStructureDormant: () => true,
      coverage
    };
    seedOutpostVisionBonus(deps, outpostTile());
    expect(coverage.calls.some((c) => c.kind === "set")).toBe(false);
  });

  it("grants no bonus for a manually disabled Light Outpost", () => {
    const coverage = fakeCoverage();
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")]]),
      isStructureDormant: () => false,
      coverage
    };
    seedOutpostVisionBonus(deps, outpostTile({ economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "inactive" } }));
    expect(coverage.calls.some((c) => c.kind === "set")).toBe(false);
  });
});

describe("reconcileOutpostVisionBonus dormancy transitions", () => {
  it("removes an existing bonus the moment the same outpost goes dormant, without the tile's own fields changing", () => {
    const coverage = fakeCoverage();
    let dormant = false;
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")]]),
      isStructureDormant: () => dormant,
      coverage
    };
    const tile = outpostTile();
    seedOutpostVisionBonus(deps, tile);
    expect(coverage.tracked.get("player-1:5,5")).toBe(5);

    // Some other tile in the player's territory lost a FOOD slot — dormancy
    // flips true — and this outpost's own tile is reconciled (e.g. some
    // unrelated field on it changed).
    dormant = true;
    reconcileOutpostVisionBonus(deps, tile, tile);
    expect(coverage.tracked.has("player-1:5,5")).toBe(false);
    expect(coverage.calls.at(-1)).toEqual({ kind: "remove", sourceId: "player-1", x: 5, y: 5 });
  });

  it("re-grants the bonus once a previously dormant outpost regains a free slot", () => {
    const coverage = fakeCoverage();
    let dormant = true;
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")]]),
      isStructureDormant: () => dormant,
      coverage
    };
    const tile = outpostTile();
    seedOutpostVisionBonus(deps, tile);
    expect(coverage.tracked.has("player-1:5,5")).toBe(false);

    dormant = false;
    reconcileOutpostVisionBonus(deps, tile, tile);
    expect(coverage.tracked.get("player-1:5,5")).toBe(5);
  });

  it("manually disabling an active outpost clears its bonus", () => {
    const coverage = fakeCoverage();
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")]]),
      isStructureDormant: () => false,
      coverage
    };
    const active = outpostTile();
    seedOutpostVisionBonus(deps, active);
    expect(coverage.tracked.get("player-1:5,5")).toBe(5);

    const disabled = outpostTile({ economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "inactive", inactiveReason: "manual" } });
    reconcileOutpostVisionBonus(deps, active, disabled);
    expect(coverage.tracked.has("player-1:5,5")).toBe(false);
  });

  it("re-enabling a manually disabled outpost restores its bonus", () => {
    const coverage = fakeCoverage();
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")]]),
      isStructureDormant: () => false,
      coverage
    };
    const disabled = outpostTile({ economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST", status: "inactive", inactiveReason: "manual" } });
    seedOutpostVisionBonus(deps, disabled);
    expect(coverage.tracked.has("player-1:5,5")).toBe(false);

    const active = outpostTile();
    reconcileOutpostVisionBonus(deps, disabled, active);
    expect(coverage.tracked.get("player-1:5,5")).toBe(5);
  });

  it("clears the previous owner's bonus explicitly when ownership changes away", () => {
    const coverage = fakeCoverage();
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")], ["player-2", makePlayer("player-2")]]),
      isStructureDormant: () => false,
      coverage
    };
    const owned = outpostTile();
    seedOutpostVisionBonus(deps, owned);
    expect(coverage.tracked.get("player-1:5,5")).toBe(5);

    const captured = { ...owned, ownerId: "player-2", economicStructure: { ownerId: "player-2", type: "LIGHT_OUTPOST" as const, status: "active" as const } };
    reconcileOutpostVisionBonus(deps, owned, captured);
    expect(coverage.tracked.has("player-1:5,5")).toBe(false);
    expect(coverage.tracked.get("player-2:5,5")).toBe(5);
  });

  it("applies Survey Corps's tech radius on top of the base, and still zeroes it out while dormant", () => {
    const coverage = fakeCoverage();
    let dormant = false;
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1", ["surveying"])]]),
      isStructureDormant: () => dormant,
      coverage
    };
    const tile = outpostTile();
    seedOutpostVisionBonus(deps, tile);
    expect(coverage.tracked.get("player-1:5,5")).toBe(6); // base 5 + Survey Corps +1

    dormant = true;
    reconcileOutpostVisionBonus(deps, tile, tile);
    expect(coverage.tracked.has("player-1:5,5")).toBe(false);
  });
});

describe("resyncPlayerOutpostVisionBonuses picks up a dormancy shift across outposts", () => {
  it("clears only the outpost that's actually dormant, leaving the others untouched", () => {
    const coverage = fakeCoverage();
    const dormantTileKeys = new Set<string>();
    const deps: OutpostVisionCoverageDeps = {
      players: new Map([["player-1", makePlayer("player-1")]]),
      isStructureDormant: (_ownerId, tileKey) => dormantTileKeys.has(tileKey),
      coverage
    };
    const outpostA = outpostTile({ x: 5, y: 5 });
    const outpostB = outpostTile({ x: 6, y: 6 });
    seedOutpostVisionBonus(deps, outpostA);
    seedOutpostVisionBonus(deps, outpostB);
    expect(coverage.tracked.get("player-1:5,5")).toBe(5);
    expect(coverage.tracked.get("player-1:6,6")).toBe(5);

    // A resource tile elsewhere just dropped out of the player's territory —
    // outpost B (but not A) is now short its FOOD slot. Neither outpost's own
    // tile changed, so this can only be caught by a resync sweep.
    dormantTileKeys.add("6,6");
    resyncPlayerOutpostVisionBonuses(deps, "player-1", [outpostA, outpostB]);
    expect(coverage.tracked.get("player-1:5,5")).toBe(5);
    expect(coverage.tracked.has("player-1:6,6")).toBe(false);
  });
});
