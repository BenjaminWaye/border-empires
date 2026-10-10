import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { DEFAULT_AUTO_SETTLE_PREFS, buildDurationWithSpeedMult, fortBuildDurationMs } from "@border-empires/shared";
import { afcModuleFixtureTile } from "../afc-test-fixture/afc-test-fixture.js";

// The client's build menus predict build time with the same shared rule
// (structureBuildSpeedEffectKey + buildDurationWithSpeedMult); this pins the
// server side of that contract.
const fortWindowMs = async (domainIds: string[]): Promise<number> => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", {
      id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
      techIds: new Set<string>(["masonry"]), domainIds: new Set<string>(domainIds),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local", allies: new Set<string>(), autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS },
      strategicResources: { FOOD: 0, TITANIUM: 200, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    }]]),
    initialState: {
      tiles: [
        afcModuleFixtureTile("player-1"),
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
        { x: 30, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
      ],
      activeLocks: [],
    },
  });
  runtime.submitCommand({
    commandId: "fort-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
    type: "BUILD_STRUCTURE",
    payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "FORT" }),
  });
  await Promise.resolve();
  const fort = JSON.parse(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson ?? "{}");
  return fort.completesAt - fort.startedAt;
};

describe("BUILD_STRUCTURE build-speed effects", () => {
  it("builds a Fort in its base time without a speed effect", async () => {
    expect(await fortWindowMs([])).toBe(fortBuildDurationMs("FORT"));
  });

  it("shortens a Fort by the Dwarf Kingdom domain's fortBuildSpeedMult (1.5)", async () => {
    expect(await fortWindowMs(["titanium-bastions"])).toBe(buildDurationWithSpeedMult(fortBuildDurationMs("FORT"), 1.5));
  });
});
