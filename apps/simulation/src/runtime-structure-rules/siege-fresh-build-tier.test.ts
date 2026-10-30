import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { afcModuleFixtureTile } from "../afc-test-fixture/afc-test-fixture.js";

// A fresh siege build resolves to the best tier the tech allows whose
// UMBRITE slots fit (siegeTierForFreshBuild): a player with Siegecraft who
// can't cover a Siege Tower's 2 UMBRITE slots gets a Siege Battery instead
// of a rejection, and the siege ladder never needs TITANIUM.
const runSiegeBuild = async (umbriteTiles: number) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", {
      id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
      techIds: new Set<string>(["leatherworking", "siegecraft"]),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local", allies: new Set<string>(), autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS },
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    }]]),
    initialState: {
      tiles: [
        afcModuleFixtureTile("player-1"),
        { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
        ...Array.from({ length: umbriteTiles }, (_, i) => (
          { x: 8 - i, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "UMBRITE" as const }
        )),
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
      ],
      activeLocks: [],
    },
  });
  const rejections: Array<{ code: string; message: string }> = [];
  runtime.onEvent((e) => { if (e.eventType === "COMMAND_REJECTED") rejections.push({ code: e.code, message: e.message }); });
  runtime.submitCommand({
    commandId: "siege-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
    type: "BUILD_SIEGE_BATTERY",
    payloadJson: JSON.stringify({ x: 10, y: 10 }),
  });
  await Promise.resolve();
  const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
  return { rejections, siegeBatteryJson: tile?.siegeBatteryJson };
};

describe("fresh siege build tier", () => {
  it("builds a Siege Tower on UMBRITE slots alone, with no TITANIUM", async () => {
    const { rejections, siegeBatteryJson } = await runSiegeBuild(2);
    expect(rejections).toEqual([]);
    expect(siegeBatteryJson).toContain('"variant":"SIEGE_TOWER"');
  });

  it("steps down to a Siege Battery when a Siege Tower's UMBRITE slots don't fit", async () => {
    const { rejections, siegeBatteryJson } = await runSiegeBuild(1);
    expect(rejections).toEqual([]);
    expect(siegeBatteryJson).toContain('"variant":"SIEGE_BATTERY"');
  });

  it("still rejects when not even a Siege Battery's UMBRITE slot fits", async () => {
    const { rejections, siegeBatteryJson } = await runSiegeBuild(0);
    expect(rejections.map((r) => r.code)).toEqual(["INSUFFICIENT_SLOT"]);
    expect(siegeBatteryJson).toBeUndefined();
  });
});
