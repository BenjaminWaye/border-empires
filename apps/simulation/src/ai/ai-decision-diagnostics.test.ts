import { describe, expect, it } from "vitest";

import type { AutomationPlannerDiagnostic } from "./automation-command-planner-types.js";
import { getAiDecisionDiagnostics, recordAiDecisionDiagnosticFromPlanner } from "./ai-decision-diagnostics.js";

const baseDiagnostic = (overrides: Partial<AutomationPlannerDiagnostic> = {}): AutomationPlannerDiagnostic => ({
  playerId: "ai-4",
  sessionPrefix: "ai-runtime",
  frontierEnemyTargetCount: 0,
  frontierNeutralTargetCount: 1,
  canAttack: true,
  canExpand: true,
  utilityScores: { EXPAND: 0.5, ATTACK: 0, MUSTER: 0, BUILD_DEFENSE: 0, BUILD_ECONOMY: 0, CHOOSE_TECH: 0, WAIT: 0.05 },
  ...overrides
});

describe("recordAiDecisionDiagnosticFromPlanner — neighborCandidateTotal / missingNeighborTileCount", () => {
  it("carries the sync-scope-gap diagnostic fields through from the planner diagnostic", () => {
    recordAiDecisionDiagnosticFromPlanner(
      baseDiagnostic({
        playerId: "ai-decision-diag-test-1",
        neighborCandidateTotal: 40,
        missingNeighborTileCount: 33
      })
    );

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-1");
    expect(recorded).toMatchObject({
      neighborCandidateTotal: 40,
      missingNeighborTileCount: 33
    });
  });

  it("defaults to zero when the planner diagnostic omits the fields (older callers/tests)", () => {
    recordAiDecisionDiagnosticFromPlanner(baseDiagnostic({ playerId: "ai-decision-diag-test-2" }));

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-2");
    expect(recorded).toMatchObject({
      neighborCandidateTotal: 0,
      missingNeighborTileCount: 0
    });
  });
});

describe("recordAiDecisionDiagnosticFromPlanner — economicBuildCandidate", () => {
  // Regression: AiDecisionDiagnostic is an explicit field allowlist copied
  // from AutomationPlannerDiagnostic — a new planner diagnostic field is
  // silently dropped from /admin/debug/ai/decisions unless it's also added
  // here. economicBuildCandidate was added to the planner type without this
  // mapping, so it always showed as undefined regardless of the real value.
  it("carries the picked build candidate through from the planner diagnostic", () => {
    recordAiDecisionDiagnosticFromPlanner(
      baseDiagnostic({
        playerId: "ai-decision-diag-test-3",
        economicBuildCandidate: "12,7:MARKET"
      })
    );

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-3");
    expect(recorded).toMatchObject({ economicBuildCandidate: "12,7:MARKET" });
  });

  it("is undefined when the planner diagnostic has no build candidate", () => {
    recordAiDecisionDiagnosticFromPlanner(baseDiagnostic({ playerId: "ai-decision-diag-test-4" }));

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-4");
    expect(recorded.economicBuildCandidate).toBeUndefined();
  });
});
