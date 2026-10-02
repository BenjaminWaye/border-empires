import { isDiscoveryTipSeen, markDiscoveryTipSeen } from "../client-discovery-tips/client-discovery-tips-storage.js";
import { recordTileRevisionChange } from "../client-tile-merge/client-tile-merge.js";
import { tickAfcJoinDrop, type AfcJoinDropTickState } from "./client-afc-join-drop.js";

/** Once-per-frame entry point for the runtime loop: wires the join-drop controller to the browser (tab visibility, wall clock, persisted "played" flag) and the tile-revision bump that makes the 3D renderer rebuild. */
export const tickAfcJoinDropForFrame = (
  state: AfcJoinDropTickState & { authEmail: string; tilesRevision: number; tilesRevisionChangedKeys: Set<string>; tilesRevisionOverflowed: boolean },
  nowMs: number,
  viewport: { readonly canvasWidth: number; readonly canvasHeight: number; readonly tilePx: number },
  keyFor: (x: number, y: number) => string
): void => {
  tickAfcJoinDrop({
    state,
    nowMs,
    wallNowMs: Date.now(),
    tabVisible: typeof document === "undefined" || document.visibilityState === "visible",
    viewHalfExtentTiles: { halfW: viewport.canvasWidth / viewport.tilePx / 2, halfH: viewport.canvasHeight / viewport.tilePx / 2 },
    keyFor,
    isSeen: (tipId) => isDiscoveryTipSeen(tipId, state.authEmail),
    markSeen: (tipId) => markDiscoveryTipSeen(tipId, state.authEmail),
    onTileChanged: (x, y) => {
      state.tilesRevision += 1;
      recordTileRevisionChange(state, x, y);
    }
  });
};
