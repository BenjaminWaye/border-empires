import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client domain/tech rejection banner regression", () => {
  // DOMAIN_INVALID and TECH_INVALID rejections used to land only in the
  // activity feed; players read the feed as ambient chatter and missed the
  // explanation entirely. The COMMAND_REJECTED handler now routes these codes
  // through showCaptureAlertSafely so they raise a banner alongside the feed
  // entry. If the branches are removed during a refactor, this test fails so
  // the regression is caught before it ships.
  it("routes DOMAIN_ and TECH_ rejections through the captureAlert banner", () => {
    const networkSource = readFileSync(new URL("../client-network/client-network.ts", import.meta.url), "utf8");

    expect(networkSource).toContain('errorCode.startsWith("DOMAIN_")');
    expect(networkSource).toContain('errorCode.startsWith("TECH_")');
    expect(networkSource).toContain('showCaptureAlertSafely("Domain pick failed"');
    expect(networkSource).toContain('showCaptureAlertSafely("Research failed"');
  });

  it("uses friendlier copy than the default Error CODE fallback for DOMAIN_INVALID and TECH_INVALID", () => {
    const actionsSource = readFileSync(new URL("../client-player-actions.ts", import.meta.url), "utf8");

    expect(actionsSource).toContain('if (code === "DOMAIN_INVALID") return `Domain pick failed: ${message}.`;');
    expect(actionsSource).toContain('if (code === "TECH_INVALID") return `Research failed: ${message}.`;');
  });
});
