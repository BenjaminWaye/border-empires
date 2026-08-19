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
      'const isPendingExpansionTarget = (state: Pick<ClientState, "capture">, x: number, y: number): boolean =>\n  Boolean(state.capture && state.capture.actionType === "EXPAND" && state.capture.target.x === x && state.capture.target.y === y);'
    );
    expect(source).toContain('const isActiveCaptureTarget = isPendingExpansionTarget(state, selected.x, selected.y);');
    expect(source).toContain('if (selected.ownerId !== state.me && !isActiveCaptureTarget) { hideTileActionMenu(); return; }');
    expect(source).toContain('if (!isActiveCaptureTarget) requestSettlement(selected.x, selected.y);');
  });

  it("re-pressing a tile mid own-expansion jumps to the buildings tab instead of the progress tab", () => {
    const source = actionFlowSource();

    expect(source).toContain(
      'if (activeTile) openSingleTileActionMenu(activeTile, clientX, clientY, isActiveCapture ? { openTab: "buildings" } : undefined);'
    );
  });

  it("marks the tile menu view as pending ownership only for the player's own EXPAND capture, not an ATTACK", () => {
    const source = actionFlowSource();

    expect(source).toContain('pendingOwnershipTile: isPendingExpansionTarget(state, menuTile.x, menuTile.y)');
  });

  it("routes a fogged tile adjacent to owned territory into a direct frontier-expand claim instead of just the description menu", () => {
    const source = actionFlowSource();

    // Previously clicking any fogged tile unconditionally opened the tile
    // description menu, with no path to actually starting an expand into it
    // even when it touched the player's own territory.
    expect(source).toContain('const isLand = clicked?.terrain === "LAND";');
    expect(source).toContain('const isNeutral = !clicked?.ownerId;');
    expect(source).toContain(
      'const frontierOrigin = isLand && isNeutral ? (pickOriginForTarget(wx, wy, false) ?? pickOriginForTarget(wx, wy, false, true)) : undefined;'
    );
  });

  it("routes an unexplored tile adjacent to owned territory into a direct frontier-expand claim instead of the waypoint-only menu", () => {
    const source = actionFlowSource();

    // Previously an unexplored tile always went through
    // openUnexploredTileActionMenu, whose only possible action is a
    // multi-hop waypoint — and that helper explicitly declines to offer
    // even a waypoint when the tile is adjacent-reachable, so an
    // unexplored tile touching the player's territory offered nothing.
    expect(source).toContain("openUnexploredTileActionMenu(state, wx, wy, clientX, clientY,");
    const unexploredBranch = source.slice(
      0,
      source.indexOf("openUnexploredTileActionMenu(state, wx, wy, clientX, clientY,")
    );
    expect(unexploredBranch.slice(-600)).toContain("queueAdjacentExpandClaim(wx, wy);");
  });

  it("opens the tile menu instead of auto-claiming when an adjacent target also falls inside reach, so Build Relay Beacon is reachable", () => {
    const source = actionFlowSource();

    // The instant "quick claim" shortcuts (unexplored, fogged, and visible
    // neutral-land paths) used to fire for ANY adjacent unowned tile,
    // regardless of reach -- which meant menuActionsForSingleTile's
    // reach-gated "Build Relay Beacon" action (client-tile-action-logic.ts)
    // could never actually be shown to the player: any tile that passed its
    // own visibility gate (adjacent AND in reach) was always intercepted
    // before the menu ever opened. isTargetInLocalReach must gate all three
    // shortcut call sites so an in-reach adjacent tile opens the real menu
    // instead.
    expect(source).toContain(
      "const isTargetInLocalReach = (x: number, y: number): boolean =>\n      computeLocalReachSet(state.tiles, state.me).has(keyFor(x, y));"
    );
    expect(source).toContain("if (frontierOrigin && isTargetInLocalReach(wx, wy)) {");
    expect(source).toContain("if (frontierOrigin && !isTargetInLocalReach(wx, wy)) {");
    expect(source).toContain("targetInReach: isTargetInLocalReach(to.x, to.y)");
  });
});
