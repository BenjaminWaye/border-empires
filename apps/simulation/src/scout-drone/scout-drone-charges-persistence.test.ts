import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";

// Owner request (2026-11-20): a restart must not refund spent scout drone charges. The spends live
// on the player record (scoutChargeSpends) and must survive every way it is saved and restored.
describe("scout drone charge persistence", () => {
  const runtimeWith = (spends?: number[]) =>
    new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: {
        tiles: [],
        activeLocks: [],
        players: [
          { id: "scout", isAi: false, points: 0, manpower: 100, techIds: [], domainIds: [], allies: [], autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }, ...(spends ? { scoutChargeSpends: spends } : {}) }
        ]
      }
    });

  it("restores spends from a saved state and saves them again in the export and the snapshot", () => {
    const runtime = runtimeWith([500, 900]);
    expect(runtime.exportState().players.find((player) => player.id === "scout")?.scoutChargeSpends).toEqual([500, 900]);
    const sections = runtime.exportSnapshotSections();
    expect(JSON.stringify(sections)).toContain('"scoutChargeSpends":[500,900]');
  });

  it("writes nothing for a player who never spent a charge", () => {
    expect(runtimeWith().exportState().players.find((player) => player.id === "scout")?.scoutChargeSpends).toBeUndefined();
  });
});
