import { describe, expect, it } from "vitest";
import type { ResourceSupplyAgreementStatus } from "@border-empires/shared";
import { supplyTradeAttackWarning, supplyTradeAttackWarningsForTargets } from "./client-supply-trade-attack-warning.js";
import { gateAttackRowsOnTruce } from "../client-pact-attack-gate/client-pact-attack-gate.js";
import type { ActiveTruceView, TileActionDef } from "../client-types.js";

const row = (id: string, proposerId: string, targetId: string): ResourceSupplyAgreementStatus =>
  ({ id, proposerId, targetId, proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: 1, fulfilled: true });
const state = (agreements: ResourceSupplyAgreementStatus[]) => ({
  me: "me", meName: "Me", playerNames: new Map([["rival", "House <Rival>"], ["other", "Other"]]),
  leaderboard: { overall: [], selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined, byTiles: [], byIncome: [], byTechs: [] }, resourceTradeAgreements: agreements
});

describe("supply trade attack warning", () => {
  it("counts trades in both directions with only that House", () => {
    const s = state([row("a", "me", "rival"), row("b", "rival", "me"), row("c", "me", "other")]);
    expect(supplyTradeAttackWarning(s, "rival")).toBe("Attacking ends your 2 supply trades with House &lt;Rival&gt;");
    expect(supplyTradeAttackWarning(s, "other")).toBe("Attacking ends your 1 supply trade with Other");
  });
  it("says nothing without trades or against barbarians", () => {
    expect(supplyTradeAttackWarning(state([]), "rival")).toBeUndefined();
    expect(supplyTradeAttackWarning(state([row("a", "me", "barbarian-1")]), "barbarian-1")).toBeUndefined();
  });
  it("appends to enabled attack rows only, with or without a truce", () => {
    const rows: TileActionDef[] = [
      { id: "launch_attack", label: "Launch Attack", detail: "Win 60%" },
      { id: "attack_connected_region", label: "Attack Region", disabled: true, disabledReason: "No origin" },
      { id: "reveal_empire", label: "Reveal Empire" }
    ];
    gateAttackRowsOnTruce(rows, undefined, "Attacking ends your 1 supply trade with Other");
    expect(rows.map(r => r.detail)).toEqual(["Win 60% · Attacking ends your 1 supply trade with Other", undefined, undefined]);
    const truce: ActiveTruceView = { otherPlayerId: "rival", otherPlayerName: "Rival", startedAt: 1, endsAt: 2, createdByPlayerId: "me" };
    const truced: TileActionDef[] = [{ id: "launch_attack", label: "Launch Attack" }];
    gateAttackRowsOnTruce(truced, truce, "W");
    expect(truced[0]!.detail).toBe("Truce with Rival: attacking means breaking it first · W");
  });
});

describe("effort sheet supply warnings", () => {
  it("is plain text, one line per attacked House", () => {
    const s = state([row("a", "me", "rival"), row("c", "other", "me")]);
    expect(supplyTradeAttackWarningsForTargets(s, ["rival", "rival", "other", undefined]))
      .toBe("Attacking ends your 1 supply trade with House <Rival>. Attacking ends your 1 supply trade with Other");
    expect(supplyTradeAttackWarningsForTargets(s, ["nobody"])).toBeUndefined();
  });
});
