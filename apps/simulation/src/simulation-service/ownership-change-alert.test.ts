import { describe, expect, it } from "vitest";

import { buildTownLostAlert, isSettlementTierTownLoss, resolveEnvironmentLabel } from "./ownership-change-alert.js";
import type { OwnershipChangeSample } from "../runtime/runtime-ownership-change-sample.js";

const baseSample: OwnershipChangeSample = {
  tileKey: "207,89",
  x: 207,
  y: 89,
  previousOwnerId: "ai-1",
  nextOwnerId: "ai-2",
  commandId: "ai-runtime-ai-2-4926-1784400152911",
  hadTown: true,
  townLost: true,
  hadOwnershipState: "SETTLED",
  previousTownPopulationTier: undefined
};

describe("isSettlementTierTownLoss", () => {
  it("skips the alert when the razed town was SETTLEMENT tier", () => {
    expect(isSettlementTierTownLoss("SETTLEMENT")).toBe(true);
  });

  it("keeps the alert for surviving-town tiers like TOWN or CITY", () => {
    expect(isSettlementTierTownLoss("TOWN")).toBe(false);
    expect(isSettlementTierTownLoss("CITY")).toBe(false);
  });

  it("keeps the alert when there is no tier info (e.g. lostSettled path, not a town capture)", () => {
    expect(isSettlementTierTownLoss(undefined)).toBe(false);
  });
});

describe("resolveEnvironmentLabel", () => {
  it("labels production as prod", () => {
    expect(resolveEnvironmentLabel({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("prod");
  });

  it("labels staging as staging", () => {
    expect(resolveEnvironmentLabel({ NODE_ENV: "staging" } as NodeJS.ProcessEnv)).toBe("staging");
  });

  it("falls back to FLY_APP_NAME, then unknown", () => {
    expect(resolveEnvironmentLabel({ FLY_APP_NAME: "some-app" } as NodeJS.ProcessEnv)).toBe("some-app");
    expect(resolveEnvironmentLabel({} as NodeJS.ProcessEnv)).toBe("unknown");
  });
});

describe("buildTownLostAlert", () => {
  it("marks the alert skipped, tags the log, and omits the Slack payload for a SETTLEMENT-tier loss", () => {
    const alert = buildTownLostAlert({ ...baseSample, previousTownPopulationTier: "SETTLEMENT" }, "staging", "border-empires");
    expect(alert.skippedSettlementTier).toBe(true);
    expect(alert.logFields.alertSkippedSettlementTier).toBe(true);
    expect(alert.slackBody).toBeUndefined();
  });

  it("does not mark the alert skipped for a surviving-tier loss, and builds a Slack payload tagged with the environment", () => {
    const alert = buildTownLostAlert({ ...baseSample, previousTownPopulationTier: "TOWN" }, "staging", "border-empires");
    expect(alert.skippedSettlementTier).toBe(false);
    expect(alert.message).toContain("(staging)");
    expect(alert.slackBody).toBeDefined();
    expect(JSON.stringify(alert.slackBody)).toContain("staging");
  });

  it("does not repeat the environment label a second time via the label prefix (only the embedded message carries it, once)", () => {
    const alert = buildTownLostAlert({ ...baseSample, previousTownPopulationTier: "TOWN" }, "staging", "border-empires");
    const wrapperText = alert.slackBody?.text ?? "";
    expect(wrapperText.match(/\(staging\)/g)).toHaveLength(1);
    expect(wrapperText).toContain("border-empires");
  });
});
