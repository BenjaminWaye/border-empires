import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { attackEffortSheetTargetKey } from "../client-launch-attack-effort/client-launch-attack-effort.js";

/**
 * The Launch Attack panel's win-chance line/breakdown reads from a preview
 * cached with a 5s TTL (ATTACK_PREVIEW_CACHE_TTL_MS, client-queue-logic.ts).
 * Nothing re-requested that preview once it aged out -- so a player who left
 * an enemy tile's menu open past 5s would watch the win chance and "how this
 * is calculated" breakdown vanish on the next unrelated re-render (a routine
 * TILE_DELTA_BATCH tick, for example), even though nothing about the combat
 * math had actually changed.
 *
 * Re-request once a second, but only while a single-tile menu is open on an
 * attackable enemy tile and the current preview has actually gone stale, so
 * this stays as cheap as the other per-second HUD tickers (renderVictoryHoldAlert,
 * startTileMenuDecayTicker) it sits alongside. The response handler in
 * client-network.ts (ATTACK_PREVIEW_RESULT) already re-renders the open menu
 * once the fresh preview lands, so this ticker only needs to fire the
 * request -- not repaint anything itself.
 *
 * The Launch Attack effort sheet closes the tile menu while it is open, so
 * its target (effortSheetTargetKey) is kept fresh the same way; otherwise its
 * Normal / Extra / Double odds read a preview that had already aged out.
 */
export const startAttackPreviewKeepaliveTicker = (
  state: ClientState,
  deps: {
    isTileOwnedByAlly: (tile: Tile) => boolean;
    attackPreviewIsStaleForTarget: (tile: Tile) => boolean;
    requestAttackPreviewForTarget: (tile: Tile) => void;
    /** Test seam; defaults to the open Launch Attack effort sheet's target. */
    effortSheetTargetKey?: () => string | undefined;
  }
): void => {
  setInterval(() => keepAttackPreviewAlive(state, deps), 1_000);
};

/** One keepalive pass: the open single-tile menu's target, else the open effort sheet's. */
export const keepAttackPreviewAlive = (
  state: ClientState,
  deps: Parameters<typeof startAttackPreviewKeepaliveTicker>[1]
): void => {
  const menuKey = state.tileActionMenu.visible && state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
  const targetKey = menuKey || (deps.effortSheetTargetKey ?? attackEffortSheetTargetKey)();
  if (!targetKey) return;
  const target = state.tiles.get(targetKey);
  if (!target || !target.ownerId || target.ownerId === state.me || deps.isTileOwnedByAlly(target)) return;
  if (!deps.attackPreviewIsStaleForTarget(target)) return;
  deps.requestAttackPreviewForTarget(target);
};
