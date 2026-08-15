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

  it("keeps the generic build handler blocking a second build on a tile with a settle-then-build queued", () => {
    const source = actionFlowSource();

    expect(source).toContain(
      'showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Build already queued", "A build is already queued for this tile.")'
    );
    expect(source).toContain("state.autoSettleTargets.add(targetKey);");
    expect(source).toContain("state.autoBuildTargets.set(targetKey, structureType);");
  });

  it("opens the tile detail panel for a fogged tile using cached data instead of showing nothing", () => {
    const source = actionFlowSource();

    expect(source).toContain('if (vis === "fogged") {');
    expect(source).toContain('if (clicked) openSingleTileActionMenu(clicked, clientX, clientY);');
  });

  it("lets the generic build handler queue settle+build on the player's own active frontier-expansion target", () => {
    const source = actionFlowSource();

    expect(source).toContain(
      'const isActiveCaptureTarget = Boolean(state.capture && state.capture.target.x === selected.x && state.capture.target.y === selected.y);'
    );
    expect(source).toContain('if (selected.ownerId !== state.me && !isActiveCaptureTarget) { hideTileActionMenu(); return; }');
    expect(source).toContain('if (!isActiveCaptureTarget) requestSettlement(selected.x, selected.y);');
  });

  it("re-pressing a tile mid own-expansion jumps to the buildings tab instead of the progress tab", () => {
    const source = actionFlowSource();

    expect(source).toContain('openSingleTileActionMenu(to, clientX, clientY, isActiveCapture ? { openTab: "buildings" } : undefined);');
  });

  it("marks the tile menu view as pending ownership while the player's own expansion is targeting it", () => {
    const source = actionFlowSource();

    expect(source).toContain(
      'pendingOwnershipTile: Boolean(state.capture && state.capture.target.x === menuTile.x && state.capture.target.y === menuTile.y)'
    );
  });
});
