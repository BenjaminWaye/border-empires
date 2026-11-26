import { emptyDiplomacyTerms, evaluateAiOffer } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { GUIDE_TRUCE_STEP_ID, guideTruceWelcomeApplies, onGuideTruceStep, welcomeGuideTruce } from "./ai-guide-truce-welcome.js";
import { memory, NOW, price } from "./ai-diplomacy-pricing-test-helpers.js";

// Owner, 2026-11-26: the guide walks a new player to their first truce, and the
// AI should be extra ready to accept it, not counter with a price they can't read yet.
describe("the guide's truce welcome", () => {
  it("is on only while the guide runs and its truce step isn't saved", () => {
    expect(onGuideTruceStep({ guideStatus: "active", guideSteps: ["diplomacy-truce"] })).toBe(true);
    expect(onGuideTruceStep({ guideStatus: "active", guideSteps: [GUIDE_TRUCE_STEP_ID] })).toBe(false);
    expect(onGuideTruceStep({ guideStatus: "done", guideSteps: [] })).toBe(false);
    expect(onGuideTruceStep({ guideStatus: "dismissed" })).toBe(false);
    expect(onGuideTruceStep(undefined)).toBe(false);
  });

  it("never applies to a truce-breaker or a pair that already made a truce", () => {
    expect(guideTruceWelcomeApplies({ requesterOnGuideTruceStep: true, requesterBrokeTruceWithAi: false, memory: memory() })).toBe(true);
    expect(guideTruceWelcomeApplies({ requesterOnGuideTruceStep: true, requesterBrokeTruceWithAi: true, memory: memory() })).toBe(false);
    expect(guideTruceWelcomeApplies({ requesterOnGuideTruceStep: true, requesterBrokeTruceWithAi: false, memory: memory({ truceDeals: 1 }) })).toBe(false);
    expect(guideTruceWelcomeApplies({ requesterBrokeTruceWithAi: false, memory: memory() })).toBe(false);
  });

  it("turns a priced truce into an empty offer the AI accepts", () => {
    const usual = price({ memory: memory({ lastPlayerAttackAt: NOW - 12 * 60 * 60_000, lastCombatAt: NOW - 12 * 60 * 60_000 }), aiIncome: 5 });
    expect(usual.pricing.required.truce12).toBeGreaterThan(0);
    expect(evaluateAiOffer(usual.pricing, "truce", 12, emptyDiplomacyTerms()).accepts).toBe(false);
    const welcomed = welcomeGuideTruce(usual);
    expect(welcomed.pricing.required.truce12).toBe(0);
    expect(welcomed.pricing.required.truce24).toBe(0);
    expect(evaluateAiOffer(welcomed.pricing, "truce", 12, emptyDiplomacyTerms())).toEqual({ accepts: true });
    expect(welcomed.pricing.required.alliance).toBe(usual.pricing.required.alliance);
  });

  it("lifts a refusal right after an attack", () => {
    const refused = price({ memory: memory({ lastPlayerAttackAt: NOW - 5 * 60_000, lastCombatAt: NOW - 5 * 60_000 }) });
    expect(refused.truceRefusal).toBeDefined();
    const welcomed = welcomeGuideTruce(refused);
    expect(welcomed.truceRefusal).toBeUndefined();
    expect(evaluateAiOffer(welcomed.pricing, "truce", 12, emptyDiplomacyTerms())).toEqual({ accepts: true });
  });

  it("keeps a payment the AI already offered for peace", () => {
    const base = price({});
    const paying = { ...base, pricing: { ...base.pricing, required: { ...base.pricing.required, truce12: -30, truce24: -30 } } };
    expect(welcomeGuideTruce(paying).pricing.required.truce12).toBe(-30);
  });
});
