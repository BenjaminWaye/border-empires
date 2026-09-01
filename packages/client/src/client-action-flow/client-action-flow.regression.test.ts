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

  it("registers a server-durable claim continuation alongside a composite settle(+build) order, so it survives logout", () => {
    const source = actionFlowSource();

    // Previously the settle-then-build tail that follows a click on
    // "Build Relay Beacon" (or any settle+build combo) lived purely in
    // client-side in-memory bookkeeping (autoSettleTargets/autoBuildTargets
    // + the runtime tick loop), so it silently stalled if the player logged
    // out between the click and either follow-up landing. CLAIM_CONTINUATION_SET
    // registers the same tail server-side too, covering both the fresh-EXPAND
    // and already-owned-FRONTIER cases.
    expect(source).toContain('sendGameMessage({ type: "CLAIM_CONTINUATION_SET", x: selected.x, y: selected.y, structureType });');
    expect(source).toContain('sendGameMessage({ type: "CLAIM_CONTINUATION_SET", x: selected.x, y: selected.y, structureType: "RELAY_BEACON" });');
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

  it("always auto-claims an adjacent unowned tile with a single click, regardless of reach -- no menu detour", () => {
    const source = actionFlowSource();

    // An earlier version of this file gated the quick-claim shortcuts on
    // reach (isTargetInLocalReach) so the menu would open instead, purely
    // to make the "Build Relay Beacon" combo action reachable via a single
    // click. That traded away the fast one-click claim workflow for every
    // ordinary adjacent tile, which is the wrong tradeoff -- reverted.
    // Adjacent-tile clicks (fogged, unexplored, and visible) go straight to
    // queueAdjacentExpandClaim again; reach only affects what's *visible*
    // once a menu is actually opened some other way (e.g. re-clicking an
    // already-queued tile), never whether the quick-claim fires.
    expect(source).not.toContain("targetInReach: clickTargetInReach");
    expect(source).not.toContain("if (frontierOrigin && isTargetInLocalReach(wx, wy)) {");
    const visibleBranchStart = source.indexOf("const to = clicked;");
    const visibleBranch = source.slice(visibleBranchStart, visibleBranchStart + 600);
    expect(visibleBranch).toContain(
      "const clickOutcome = neutralTileClickOutcome({\n      isLand: to.terrain === \"LAND\",\n      isFogged: Boolean(to.fogged),\n      hasFrontierOrigin: Boolean(frontierOrigin),\n      isNeutral: !to.ownerId\n    });"
    );
  });

  it("does not fire a duplicate client-side build once an auto-settled tile lands SETTLED, avoiding a race with the server's own claim-continuation build", () => {
    const source = actionFlowSource();

    // Previously processAutoBuildTargets called triggerBuildForStructureType
    // (which dispatches a BUILD command) unconditionally once the tile
    // landed SETTLED -- racing the server-durable claim continuation's own
    // build-on-settle (see runtime-claim-continuation-command-handlers.ts's
    // tryDrainClaimContinuationBuildTail). Whichever command lost the race
    // got rejected with BUILD_INVALID "tile already has structure", even
    // though the structure was actually built successfully by the winner.
    // FOUNDRY/WATERWORKS are the one exception -- those need the player to
    // pick an exact adjacent tile via the placement overlay, so they still
    // trigger locally.
    const fnStart = source.indexOf("const processAutoBuildTargets = ()");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart, source.indexOf("\n  };", fnStart));
    expect(fnBody).not.toContain("        triggerBuildForStructureType(structureType, tile);\n");
    expect(fnBody).toContain('if (structureType === "FOUNDRY" || structureType === "WATERWORKS") triggerBuildForStructureType(structureType, tile);');
  });

  it("delegates settle_land on a non-adjacent-but-in-reach neutral tile into the waypoint machinery instead of a doomed direct claim", () => {
    const source = actionFlowSource();

    // "Settle Land" is visible on any in-reach neutral tile now (see
    // client-tile-action-logic.ts), adjacent or not -- clicking it on a
    // tile with no adjacent origin must walk there first via the same
    // handleWaypointAction("expand_here") flow "Add Waypoint" uses, not
    // fall through to queueSpecificTargets, which requires an adjacent
    // origin and would just fail.
    expect(source).toContain(
      "const adjacentOrigin = pickOriginForTarget(selected.x, selected.y, false) ?? pickOriginForTarget(selected.x, selected.y, false, true);"
    );
    const settleLandStart = source.indexOf('if (actionId === "settle_land") {');
    const settleLandBranch = source.slice(settleLandStart, source.indexOf('if (actionId === "launch_attack") {', settleLandStart));
    expect(settleLandBranch).toContain('actionId: "expand_here"');
  });

  it("submits a plain adjacent-tile expand click through the durable waypoint queue instead of the in-memory actionQueue", () => {
    const source = actionFlowSource();

    // Previously queueAdjacentExpandClaim called enqueueTarget/processActionQueue,
    // which only holds state.actionQueue in memory and never reaches the
    // server until it's actually dispatched one entry at a time -- so any
    // extra queued clicks were silently lost on a browser close before
    // being sent. Route through enqueueAdjacentExpandWaypoint, which
    // submits via the same WAYPOINT_ENQUEUE mechanism the multi-hop planner
    // and "Build Relay Beacon" already use: the server holds the entry
    // durably and drains it itself, even offline.
    expect(source).toContain(
      'import { enqueueAdjacentExpandWaypoint } from "./client-adjacent-expand-claim/client-adjacent-expand-claim.js";'
    );
    const fnStart = source.indexOf("const queueAdjacentExpandClaim = (x: number, y: number): void => {");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart, source.indexOf("\n    };", fnStart));
    expect(fnBody).not.toContain("enqueueTarget(x, y)");
    expect(fnBody).toContain("enqueueAdjacentExpandWaypoint(state, x, y, keyFor, sendGameMessage, processActionQueue);");
    // The "already queued" short-circuit must also check the waypoint
    // queue now, not just the legacy actionQueue, or a second click on a
    // tile already sitting in the waypoint queue would double-enqueue it.
    expect(fnBody).toContain(
      "const isAlreadyQueued = actionQueueIndexForTileFromModule(state, x, y) >= 0 || waypointIndexForTileFromModule(state, x, y) >= 0;"
    );
  });
});
