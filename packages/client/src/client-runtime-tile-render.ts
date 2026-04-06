import { WORLD_HEIGHT, WORLD_WIDTH, terrainAt } from "@border-empires/shared";
import { OBSERVATORY_PROTECTION_RADIUS, OBSERVATORY_VISION_BONUS } from "./client-constants.js";
import type { RoadDirections } from "./client-road-network.js";
import { exposedSidesForTile } from "./client-defensibility-html.js";
import { fortificationOpeningForTile, fortificationOverlayAlphaForTile, fortificationOverlayKindForTile } from "./client-fortification-overlays.js";
import { clampOwnershipBorderWidth } from "./client-ownership-borders.js";
import { structureAreaPreviewForTile } from "./client-structure-effects.js";
import type { ClientState } from "./client-state.js";
import type { StartClientRuntimeLoopDeps, VisibleRenderTile } from "./client-runtime-types.js";

type TileRenderContext = {
  nowMs: number;
  size: number;
  halfW: number;
  halfH: number;
  roadNetwork: Map<string, RoadDirections>;
  roadNetworkBuiltAt: number;
};

export const drawRuntimeRoadPass = (
  state: ClientState,
  deps: StartClientRuntimeLoopDeps,
  overlayTiles: VisibleRenderTile[],
  roadNetwork: Map<string, RoadDirections>
): void => {
  for (const { wk, px, py, vis, t } of overlayTiles) {
    if (t && vis === "visible" && t.terrain === "LAND" && t.ownerId && t.ownershipState === "SETTLED") {
      const roadDirections = roadNetwork.get(wk);
      if (roadDirections) deps.drawRoadOverlay(roadDirections, px, py, state.zoom);
    }
  }
};

export const drawRuntimeOverlayTile = (
  state: ClientState,
  deps: StartClientRuntimeLoopDeps,
  overlayTile: VisibleRenderTile,
  context: TileRenderContext & {
    dockEndpointKeys: Set<string>;
    queueIndex: Map<string, number>;
    queuedBuildIndex: Map<string, number>;
    settleQueueIndex: Map<string, number>;
    startingArrowTargets: Map<string, { x: number; y: number; dx: number; dy: number }>;
    crystalTargetingActive: boolean;
    crystalTone: "amber" | "cyan" | "red";
  }
): void => {
  const { wx, wy, wk, px, py, vis, t, settlementProgress } = overlayTile;
  const { nowMs, size, dockEndpointKeys, queueIndex, queuedBuildIndex, settleQueueIndex, startingArrowTargets, crystalTargetingActive, crystalTone } = context;
  const isDockEndpoint = dockEndpointKeys.has(wk);
  const dockVisible = (!t && state.fogDisabled) || vis === "visible";
  if (dockVisible && isDockEndpoint) {
    const dockOverlay = deps.dockOverlayVariants[deps.overlayVariantIndexAt(wx, wy, deps.dockOverlayVariants.length)];
    if (dockOverlay?.complete && dockOverlay.naturalWidth) deps.drawCenteredOverlay(dockOverlay, px, py, size, 1.14);
    else {
      deps.ctx.fillStyle = "rgba(12, 22, 38, 0.42)";
      deps.ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
      deps.ctx.strokeStyle = "rgba(115, 225, 255, 0.98)";
      deps.ctx.lineWidth = 2;
      deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
      deps.ctx.strokeStyle = "rgba(214, 247, 255, 0.95)";
      deps.ctx.beginPath();
      deps.ctx.moveTo(px + size / 2, py + 3);
      deps.ctx.lineTo(px + size / 2, py + size - 3);
      deps.ctx.moveTo(px + 3, py + size / 2);
      deps.ctx.lineTo(px + size - 3, py + size / 2);
      deps.ctx.stroke();
      deps.ctx.lineWidth = 1;
    }
  }
  if (t && vis === "visible" && t.resource && t.terrain === "LAND") {
    const builtOverlay = deps.builtResourceOverlayForTile(t);
    const overlay = builtOverlay ?? deps.resourceOverlayForTile(t);
    if (overlay?.complete && overlay.naturalWidth) {
      const alpha = builtOverlay ? deps.economicStructureOverlayAlpha(t) : 1;
      deps.drawCenteredOverlayWithAlpha(overlay, px, py, size, deps.resourceOverlayScaleForTile(t), alpha);
      deps.drawResourceCornerMarker(t, px, py, size);
    } else {
      const rc = deps.resourceColor(t.resource);
      if (rc) {
        const marker = Math.max(3, Math.floor(size * 0.22));
        const mx = px + Math.floor((size - marker) / 2);
        const my = py + Math.floor((size - marker) / 2);
        deps.ctx.fillStyle = "rgba(12, 16, 28, 0.7)";
        deps.ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
        deps.ctx.fillStyle = rc;
        deps.ctx.fillRect(mx, my, marker, marker);
        deps.drawResourceCornerMarker(t, px, py, size);
      }
    }
  }
  if (t && vis === "visible" && t.terrain === "LAND" && t.shardSite) {
    const overlay = deps.shardOverlayForTile(t);
    const pulsePhase = 0.5 + 0.5 * Math.sin(nowMs / 280 + t.x * 0.21 + t.y * 0.17);
    const pulse = 0.82 + 0.18 * pulsePhase;
    const glowRadius = size * (0.28 + pulsePhase * (t.shardSite.kind === "FALL" ? 0.3 : 0.24));
    deps.ctx.save();
    deps.ctx.globalCompositeOperation = "screen";
    deps.ctx.fillStyle = t.shardSite.kind === "FALL" ? `rgba(255, 220, 112, ${0.16 + pulsePhase * 0.18})` : `rgba(96, 244, 255, ${0.14 + pulsePhase * 0.16})`;
    deps.ctx.beginPath();
    deps.ctx.arc(px + size / 2, py + size / 2, glowRadius, 0, Math.PI * 2);
    deps.ctx.fill();
    deps.ctx.lineWidth = Math.max(2, size * 0.08);
    deps.ctx.strokeStyle = t.shardSite.kind === "FALL" ? `rgba(255, 245, 180, ${0.38 + pulsePhase * 0.34})` : `rgba(184, 255, 255, ${0.34 + pulsePhase * 0.3})`;
    deps.ctx.beginPath();
    deps.ctx.arc(px + size / 2, py + size / 2, size * (0.18 + pulsePhase * 0.18), 0, Math.PI * 2);
    deps.ctx.stroke();
    deps.ctx.restore();
    if (overlay?.complete && overlay.naturalWidth) deps.drawCenteredOverlayWithAlpha(overlay, px, py, size, (t.shardSite.kind === "FALL" ? 1.1 : 1.02) * (0.98 + pulse * 0.06), 0.86 + pulse * 0.18);
    else {
      const prevAlpha = deps.ctx.globalAlpha;
      deps.ctx.globalAlpha = prevAlpha * (0.88 + pulse * 0.16);
      deps.drawShardFallback(t, px, py, size * (0.99 + pulse * 0.03));
      deps.ctx.globalAlpha = prevAlpha;
    }
  }
  if (t && vis === "visible" && t.town && t.terrain === "LAND") deps.drawTownOverlay(t, px, py, size);
  if (t && vis === "visible" && t.ownerId === state.me && t.ownershipState === "SETTLED" && deps.hasCollectableYield(t)) {
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(nowMs / 230));
    const marker = Math.max(4, Math.floor(size * 0.22));
    deps.ctx.fillStyle = `rgba(15, 18, 28, ${0.68 + pulse * 0.18})`;
    deps.ctx.fillRect(px + 2, py + 2, marker + 2, marker + 2);
    deps.ctx.fillStyle = `rgba(255, 220, 90, ${0.75 + pulse * 0.25})`;
    deps.ctx.fillRect(px + 3, py + 3, marker, marker);
  }
  if (t && vis === "visible" && t.terrain === "LAND") {
    const fortificationKind = fortificationOverlayKindForTile(t);
    if (fortificationKind) {
      const opening = fortificationOpeningForTile(t, { tiles: state.tiles, keyFor: deps.keyFor, wrapX: deps.wrapX, wrapY: deps.wrapY });
      const overlay = deps.fortificationOverlayImageFor(fortificationKind, opening);
      if (overlay?.complete && overlay.naturalWidth) deps.drawCenteredOverlayWithAlpha(overlay, px, py, size, 1, fortificationOverlayAlphaForTile(t));
    }
  }
  if (t && vis === "visible" && t.observatory) {
    const overlay = deps.structureOverlayImages.OBSERVATORY;
    if (overlay && overlay.complete && overlay.naturalWidth) deps.drawCenteredOverlay(overlay, px, py, size, 1.02);
  }
  if (t && vis === "visible" && t.economicStructure) {
    const markerSize = Math.max(3, Math.floor(size * 0.2));
    const active = t.economicStructure.status === "active";
    const hasBuiltResourceOverlay = Boolean(deps.builtResourceOverlayForTile(t));
    const fortificationKind = fortificationOverlayKindForTile(t);
    const overlay = deps.structureOverlayImages[t.economicStructure.type];
    if (fortificationKind) {
    } else if (overlay && overlay.complete && overlay.naturalWidth) deps.drawCenteredOverlay(overlay, px, py, size, 1.02);
    else if (t.economicStructure.type === "FARMSTEAD" && !hasBuiltResourceOverlay) {
      deps.ctx.fillStyle = deps.structureAccentColor(t.ownerId ?? "", active ? "rgba(192, 229, 117, 0.95)" : "rgba(148, 176, 104, 0.72)");
      deps.ctx.fillRect(px + 2, py + size - markerSize - 2, markerSize + 1, markerSize);
    } else if (t.economicStructure.type === "CAMP" && !hasBuiltResourceOverlay) {
      deps.ctx.fillStyle = deps.structureAccentColor(t.ownerId ?? "", active ? "rgba(222, 174, 108, 0.95)" : "rgba(171, 134, 86, 0.74)");
      deps.ctx.beginPath();
      deps.ctx.moveTo(px + size / 2, py + 3);
      deps.ctx.lineTo(px + size - 4, py + markerSize + 4);
      deps.ctx.lineTo(px + 4, py + markerSize + 4);
      deps.ctx.closePath();
      deps.ctx.fill();
    } else if (t.economicStructure.type === "MINE" && !hasBuiltResourceOverlay) {
      deps.ctx.fillStyle = deps.structureAccentColor(t.ownerId ?? "", active ? "rgba(188, 197, 214, 0.96)" : "rgba(120, 130, 148, 0.74)");
      deps.ctx.fillRect(px + 2, py + 2, markerSize + 1, markerSize + 1);
    } else {
      deps.ctx.strokeStyle = deps.structureAccentColor(t.ownerId ?? "", active ? "rgba(255, 212, 111, 0.96)" : "rgba(191, 162, 102, 0.72)");
      deps.ctx.lineWidth = 2;
      deps.ctx.strokeRect(px + 2, py + 2, markerSize + 2, markerSize + 2);
      deps.ctx.lineWidth = 1;
    }
  }
  if (t && vis === "visible" && t.terrain === "LAND") {
    const remainingConstructionMs = deps.constructionRemainingMsForTile(t);
    if (remainingConstructionMs !== undefined && size >= 18) {
      const timerLabel = deps.formatCountdownClock(remainingConstructionMs);
      deps.ctx.fillStyle = "rgba(6, 10, 18, 0.82)";
      deps.ctx.fillRect(px + 2, py + size - 12, Math.min(size - 4, 30), 10);
      deps.ctx.fillStyle = "rgba(236, 243, 255, 0.92)";
      deps.ctx.font = "9px monospace";
      deps.ctx.textBaseline = "top";
      deps.ctx.fillText(timerLabel, px + 4, py + size - 11);
    }
  }
  if (t && vis === "visible" && t.sabotage && t.sabotage.endsAt > Date.now()) {
    deps.ctx.strokeStyle = "rgba(255, 83, 83, 0.92)";
    deps.ctx.beginPath();
    deps.ctx.moveTo(px + 3, py + 3);
    deps.ctx.lineTo(px + size - 3, py + size - 3);
    deps.ctx.moveTo(px + size - 3, py + 3);
    deps.ctx.lineTo(px + 3, py + size - 3);
    deps.ctx.stroke();
  }
  if (crystalTargetingActive && t && vis === "visible" && state.crystalTargeting.validTargets.has(wk)) {
    deps.ctx.fillStyle = crystalTone === "amber" ? "rgba(255, 187, 72, 0.12)" : crystalTone === "cyan" ? "rgba(113, 223, 255, 0.13)" : "rgba(255, 100, 100, 0.12)";
    deps.ctx.fillRect(px + 1, py + 1, size - 3, size - 3);
    deps.ctx.strokeStyle = crystalTone === "amber" ? "rgba(255, 201, 102, 0.88)" : crystalTone === "cyan" ? "rgba(116, 227, 255, 0.9)" : "rgba(255, 110, 110, 0.88)";
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
    deps.ctx.lineWidth = 1;
  }
  if (t && vis === "visible" && t.terrain === "LAND" && !t.ownerId) {
    deps.ctx.strokeStyle = "rgba(20, 26, 36, 0.58)";
    deps.ctx.lineWidth = 1;
    deps.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
  }
  const startingArrow = startingArrowTargets.get(wk);
  if (startingArrow && !settlementProgress && queueIndex.get(wk) === undefined) deps.drawStartingExpansionArrow(px, py, size, startingArrow.dx, startingArrow.dy);
  if (t && vis === "visible" && t.ownerId === "barbarian") deps.drawBarbarianSkullOverlay(px, py, size);
  if (t && vis === "visible" && deps.shouldDrawOwnershipBorder(t)) {
    const ownerId = t.ownerId!;
    deps.ctx.strokeStyle = ownerId === "barbarian" ? "rgba(214, 222, 232, 0.45)" : ownerId === state.me ? deps.borderColorForOwner(ownerId, t.ownershipState) : deps.isTileOwnedByAlly(t) ? "rgba(255, 205, 92, 0.82)" : deps.borderColorForOwner(ownerId, t.ownershipState);
    deps.ctx.lineWidth = clampOwnershipBorderWidth(deps.borderLineWidthForOwner(ownerId, t.ownershipState), size);
    deps.ctx.setLineDash([]);
    deps.drawExposedTileBorder(t, px, py, size);
    deps.ctx.lineWidth = 1;
  }
  if (state.showWeakDefensibility && t && vis === "visible" && t.ownerId === state.me && t.terrain === "LAND" && t.ownershipState === "SETTLED" && !t.fogged) {
    const exposedSides = exposedSidesForTile(t, { tiles: state.tiles, me: state.me, keyFor: deps.keyFor, wrapX: deps.wrapX, wrapY: deps.wrapY, terrainAt });
    if (exposedSides.length >= 2) {
      const critical = exposedSides.length >= 3;
      deps.ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.18)" : "rgba(255, 173, 92, 0.12)";
      deps.ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
      deps.ctx.strokeStyle = critical ? "rgba(255, 84, 84, 0.92)" : "rgba(255, 173, 92, 0.88)";
      deps.ctx.lineWidth = critical ? 4 : 3;
      deps.ctx.beginPath();
      if (exposedSides.includes("north")) { deps.ctx.moveTo(px + 1, py + 2); deps.ctx.lineTo(px + size - 1, py + 2); }
      if (exposedSides.includes("east")) { deps.ctx.moveTo(px + size - 2, py + 1); deps.ctx.lineTo(px + size - 2, py + size - 1); }
      if (exposedSides.includes("south")) { deps.ctx.moveTo(px + 1, py + size - 2); deps.ctx.lineTo(px + size - 1, py + size - 2); }
      if (exposedSides.includes("west")) { deps.ctx.moveTo(px + 2, py + 1); deps.ctx.lineTo(px + 2, py + size - 1); }
      deps.ctx.stroke();
      if (size >= 12) {
        deps.ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.96)" : "rgba(255, 196, 92, 0.96)";
        deps.ctx.beginPath();
        deps.ctx.arc(px + size * 0.5, py + size * 0.5, critical ? 2.3 : 1.8, 0, Math.PI * 2);
        deps.ctx.fill();
      }
      deps.ctx.lineWidth = 1;
    }
  }
  if (t && vis === "visible" && typeof t.breachShockUntil === "number" && t.breachShockUntil > Date.now() && t.ownerId) {
    deps.ctx.strokeStyle = "rgba(255,255,255,0.52)";
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
    deps.ctx.lineWidth = 1;
  }
  if (state.selected && state.selected.x === wx && state.selected.y === wy) {
    if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
      deps.ctx.fillStyle = "rgba(255, 209, 102, 0.18)";
      deps.ctx.fillRect(px, py, size, size);
    } else {
      deps.ctx.strokeStyle = "#ffd166";
      deps.ctx.lineWidth = 2;
      deps.ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
      deps.ctx.lineWidth = 1;
    }
  } else if (state.selected) {
    const selected = state.tiles.get(deps.keyFor(state.selected.x, state.selected.y));
    if (selected?.town && deps.isTownSupportNeighbor(wx, wy, state.selected.x, state.selected.y) && deps.isTownSupportHighlightableTile(t)) {
      if (t?.terrain !== "LAND") deps.ctx.strokeStyle = "rgba(92, 103, 127, 0.7)";
      else if (!t?.ownerId) deps.ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      else if (t.ownerId !== state.me) deps.ctx.strokeStyle = "rgba(255, 98, 98, 0.65)";
      else if (t.ownershipState === "SETTLED") deps.ctx.strokeStyle = "rgba(155, 242, 116, 0.88)";
      else deps.ctx.strokeStyle = "rgba(255, 205, 92, 0.82)";
      if (t?.ownerId === state.me && t.ownershipState === "SETTLED") {
        deps.ctx.fillStyle = "rgba(155, 242, 116, 0.12)";
        deps.ctx.fillRect(px, py, size, size);
      } else {
        deps.ctx.lineWidth = 2;
        deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
        deps.ctx.lineWidth = 1;
      }
    }
  }
  if (state.hover && state.hover.x === wx && state.hover.y === wy) {
    deps.ctx.strokeStyle = "rgba(255,255,255,0.55)";
    deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
  }
  const incomingAttack = state.incomingAttacksByTile.get(wk);
  if (incomingAttack) {
    if (incomingAttack.resolvesAt <= Date.now()) state.incomingAttacksByTile.delete(wk);
    else deps.drawIncomingAttackOverlay(wx, wy, px, py, size, incomingAttack.resolvesAt);
  }
  if (settlementProgress) {
    const totalMs = Math.max(1, settlementProgress.resolvesAt - settlementProgress.startAt);
    const now = Date.now();
    const progress = Math.max(0, Math.min(1, (now - settlementProgress.startAt) / totalMs));
    const fillWidth = Math.max(2, Math.floor((size - 2) * progress));
    const ownerFill = t?.ownerId ? deps.effectiveOverlayColor(t.ownerId) : "#ffd166";
    const pulse = 0.34 + 0.28 * (0.5 + 0.5 * Math.sin(now / 160));
    const darkPixelAlpha = (0.86 + pulse * 0.12).toFixed(3);
    deps.ctx.fillStyle = "rgba(9, 14, 24, 0.28)";
    deps.ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    deps.ctx.fillStyle = ownerFill;
    deps.ctx.globalAlpha = 0.16 + progress * 0.36;
    deps.ctx.fillRect(px + 1, py + 1, fillWidth, size - 2);
    deps.ctx.globalAlpha = 1;
    const pixelCount = deps.isMobile() ? Math.max(10, Math.min(22, Math.floor(size * 0.78))) : Math.max(12, Math.min(28, Math.floor(size * 0.94)));
    const activePixels = Math.max(6, Math.round(4 + progress * pixelCount));
    const swarmInset = Math.max(1, Math.floor(size * 0.04));
    const swarmWidth = Math.max(3, size - swarmInset * 2);
    const pixelSize = size <= 10 ? 1 : 2;
    deps.ctx.fillStyle = `rgba(6, 8, 12, ${darkPixelAlpha})`;
    for (let i = 0; i < activePixels; i += 1) {
      const point = deps.settlePixelWanderPoint(now, wx, wy, i);
      const dotX = Math.floor(px + swarmInset + point.x * (swarmWidth - pixelSize));
      const dotY = Math.floor(py + swarmInset + point.y * (swarmWidth - pixelSize));
      deps.ctx.fillRect(dotX, dotY, pixelSize, pixelSize);
    }
    deps.ctx.strokeStyle = `rgba(255, 241, 185, ${0.68 + pulse * 0.16})`;
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 1.5, py + 1.5, size - 4, size - 4);
    deps.ctx.lineWidth = 1;
  }
  if (state.dragPreviewKeys.has(wk)) {
    deps.ctx.strokeStyle = "rgba(129, 230, 217, 0.9)";
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
    deps.ctx.lineWidth = 1;
  }
  const queuedN = queueIndex.get(wk);
  if (queuedN !== undefined) {
    deps.ctx.strokeStyle = "rgba(168, 139, 250, 0.95)";
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
    if (size >= 16) {
      deps.ctx.fillStyle = "rgba(20, 16, 35, 0.85)";
      deps.ctx.fillRect(px + 3, py + 3, Math.min(size - 6, 14), 12);
      deps.ctx.fillStyle = "#c4b5fd";
      deps.ctx.font = "10px monospace";
      deps.ctx.textBaseline = "top";
      deps.ctx.fillText(String(queuedN), px + 5, py + 4);
    }
    deps.ctx.lineWidth = 1;
  }
  const queuedSettlementN = settleQueueIndex.get(wk);
  if (queuedSettlementN !== undefined && !settlementProgress) {
    deps.ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
    if (size >= 14) {
      const badgeWidth = Math.min(size - 6, queuedSettlementN >= 10 ? 18 : 14);
      deps.ctx.fillStyle = "rgba(49, 31, 4, 0.92)";
      deps.ctx.fillRect(px + size - badgeWidth - 3, py + 3, badgeWidth, 12);
      deps.ctx.fillStyle = "#fbbf24";
      deps.ctx.font = "10px monospace";
      deps.ctx.textBaseline = "top";
      deps.ctx.fillText(String(queuedSettlementN), px + size - badgeWidth - 1, py + 4);
    }
    deps.ctx.lineWidth = 1;
  }
  const queuedBuildN = queuedBuildIndex.get(wk);
  if (queuedBuildN !== undefined && !settlementProgress) {
    deps.ctx.strokeStyle = "rgba(122, 214, 255, 0.95)";
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 2, py + 2, size - 5, size - 5);
    if (size >= 14) {
      const badgeWidth = Math.min(size - 6, queuedBuildN >= 10 ? 18 : 14);
      deps.ctx.fillStyle = "rgba(7, 26, 39, 0.92)";
      deps.ctx.fillRect(px + size - badgeWidth - 3, py + 3, badgeWidth, 12);
      deps.ctx.fillStyle = "#7dd3fc";
      deps.ctx.font = "10px monospace";
      deps.ctx.textBaseline = "top";
      deps.ctx.fillText(String(queuedBuildN), px + size - badgeWidth - 1, py + 4);
    }
    deps.ctx.lineWidth = 1;
  }
};

export const drawRuntimeSelectionOverlays = (
  state: ClientState,
  deps: StartClientRuntimeLoopDeps,
  nowMs: number,
  size: number,
  halfW: number,
  halfH: number
): void => {
  const selectedWorld = deps.selectedTile();
  if (selectedWorld?.observatory && deps.tileVisibilityStateAt(selectedWorld.x, selectedWorld.y, selectedWorld) === "visible") {
    const center = deps.worldToScreen(selectedWorld.x, selectedWorld.y, size, halfW, halfH);
    const ringRadius = OBSERVATORY_VISION_BONUS + 0.5;
    const squareSize = ringRadius * 2 * size;
    deps.ctx.save();
    deps.ctx.strokeStyle = selectedWorld.observatory.status === "active" ? "rgba(122, 214, 255, 0.55)" : "rgba(122, 214, 255, 0.28)";
    deps.ctx.fillStyle = selectedWorld.observatory.status === "active" ? "rgba(122, 214, 255, 0.05)" : "rgba(122, 214, 255, 0.025)";
    deps.ctx.setLineDash([8, 6]);
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
    deps.ctx.fillRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
    deps.ctx.restore();
    if (selectedWorld.ownerId === state.me && selectedWorld.observatory.status === "active") {
      const protectionSquareSize = (OBSERVATORY_PROTECTION_RADIUS + 0.5) * 2 * size;
      deps.ctx.save();
      deps.ctx.strokeStyle = "rgba(106, 180, 255, 0.35)";
      deps.ctx.fillStyle = "rgba(106, 180, 255, 0.02)";
      deps.ctx.setLineDash([14, 10]);
      deps.ctx.lineWidth = 2;
      deps.ctx.strokeRect(center.sx - protectionSquareSize / 2, center.sy - protectionSquareSize / 2, protectionSquareSize, protectionSquareSize);
      deps.ctx.fillRect(center.sx - protectionSquareSize / 2, center.sy - protectionSquareSize / 2, protectionSquareSize, protectionSquareSize);
      deps.ctx.restore();
    }
  }
  const selectedStructurePreview = selectedWorld ? structureAreaPreviewForTile(selectedWorld) : undefined;
  if (selectedWorld && selectedStructurePreview && deps.tileVisibilityStateAt(selectedWorld.x, selectedWorld.y, selectedWorld) === "visible") {
    const center = deps.worldToScreen(selectedWorld.x, selectedWorld.y, size, halfW, halfH);
    const squareSize = (selectedStructurePreview.radius + 0.5) * 2 * size;
    deps.ctx.save();
    deps.ctx.strokeStyle = selectedStructurePreview.strokeStyle;
    deps.ctx.fillStyle = selectedStructurePreview.fillStyle;
    deps.ctx.setLineDash(selectedStructurePreview.lineDash);
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
    deps.ctx.fillRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
    deps.ctx.restore();
  }
  if (state.crystalTargeting.active) {
    const hoveredKey = state.hover ? deps.keyFor(state.hover.x, state.hover.y) : "";
    const selectedKey = state.selected ? deps.keyFor(state.selected.x, state.selected.y) : "";
    const targetKey = state.crystalTargeting.validTargets.has(hoveredKey) ? hoveredKey : state.crystalTargeting.validTargets.has(selectedKey) ? selectedKey : "";
    if (targetKey) {
      const tone = deps.crystalTargetingTone(state.crystalTargeting.ability);
      const target = deps.parseKey(targetKey);
      const targetScreen = deps.worldToScreen(target.x, target.y, size, halfW, halfH);
      const originKey = state.crystalTargeting.originByTarget.get(targetKey);
      if (originKey) {
        const origin = deps.parseKey(originKey);
        const originScreen = deps.worldToScreen(origin.x, origin.y, size, halfW, halfH);
        deps.ctx.save();
        deps.ctx.strokeStyle = tone === "amber" ? "rgba(255, 205, 98, 0.92)" : tone === "cyan" ? "rgba(116, 227, 255, 0.92)" : "rgba(255, 110, 110, 0.92)";
        deps.ctx.lineWidth = 2;
        deps.ctx.setLineDash(tone === "cyan" ? [10, 6] : [7, 5]);
        deps.ctx.beginPath();
        deps.ctx.moveTo(originScreen.sx, originScreen.sy);
        deps.ctx.lineTo(targetScreen.sx, targetScreen.sy);
        deps.ctx.stroke();
        deps.ctx.setLineDash([]);
        deps.ctx.strokeRect(originScreen.sx - size / 2 + 2, originScreen.sy - size / 2 + 2, size - 4, size - 4);
        deps.ctx.restore();
      }
      deps.ctx.save();
      deps.ctx.strokeStyle = tone === "amber" ? "rgba(255, 219, 132, 1)" : tone === "cyan" ? "rgba(153, 240, 255, 1)" : "rgba(255, 144, 144, 1)";
      deps.ctx.lineWidth = 3;
      deps.ctx.strokeRect(targetScreen.sx - size / 2 + 1, targetScreen.sy - size / 2 + 1, size - 2, size - 2);
      deps.ctx.restore();
    }
  }
};
