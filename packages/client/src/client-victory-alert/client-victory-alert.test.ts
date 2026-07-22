import { describe, expect, it } from "vitest";

import {
  formatHoldCountdown,
  soonestHoldingObjective,
  victoryHoldAlertDetail,
  victoryHoldAlertFor,
  victoryHoldAlertKey,
  victoryHoldAlertTitle,
  victoryHoldBannerText
} from "./client-victory-alert.js";
import type { SeasonVictoryObjectiveView } from "../client-types.js";

const objective = (overrides: Partial<SeasonVictoryObjectiveView>): SeasonVictoryObjectiveView => ({
  id: "TOWN_CONTROL",
  name: "Town Control",
  description: "Hold 50% of towns.",
  leaderName: "Alpha",
  progressLabel: "42/60 towns",
  thresholdLabel: "Need 60 towns",
  holdDurationSeconds: 86_400,
  statusLabel: "Holding pressure",
  conditionMet: true,
  ...overrides
});

describe("formatHoldCountdown", () => {
  it("shows seconds under a minute", () => {
    expect(formatHoldCountdown(42)).toBe("42s");
    expect(formatHoldCountdown(0)).toBe("0s");
  });

  it("shows minutes under an hour", () => {
    expect(formatHoldCountdown(125)).toBe("3m");
    expect(formatHoldCountdown(3540)).toBe("59m");
  });

  it("shows hours and minutes above an hour", () => {
    expect(formatHoldCountdown(3600)).toBe("1h");
    expect(formatHoldCountdown(86_280)).toBe("23h 58m");
  });

  it("clamps negative input to zero", () => {
    expect(formatHoldCountdown(-5)).toBe("0s");
  });
});

describe("soonestHoldingObjective", () => {
  it("returns undefined when nothing is holding", () => {
    const objectives = [objective({ conditionMet: false })];
    expect(soonestHoldingObjective(objectives)).toBeUndefined();
  });

  it("ignores objectives with conditionMet but no holdRemainingSeconds (hold not yet tracked)", () => {
    const objectives = [objective({ conditionMet: true })];
    expect(soonestHoldingObjective(objectives)).toBeUndefined();
  });

  it("picks the objective with the least remaining hold time", () => {
    const objectives = [
      objective({ id: "TOWN_CONTROL", holdRemainingSeconds: 3600 }),
      objective({ id: "MARITIME_SUPREMACY", name: "Maritime Supremacy", holdRemainingSeconds: 120 }),
      objective({ id: "RESOURCE_MONOPOLY", name: "Resource Monopoly", holdRemainingSeconds: 7200 })
    ];
    expect(soonestHoldingObjective(objectives)?.id).toBe("MARITIME_SUPREMACY");
  });

  it("breaks ties deterministically by objective id", () => {
    const objectives = [
      objective({ id: "TOWN_CONTROL", holdRemainingSeconds: 60 }),
      objective({ id: "MARITIME_SUPREMACY", name: "Maritime Supremacy", holdRemainingSeconds: 60 })
    ];
    expect(soonestHoldingObjective(objectives)?.id).toBe("MARITIME_SUPREMACY");
  });

  it("skips objectives whose condition is no longer met", () => {
    const objectives = [
      objective({ id: "TOWN_CONTROL", conditionMet: false, holdRemainingSeconds: 30 }),
      objective({ id: "MARITIME_SUPREMACY", name: "Maritime Supremacy", holdRemainingSeconds: 500 })
    ];
    expect(soonestHoldingObjective(objectives)?.id).toBe("MARITIME_SUPREMACY");
  });
});

const NOW = 1_700_000_000_000;

describe("victoryHoldAlertFor", () => {
  it("returns undefined when no objective is holding", () => {
    expect(victoryHoldAlertFor([objective({ conditionMet: false })], "me", NOW)).toBeUndefined();
  });

  it("marks isSelfLeader when the current player is the leader", () => {
    const alert = victoryHoldAlertFor(
      [objective({ leaderPlayerId: "me", leaderName: "You", holdRemainingSeconds: 300 })],
      "me",
      NOW
    );
    expect(alert?.isSelfLeader).toBe(true);
  });

  it("marks isSelfLeader false for other players' leads", () => {
    const alert = victoryHoldAlertFor(
      [objective({ leaderPlayerId: "rival-1", leaderName: "Rival", holdRemainingSeconds: 300 })],
      "me",
      NOW
    );
    expect(alert?.isSelfLeader).toBe(false);
  });

  it("builds a stable key from objective id and leader", () => {
    const alert = victoryHoldAlertFor(
      [objective({ leaderPlayerId: "rival-1", holdRemainingSeconds: 300 })],
      "me",
      NOW
    );
    expect(alert?.key).toBe(victoryHoldAlertKey("TOWN_CONTROL", "rival-1"));
  });

  it("converts holdRemainingSeconds into an absolute deadline", () => {
    const alert = victoryHoldAlertFor(
      [objective({ leaderPlayerId: "rival-1", holdRemainingSeconds: 300 })],
      "me",
      NOW
    );
    expect(alert?.holdEndsAt).toBe(NOW + 300_000);
  });
});

describe("victoryHoldAlertTitle / victoryHoldAlertDetail / victoryHoldBannerText", () => {
  it("uses second-person framing when self is leading", () => {
    const alert = victoryHoldAlertFor(
      [objective({ leaderPlayerId: "me", leaderName: "You", holdRemainingSeconds: 300 })],
      "me",
      NOW
    )!;
    expect(victoryHoldAlertTitle(alert)).toContain("You're");
    expect(victoryHoldAlertDetail(alert, NOW)).toContain("Hold Town Control");
    expect(victoryHoldBannerText(alert, NOW)).toContain("You're winning");
  });

  it("names the leader when someone else is leading", () => {
    const alert = victoryHoldAlertFor(
      [objective({ leaderPlayerId: "rival-1", leaderName: "Rival", holdRemainingSeconds: 300 })],
      "me",
      NOW
    )!;
    expect(victoryHoldAlertTitle(alert)).toContain("Rival is closing in");
    expect(victoryHoldAlertDetail(alert, NOW)).toContain("Rival will win via Town Control");
    expect(victoryHoldBannerText(alert, NOW)).toContain("Rival winning");
  });

  it("counts down as time passes toward the deadline", () => {
    const alert = victoryHoldAlertFor(
      [objective({ leaderPlayerId: "rival-1", leaderName: "Rival", holdRemainingSeconds: 300 })],
      "me",
      NOW
    )!;
    expect(victoryHoldBannerText(alert, NOW)).toContain("5m");
    expect(victoryHoldBannerText(alert, NOW + 240_000)).toContain("1m");
  });
});
