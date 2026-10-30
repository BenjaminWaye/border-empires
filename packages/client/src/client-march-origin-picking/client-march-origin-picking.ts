// March To on an unexplored tile, the reverse of a flag's own "March To…":
// the destination is fixed when the player presses the button, and the next
// tap picks where to march FROM -- one of their muster flags, or a tile of
// their land to raise a new flag on. A valid pick opens the same March To
// commit sheet (handleArrowGestureConfirm) every other march uses, which
// sends SET_MUSTER MARCH; the server creates a missing flag directly in
// MARCH mode (handleSetMusterCommand). An invalid tap says why in the feed
// and keeps picking, so a mis-tap doesn't throw the order away.

import { MUSTER_MARCH_MAX_DISTANCE_TILES, musterMarchDistanceTiles } from "@border-empires/shared";
import { handleArrowGestureConfirm, type ArrowGestureConfirmDeps } from "../client-arrow-gesture-confirm.js";
import { marchRouteStepsFromTarget } from "../client-march-attack-actions/client-march-route.js";
import { handleMusterMarchTargetClick } from "../client-muster-march-targeting.js";
import { musterSiegeReason, ownTileSiegeAt } from "../client-muster-siege/client-muster-siege.js";
import type { ClientState } from "../client-state/client-state.js";
import { hideMarchOriginBanner, showMarchOriginBanner } from "./client-march-origin-banner.js";

type Point = { x: number; y: number };

export type MarchOriginCheck = { ok: true; newFlag: boolean } | { ok: false; reason: string };

/** Whether `origin` can march on `target`, mirroring what marchAttackOptions would offer for it. */
export const checkMarchOrigin = (state: ClientState, origin: Point, target: Point, nowMs = Date.now()): MarchOriginCheck => {
  if (origin.x === target.x && origin.y === target.y) {
    return { ok: false, reason: "That's the destination. Tap one of your muster flags or a tile of your land to march from." };
  }
  const originKey = `${origin.x},${origin.y}`;
  const tile = state.tiles.get(originKey);
  if (!tile || tile.ownerId !== state.me || tile.terrain !== "LAND") {
    return { ok: false, reason: "Tap one of your muster flags or a tile of your own land to march from." };
  }
  const siege = ownTileSiegeAt(state, origin.x, origin.y, nowMs);
  if (siege) return { ok: false, reason: `${musterSiegeReason(siege, nowMs)}. Pick another tile to march from.` };
  const distance = musterMarchDistanceTiles(origin.x, origin.y, target.x, target.y);
  if (distance > MUSTER_MARCH_MAX_DISTANCE_TILES) {
    return { ok: false, reason: `Too far: (${origin.x}, ${origin.y}) is ${distance} tiles away, and marches reach up to ${MUSTER_MARCH_MAX_DISTANCE_TILES}. Pick a closer tile.` };
  }
  const newFlag = tile.muster?.ownerId !== state.me;
  if (newFlag) {
    let flagCount = 0;
    for (const t of state.tiles.values()) if (t.ownerId === state.me && t.muster?.ownerId === state.me) flagCount += 1;
    if (flagCount >= state.musterFlagLimit) {
      return { ok: false, reason: `Muster flags full (${flagCount}/${state.musterFlagLimit}). Tap one of your flags to march from instead.` };
    }
  }
  let routed = false;
  marchRouteStepsFromTarget(state, target, nowMs, undefined, {
    reached: (key) => {
      if (key === originKey) routed = true;
    },
    doneAtSteps: () => (routed ? 0 : undefined)
  });
  if (!routed) return { ok: false, reason: `No route over land from (${origin.x}, ${origin.y}) to there. Pick a tile on the same side of the water.` };
  return { ok: true, newFlag };
};

/** The March To button: fix the destination and start picking where to march from. */
export const startMarchOriginPicking = (state: ClientState, target: Point, deps: ArrowGestureConfirmDeps): void => {
  state.musterMarchTargeting.active = false;
  state.marchOriginPicking = { active: true, targetX: target.x, targetY: target.y };
  showMarchOriginBanner(state, {
    onPickFlag: (x, y) => {
      pickMarchOrigin(state, { x, y }, deps);
      deps.renderHud();
    },
    onCancel: () => {
      cancelMarchOriginPicking(state);
      deps.renderHud();
    }
  });
};

export const cancelMarchOriginPicking = (state: ClientState): void => {
  state.marchOriginPicking.active = false;
  hideMarchOriginBanner(state);
};

/** A tapped origin: opens the commit sheet when valid, else says why in the feed and keeps picking. */
export const pickMarchOrigin = (state: ClientState, origin: Point, deps: ArrowGestureConfirmDeps, nowMs = Date.now()): boolean => {
  const target = { x: state.marchOriginPicking.targetX, y: state.marchOriginPicking.targetY };
  const check = checkMarchOrigin(state, origin, target, nowMs);
  if (!check.ok) {
    deps.pushFeed(check.reason, "combat", "warn");
    return false;
  }
  cancelMarchOriginPicking(state);
  handleArrowGestureConfirm(state, origin, target, deps, { newFlag: check.newFlag });
  return true;
};

/** Map tap while either march-picking mode is armed; true when the tap was consumed. */
export const handleMarchPickClick = (
  state: ClientState,
  wx: number,
  wy: number,
  vis: "visible" | "fogged" | "unexplored",
  deps: ArrowGestureConfirmDeps
): boolean => {
  if (state.marchOriginPicking.active) {
    pickMarchOrigin(state, { x: wx, y: wy }, deps);
  } else if (state.musterMarchTargeting.active) {
    const result = handleMusterMarchTargetClick(state, wx, wy, vis, { pushFeed: (msg) => deps.pushFeed(msg, "combat", "info") });
    if (result.type === "armed") {
      handleArrowGestureConfirm(state, { x: result.originX, y: result.originY }, { x: result.targetX, y: result.targetY }, deps);
    }
  } else {
    return false;
  }
  deps.renderHud();
  return true;
};
