import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const actionFlowSource = (): string =>
  readFileSync(fileURLToPath(new URL("../client-action-flow.ts", import.meta.url)), "utf8");

describe("client action flow regressions", () => {
  it("suppresses per-tile warnings during connected-frontier bulk settlement", () => {
    expect(actionFlowSource()).toContain("requestSettlement(t.x, t.y, { forceQueue: true, suppressWarnings: true })");
  });

  it("keeps bulk frontier-claim warning and feed emission explicit", () => {
    const source = actionFlowSource();

    expect(source).toContain(
      'showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Frontier claim blocked", "No frontier claims queued. Targets must touch your territory and you need enough gold.")'
    );
    expect(source).not.toContain(
      'showCaptureAlert("Frontier claim blocked", "No frontier claims queued. Targets must touch your territory and you need enough gold.", "warn"); pushFeed('
    );
  });
});
