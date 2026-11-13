import { describe, expect, it } from "vitest";
import { shouldShowMusterBattleCard, showMusterBattleCard } from "./client-muster-battle-alert.js";

const alert = (title: string, manpowerLoss?: number) => ({ title, detail: `${title} detail`, tone: "warn" as const, ...(manpowerLoss ? { manpowerLoss } : {}) });

describe("muster battle card", () => {
  it("only covers MARCH attacks, not ADVANCE patrols or neutral claims", () => {
    expect(shouldShowMusterBattleCard({ commandId: "territory-auto:muster-march:p:1,1:5", attackType: "ATTACK" })).toBe(true);
    expect(shouldShowMusterBattleCard({ commandId: "territory-auto:muster-march:p:1,1:5", attackType: "EXPAND" })).toBe(false);
    expect(shouldShowMusterBattleCard({ commandId: "territory-auto:muster-advance:p:1,1:5", attackType: "ATTACK" })).toBe(false);
  });

  it("shows the single result as is, then tallies further results and summed losses for the same flag", () => {
    const state: { captureAlert: any } = { captureAlert: undefined };
    showMusterBattleCard(state, "5,7", false, alert("Attack Beaten Back", 293), 1_000);
    expect(state.captureAlert).toEqual(expect.objectContaining({ title: "Attack Beaten Back", tone: "warn", manpowerLoss: 293 }));
    showMusterBattleCard(state, "5,7", true, alert("Territory Captured"), 2_000);
    expect(state.captureAlert).toEqual(expect.objectContaining({ title: "Flag (5, 7): 1 won · 1 lost", detail: "Territory Captured detail", manpowerLoss: 293 }));
  });

  it("starts fresh once the card expired or for another flag", () => {
    const state: { captureAlert: any } = { captureAlert: undefined };
    showMusterBattleCard(state, "5,7", false, alert("Attack Beaten Back", 50), 1_000);
    showMusterBattleCard(state, "5,7", true, alert("Territory Captured"), 60_000);
    expect(state.captureAlert).toEqual(expect.objectContaining({ title: "Territory Captured", tone: "success", musterTally: { won: 1, lost: 0 } }));
    expect(state.captureAlert.manpowerLoss).toBeUndefined();
    showMusterBattleCard(state, "9,9", false, alert("Attack Beaten Back", 10), 61_000);
    expect(state.captureAlert.title).toBe("Attack Beaten Back");
  });
});
