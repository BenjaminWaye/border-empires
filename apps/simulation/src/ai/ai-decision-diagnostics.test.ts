import { describe, expect, it } from "vitest";

import type { AutomationPlannerDiagnostic } from "./automation-command-planner-types.js";
import {
  getAiDecisionDiagnostics,
  recordAiCommandRejectionMessage,
  recordAiDecisionDiagnosticFromPlanner
} from "./ai-decision-diagnostics.js";

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

describe("recordAiDecisionDiagnosticFromPlanner — frontierOriginKeysSample", () => {
  // Answers "what tile is the AI stuck scanning" from /admin/debug/ai/decisions
  // directly, without a live gRPC/SQLite lookup against the running sim.
  it("carries the frontier-scan origin tile keys through from the planner diagnostic", () => {
    recordAiDecisionDiagnosticFromPlanner(
      baseDiagnostic({
        playerId: "ai-decision-diag-test-origin-1",
        frontierOriginKeysSample: ["12,34", "12,35"]
      })
    );

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-origin-1");
    expect(recorded).toMatchObject({ frontierOriginKeysSample: ["12,34", "12,35"] });
  });

  it("defaults to an empty array when the planner diagnostic omits it", () => {
    recordAiDecisionDiagnosticFromPlanner(baseDiagnostic({ playerId: "ai-decision-diag-test-origin-2" }));

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-origin-2");
    expect(recorded.frontierOriginKeysSample).toEqual([]);
  });
});

describe("recordAiDecisionDiagnosticFromPlanner — priority-ladder tier counts", () => {
  // Distinguishes "fell through to the plain frontier list because the hot
  // set was genuinely empty" (hotFrontierTileCountInput 0) from "these
  // origins came from the cached hot set" (hotFrontierTileCountInput > 0) —
  // the latter combined with frontierOriginExplanations showing reason:
  // "none" is a stale hotFrontierTileKeys index entry, not a healthy fallback.
  it("carries the tier counts through from the planner diagnostic", () => {
    recordAiDecisionDiagnosticFromPlanner(
      baseDiagnostic({
        playerId: "ai-decision-diag-test-tiers-1",
        hotFrontierTileCountInput: 8,
        strategicFrontierTileCountInput: 0,
        frontierTileCountInput: 421
      })
    );

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-tiers-1");
    expect(recorded).toMatchObject({
      hotFrontierTileCountInput: 8,
      strategicFrontierTileCountInput: 0,
      frontierTileCountInput: 421
    });
  });

  it("defaults to zero when the planner diagnostic omits them", () => {
    recordAiDecisionDiagnosticFromPlanner(baseDiagnostic({ playerId: "ai-decision-diag-test-tiers-2" }));

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-tiers-2");
    expect(recorded).toMatchObject({
      hotFrontierTileCountInput: 0,
      strategicFrontierTileCountInput: 0,
      frontierTileCountInput: 0
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

describe("recordAiCommandRejectionMessage", () => {
  // Most command rejections collapse to the same generic "BUILD_INVALID"
  // code (see sim_ai_command_rejected_code_total) — the message is what
  // actually disambiguates the reason, so it must survive into the
  // per-player decision diagnostic ring buffer, not just the metrics.
  it("attaches the most recent rejection to subsequently recorded diagnostics for that player", () => {
    recordAiCommandRejectionMessage(
      "ai-decision-diag-test-5",
      "BUILD_ECONOMIC_STRUCTURE",
      "BUILD_INVALID",
      "needs an open support tile next to this town"
    );
    recordAiDecisionDiagnosticFromPlanner(baseDiagnostic({ playerId: "ai-decision-diag-test-5" }));

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-5");
    expect(recorded.lastRejection).toMatchObject({
      commandType: "BUILD_ECONOMIC_STRUCTURE",
      code: "BUILD_INVALID",
      message: "needs an open support tile next to this town"
    });
  });

  it("is undefined when no rejection has been recorded for that player", () => {
    recordAiDecisionDiagnosticFromPlanner(baseDiagnostic({ playerId: "ai-decision-diag-test-6" }));

    const [recorded] = getAiDecisionDiagnostics("ai-decision-diag-test-6");
    expect(recorded.lastRejection).toBeUndefined();
  });
});
