import { describe, expect, it, vi } from "vitest";
import { frontierClaimBlockedMessage, reportBulkFrontierClaim } from "./client-frontier-claim-blocked.js";

describe("frontierClaimBlockedMessage", () => {
  const base = { frontierSyncWaitUntilByTarget: new Map<string, number>(), queuedTargetKeys: new Set<string>() };

  it("never blames coin (frontier claims are free)", () => {
    expect(frontierClaimBlockedMessage(base, ["5,5"])).not.toMatch(/coin/i);
    expect(frontierClaimBlockedMessage(base, ["5,5", "6,6"])).not.toMatch(/coin/i);
  });

  it("explains a short dispatch wait instead of reachability", () => {
    const state = { ...base, frontierSyncWaitUntilByTarget: new Map([["5,5", 2_000]]) };
    expect(frontierClaimBlockedMessage(state, ["5,5"], 1_000)).toMatch(/getting ready/);
  });

  it("does not blame the wait when other targets are simply out of reach", () => {
    const state = { ...base, frontierSyncWaitUntilByTarget: new Map([["5,5", 2_000]]) };
    expect(frontierClaimBlockedMessage(state, ["5,5", "9,9"], 1_000)).toMatch(/beyond your borders/);
  });

  it("says settlers are already on the way when every tile is queued", () => {
    const state = { ...base, queuedTargetKeys: new Set(["5,5"]) };
    expect(frontierClaimBlockedMessage(state, ["5,5"])).toMatch(/already on their way/);
  });
});

describe("reportBulkFrontierClaim", () => {
  const state = { frontierSyncWaitUntilByTarget: new Map<string, number>(), queuedTargetKeys: new Set<string>() };

  it("warns with the real reason when nothing was queued", () => {
    const deps = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    reportBulkFrontierClaim(state, { queued: 0, skipped: 2 }, ["5,5", "6,6"], deps);
    expect(deps.showCaptureAlert).toHaveBeenCalledWith("Settlers held back", expect.stringMatching(/beyond your borders/), "warn");
  });

  it("only posts a feed line when something was queued", () => {
    const deps = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    reportBulkFrontierClaim(state, { queued: 3, skipped: 1 }, ["5,5"], deps);
    expect(deps.showCaptureAlert).not.toHaveBeenCalled();
    expect(deps.pushFeed).toHaveBeenCalledWith("Queued 3 frontier captures (1 unreachable).", "combat", "info");
  });
});
