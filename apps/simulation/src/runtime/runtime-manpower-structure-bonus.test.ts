/**
 * Regression tests for §4.4 of docs/manpower-economy-rewrite-plan.md: the
 * manpower-boosting structure tree. Garrison Hall grants a flat +150
 * manpower cap to its own town; a single Rail Depot per connected-town
 * network amplifies every Garrison Hall in that network (+300 cap, +0.1
 * regen/min each); and a second Rail Depot in an already-covered network
 * is rejected outright — even mid-construction, before the first one goes
 * active.
 */
import { describe, expect, it, vi } from "vitest";
import {
  economicStructureBuildDurationMs,
  GARRISON_HALL_MANPOWER_CAP_BONUS,
  RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL
} from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

type RawPlayerRef = { manpower: number };

// Two towns connected through a shared corridor tile, each with its own
// support tile for a Garrison Hall/Rail Depot build. Town A: (16,16), support
// tiles at (15,15)/(15,16)/(15,17). Town B: (20,16), support tiles at
// (21,15)/(21,16)/(21,17). Corridor: (17,16)-(19,16).
const buildTwoTownNetworkRuntime = () => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      [
        "player-1",
        buildPlayer("player-1", {
          points: 5_000,
          manpower: 10_000,
          techIds: new Set<string>(["organized-supply", "conveyor-networks"]),
          strategicResources: { CRYSTAL: 1_000 }
        })
      ]
    ]),
    initialState: {
      tiles: [
        { x: 16, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Town A", type: "FARMING", populationTier: "TOWN" } },
        { x: 17, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 18, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 19, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 20, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Town B", type: "FARMING", populationTier: "TOWN" } },
        // §5 resource slots: Garrison Hall and Rail Depot both draw 1 FOOD +
        // 1 CRYSTAL slot (§12's "crystal fix"), and each of the two towns
        // above also draws its own 4 FOOD slots (§5.3) — plenty of FARM
        // supply here, or every build in this file gets rejected with
        // INSUFFICIENT_SLOT before ever reaching the manpower-bonus
        // behavior under test.
        { x: 21, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 22, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 21, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 22, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 21, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 22, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 21, y: 19, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 22, y: 19, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 21, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 22, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 23, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
        { x: 24, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
      ],
      activeLocks: []
    }
  });
  runtime.exportPlayerDebugSnapshot(); // settle the one-time cap-grant quirk (see runtime-structure-command-handlers-economic-manpower.test.ts)
  const raw = (runtime as unknown as { state: { players: Map<string, RawPlayerRef> } }).state.players.get("player-1")!;
  raw.manpower = 10_000;
  return runtime;
};

const capSnapshotFor = (runtime: SimulationRuntime, playerId: string): number | undefined => {
  runtime.exportPlayerDebugSnapshot();
  return runtime.exportState().players.find((p) => p.id === playerId)?.manpowerCapSnapshot;
};

describe("manpower structure bonuses (§4.4)", () => {
  it("Garrison Hall adds its flat cap bonus once construction finishes", async () => {
    vi.useFakeTimers();
    try {
      const runtime = buildTwoTownNetworkRuntime();
      const before = capSnapshotFor(runtime, "player-1")!;

      runtime.submitCommand({
        commandId: "gh-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "GARRISON_HALL" })
      });
      await Promise.resolve();

      // Still under_construction — bonus must not apply yet.
      expect(capSnapshotFor(runtime, "player-1")).toBe(before);

      vi.advanceTimersByTime(economicStructureBuildDurationMs("GARRISON_HALL"));
      await Promise.resolve();

      const after = capSnapshotFor(runtime, "player-1")!;
      expect(after - before).toBe(GARRISON_HALL_MANPOWER_CAP_BONUS);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a lone Rail Depot with no Garrison Hall anywhere in its network adds no cap/regen bonus", async () => {
    vi.useFakeTimers();
    try {
      const runtime = buildTwoTownNetworkRuntime();
      const before = capSnapshotFor(runtime, "player-1")!;

      runtime.submitCommand({
        commandId: "rd-lone-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 20, y: 16, structureType: "RAIL_DEPOT" })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(economicStructureBuildDurationMs("RAIL_DEPOT"));
      await Promise.resolve();

      const after = capSnapshotFor(runtime, "player-1")!;
      expect(after).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  // Tech-tree redesign: Rail Depot's job narrowed to Logistics Guild
  // amplification only — Ancillary Factory (Garrison Hall) network
  // amplification is now Assembly Works' exclusive job (config.ts's
  // RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL constant is reused,
  // just retargeted at Assembly Works).
  it("an Assembly Works amplifies a Garrison Hall elsewhere in the same connected-town network", async () => {
    vi.useFakeTimers();
    try {
      const runtime = buildTwoTownNetworkRuntime();

      runtime.submitCommand({
        commandId: "gh-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "GARRISON_HALL" })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(economicStructureBuildDurationMs("GARRISON_HALL"));
      await Promise.resolve();
      const withGarrisonHallOnly = capSnapshotFor(runtime, "player-1")!;

      runtime.submitCommand({
        commandId: "aw-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 20, y: 16, structureType: "ASSEMBLY_WORKS" })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(economicStructureBuildDurationMs("ASSEMBLY_WORKS"));
      await Promise.resolve();
      const withAssemblyWorksToo = capSnapshotFor(runtime, "player-1")!;

      expect(withAssemblyWorksToo - withGarrisonHallOnly).toBe(RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a second Rail Depot inside a connected-town network that already has one, even before the first finishes construction", async () => {
    const runtime = buildTwoTownNetworkRuntime();

    runtime.submitCommand({
      commandId: "rd-first",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "RAIL_DEPOT" })
    });
    await Promise.resolve();
    // Still under_construction at this point (no time has advanced) — the
    // uniqueness check must still catch it (see hasSupportedStructure's
    // includeUnderConstruction parameter).
    expect(
      runtime.exportState().tiles.some((t) => t.economicStructureJson?.includes("\"status\":\"under_construction\"") && t.economicStructureJson?.includes("RAIL_DEPOT"))
    ).toBe(true);

    const seen = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "rd-second",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 20, y: 16, structureType: "RAIL_DEPOT" })
    });
    await Promise.resolve();

    const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED");
    expect(rejected).toMatchObject({ code: "BUILD_INVALID", message: expect.stringContaining("connected town network already has a Rail Depot") });
    expect(runtime.exportState().tiles.filter((t) => t.economicStructureJson?.includes("RAIL_DEPOT")).length).toBe(1);
  });
});
