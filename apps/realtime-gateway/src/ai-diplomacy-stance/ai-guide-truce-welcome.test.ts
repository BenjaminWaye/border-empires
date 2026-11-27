import { emptyDiplomacyTerms, evaluateAiOffer } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { createAiDiplomacyMemory } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { everTrucedAnAi, GUIDE_TRUCE_STEP_ID, guideTruceWelcomeApplies, onGuideTruceStep, welcomeGuideTruce } from "./ai-guide-truce-welcome.js";
import { memory, NOW, price } from "./ai-diplomacy-pricing-test-helpers.js";

// Owner, 2026-11-26: the guide walks a new player to their first truce, and the
// AI should be extra ready to accept it, not counter with a price they can't read yet.
describe("the guide's truce welcome", () => {
  it("is on only while the guide runs, has reached Diplomacy, and its truce step isn't saved", () => {
    expect(onGuideTruceStep({ guideStatus: "active", guideSteps: ["look-pan", "diplomacy-truce"] })).toBe(true);
    expect(onGuideTruceStep({ guideStatus: "active", guideSteps: ["look-pan"] })).toBe(false);
    expect(onGuideTruceStep({ guideStatus: "active", guideSteps: ["diplomacy-truce", GUIDE_TRUCE_STEP_ID] })).toBe(false);
    expect(onGuideTruceStep({ guideStatus: "done", guideSteps: [] })).toBe(false);
    expect(onGuideTruceStep({ guideStatus: "dismissed" })).toBe(false);
    expect(onGuideTruceStep(undefined)).toBe(false);
  });

  it("never applies to a truce-breaker or a player who already made a truce with an AI", () => {
    expect(guideTruceWelcomeApplies({ requesterOnGuideTruceStep: true, requesterBrokeTruceWithAi: false })).toBe(true);
    expect(guideTruceWelcomeApplies({ requesterOnGuideTruceStep: true, requesterBrokeTruceWithAi: true })).toBe(false);
    expect(guideTruceWelcomeApplies({ requesterOnGuideTruceStep: true, requesterBrokeTruceWithAi: false, requesterEverTrucedAnAi: true })).toBe(false);
    expect(guideTruceWelcomeApplies({ requesterBrokeTruceWithAi: false })).toBe(false);
  });

  // Review of #3012: the old check was the pair's fading truceDeals (< 1), which
  // drops below 1 a moment after the deal, so the same player got free truce after
  // free truce. The flag is per player across every AI and doesn't fade.
  it("stays spent after the truce deal fades, and across every AI", () => {
    let now = 1_000_000;
    const memory = createAiDiplomacyMemory({ now: () => now, isAi: (id) => id.startsWith("ai-") });
    const ais = ["ai-1", "ai-2"];
    expect(everTrucedAnAi(ais, "p1", memory.view)).toBe(false);
    memory.recordTruceDeal("ai-1", "p1");
    now += 3 * 24 * 60 * 60_000;
    expect(memory.view("ai-1", "p1").truceDeals).toBeLessThan(1);
    expect(everTrucedAnAi(ais, "p1", memory.view)).toBe(true);
    expect(everTrucedAnAi(["ai-2"], "p1", memory.view)).toBe(false);
    expect(everTrucedAnAi(ais, "p2", memory.view)).toBe(false);
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
