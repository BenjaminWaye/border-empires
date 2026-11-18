import { describe, expect, it } from "vitest";
import { answerDiplomacyStanceQuery, type DiplomacyStanceQueryDeps } from "./diplomacy-stance-query.js";

// Playtest 2026-11-17: an offer to Astrid was refused with "Astrid already has
// 16/16 active supply agreements" only after pressing Send. The trade screen's
// stance query now says up front when the other House is at its limit.
const deps = (counts: Record<string, number | undefined>): DiplomacyStanceQueryDeps => ({
  resolvePlayerByName: name => (name === "Astrid" ? { id: "p2", name: "Astrid" } : undefined),
  isAutoRespondingAi: () => false,
  fetchAiSnapshot: async () => undefined,
  requesterSnapshot: async () => undefined,
  diplomacyContext: () => { throw new Error("not used for a human target"); },
  supplyAgreementCount: async id => counts[id]
});
describe("stance reply: other House's supply agreement limit", () => {
  it("flags a target at its limit", async () => {
    expect(await answerDiplomacyStanceQuery(deps({ p2: 16 }), "p1", "Astrid")).toMatchObject({ found: true, supplyAgreementsFull: true });
  });
  it("omits the flag below the limit or when the count is unknown", async () => {
    expect(await answerDiplomacyStanceQuery(deps({ p2: 15 }), "p1", "Astrid")).not.toHaveProperty("supplyAgreementsFull");
    expect(await answerDiplomacyStanceQuery(deps({}), "p1", "Astrid")).not.toHaveProperty("supplyAgreementsFull");
  });
  it("drops the flag, not the reply, when the count lookup fails", async () => {
    const failing = { ...deps({}), supplyAgreementCount: () => { throw new Error("snapshot unavailable"); } };
    expect(await answerDiplomacyStanceQuery(failing, "p1", "Astrid")).toMatchObject({ found: true, ai: false });
  });
  it("flags a full AI target even when its evaluation can't be read", async () => {
    // No AI snapshot: the evaluation is skipped, but the reply still carries the flag.
    const ai = { ...deps({ p2: 16 }), isAutoRespondingAi: () => true, diplomacyContext: () => ({}) as never };
    await expect(answerDiplomacyStanceQuery(ai, "p1", "Astrid")).resolves.toMatchObject({ ai: true, supplyAgreementsFull: true });
  });
});
