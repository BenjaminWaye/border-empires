import { isRedesignedRelic, relicRemainingUses } from "@border-empires/shared";
import { drawRelicHint2D } from "./client-relic-overlay/relic-map-hints.js";
// The per-tile 2D feature overlays both of client-runtime-loop.ts's tile draw
// loops ran identically (watchtower, waystation, AFC, natural wonder, and the
// capture-hold garrison). Extracted so the loops make one call each instead
// of repeating the same chain, and so client-runtime-loop.ts (far over the
// 500-line cap) didn't grow when the capture-hold garrison was added.
import type { AfcJoinDropState } from "./client-afc-join-drop/client-afc-join-drop-state.js";
import { drawAfcTile2D } from "./client-afc-join-drop/client-map-2d-afc-join-drop.js";
import { drawCaptureAftermath2D } from "./client-map-2d-capture-aftermath.js";
import { drawCaptureHoldGarrison2D } from "./client-map-2d-capture-hold-overlay.js";
import { drawWarScars2D } from "./client-capture-aftermath/client-map-2d-war-scars.js";
import { drawNaturalWonderOverlay2D, naturalWonderOverlayForTile } from "./client-map-2d-natural-wonder-overlay.js";
import { drawWatchtower2D } from "./client-map-2d-watchtower-overlay.js";
import { drawWaystation2D } from "./client-map-2d-waystation-overlay.js";
import { isTrue3DRendererActive } from "./client-renderer-mode.js";
import { drawRememberedStructures2D, type RememberedStructures2DDeps } from "./client-remembered-structures-2d/client-remembered-structures-2d.js";
import type { Tile } from "./client-types.js";
import { drawTownTierUpgrade2D } from "./client-town-tier-upgrade-fx/client-map-2d-town-tier-upgrade.js";
import type { TownTierUpgradeFxEntry } from "./client-town-tier-upgrade-fx/client-town-tier-upgrade-fx.js";

export type TileFeatureOverlayDeps2D = {
  ctx: CanvasRenderingContext2D;
  relicMapHints?: ReadonlyMap<string, import("@border-empires/shared").RelicMapHint>;
  structureAccentColor: (ownerId: string, fallback: string) => string;
  effectiveOverlayColor: (ownerId: string) => string;
  afcJoinDrop: AfcJoinDropState;
  /** AFC module delivery landing times by tile key. */
  afcModuleDeliveryLandedAt: ReadonlyMap<string, number>;
  /** Buildings on fogged tiles, drawn as last seen and standing still. */
  remembered: RememberedStructures2DDeps;
  /** Town tier-upgrade celebrations by tile key (client-town-tier-upgrade-fx/). */
  townTierUpgradeFxByKey: ReadonlyMap<string, TownTierUpgradeFxEntry>;
};

/** Draws a tile's 2D feature overlays (a fogged tile's remembered buildings too); a no-op in the 3D renderer, which has its own. */
export const drawTileFeatureOverlays2D = (
  deps: TileFeatureOverlayDeps2D,
  t: Tile | undefined,
  tileKey: string,
  vis: "visible" | "fogged" | "unexplored",
  px: number,
  py: number,
  size: number,
  nowMs: number
): void => {
  if (!isTrue3DRendererActive() && !(t?.naturalWonder && relicRemainingUses(t.naturalWonder) === 0)) drawRelicHint2D(deps.ctx, deps.relicMapHints?.get(tileKey), px, py, size);
  if (!isTrue3DRendererActive() && vis === "fogged" && t?.naturalWonder && isRedesignedRelic(t.naturalWonder)) {
    deps.ctx.save(); deps.ctx.globalAlpha *= 0.7;
    drawNaturalWonderOverlay2D(deps.ctx, undefined, t.ownerId ?? "", px, py, size, deps.structureAccentColor, t.naturalWonder, false);
    deps.ctx.restore();
  }
  if (t && vis === "fogged" && !isTrue3DRendererActive()) drawRememberedStructures2D(deps.ctx, deps.remembered, t, px, py, size);
  if (!t || vis !== "visible" || isTrue3DRendererActive()) return;
  // Battle scars (shared war-scars.ts) lie under everything else on the tile.
  if (t.terrain === "LAND" && t.warScarUntil !== undefined) drawWarScars2D(deps.ctx, t, px, py, size, Date.now());
  if (t.terrain === "LAND" && t.watchtower) drawWatchtower2D(deps.ctx, t, px, py, size, nowMs);
  if (t.terrain === "LAND" && t.waystation) drawWaystation2D(deps.ctx, t, px, py, size, nowMs);
  if (t.terrain === "LAND" && t.afc) drawAfcTile2D(deps.ctx, t, px, py, size, nowMs, deps.afcModuleDeliveryLandedAt.get(tileKey), deps.afcJoinDrop);
  if (t.naturalWonder) drawNaturalWonderOverlay2D(deps.ctx, naturalWonderOverlayForTile(t), t.ownerId ?? "", px, py, size, deps.structureAccentColor, t.naturalWonder, t.ownershipState === "SETTLED");
  // Capture-hold garrison: 2D counterpart of the 3D standing squad. Checks
  // the deadline, not just the field, so a long-expired hold costs nothing.
  // Rubble/smoke the capture left (client-capture-aftermath.ts) sits under the garrison.
  if (t.terrain === "LAND") drawCaptureAftermath2D(deps.ctx, t, px, py, size, Date.now());
  if (t.ownerId && t.captureHoldUntil !== undefined) {
    const nowEpochMs = Date.now();
    if (t.captureHoldUntil > nowEpochMs) drawCaptureHoldGarrison2D(deps.ctx, t, deps.effectiveOverlayColor(t.ownerId), px, py, size, nowEpochMs);
  }
  const townUpgrade = deps.townTierUpgradeFxByKey.size > 0 ? deps.townTierUpgradeFxByKey.get(tileKey) : undefined;
  if (townUpgrade) drawTownTierUpgrade2D(deps.ctx, townUpgrade, px, py, size, Date.now());
};
