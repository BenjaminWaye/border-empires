import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { shouldShowTownUnfedWarning } from "../client-town-growth/client-town-growth.js";
import type { ClientState } from "../client-state/client-state.js";
import type { ClientShardRainAlert } from "../client-shard-alert/client-shard-alert.js";
import type { Tile } from "../client-types.js";

export type NotificationCategory = "persistent_alert" | "action_feedback" | "history" | "debug";

export type PersistentAlertKind = "town_unfed" | "muster_active" | "waypoint_manpower_paused" | "shard_rain";

export type PersistentAlert = {
  id: string;
  kind: PersistentAlertKind;
  title: string;
  detail: string;
  x: number;
  y: number;
  severity: "warn" | "error";
};

export type PersistentAlertLocator = {
  id: string;
  kind: PersistentAlertKind;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  radius: number;
};

type PersistentAlertState = Pick<ClientState, "me" | "tiles" | "waypoint" | "persistentAlertLocators"> & {
  shardAlert?: ClientState["shardAlert"] | undefined;
};

const townLabel = (tile: Tile): string => tile.town?.name || tile.townName || `Town ${tile.x}, ${tile.y}`;

const musterLabel = (tile: Tile): string => {
  const muster = tile.muster;
  if (!muster) return "";
  if (muster.mode === "ADVANCE") return `Advancing ${muster.amount} manpower toward (${muster.targetX ?? "?"}, ${muster.targetY ?? "?"}).`;
  return `Holding ${muster.amount} manpower at (${tile.x}, ${tile.y}).`;
};

// Regression for the 2026-07-14 staging login stall: the generic "still
// starting" message is misleading once the sim is up but draining a large
// command backlog after a restart (which can take minutes) — the gateway
// flags that case with backlogDegraded: true on the SERVER_STARTING payload
// so this can show an accurate message instead.
export const serverStartingBusyMessages = (backlogDegraded: boolean): { detail: string; retryStatus: string } =>
  backlogDegraded
    ? {
        detail: "The game server is replaying a backlog of prior activity after a restart. This can take a few minutes; no progress is lost.",
        retryStatus: "Server is replaying a backlog after a restart. Retrying sign-in..."
      }
    : {
        detail: "The game server is still starting. Sign-in will retry automatically.",
        retryStatus: "Game server is still starting. Retrying sign-in..."
      };

export const notificationCategoryForServerError = (code: string): NotificationCategory => {
  if (code === "TOWN_UNFED") return "persistent_alert";
  if (code === "SIMULATION_UNAVAILABLE" || code === "SERVER_STARTING") return "debug";
  if (code.startsWith("TECH_") || code.startsWith("DOMAIN_")) return "action_feedback";
  if (code === "COLLECT_EMPTY" || code === "COLLECT_COOLDOWN") return "action_feedback";
  return "action_feedback";
};

const shardRainSiteLabel = (x: number, y: number): string => `A shard landed here at (${x}, ${y}). It may already be gone.`;

// Shard rain sites are shown for the full life of the event (alert.expiresAt,
// ~30 minutes) rather than the short client-shard-rain-pings reveal window:
// this is a "something landed here" locator, independent of whether the
// player has since explored/fogged the tile or collected the shard.
export const persistentAlertsForState = (
  state: Pick<ClientState, "me" | "tiles" | "waypoint"> & { shardAlert?: ClientShardRainAlert | undefined },
  nowMs: number = Date.now()
): PersistentAlert[] => {
  const alerts: PersistentAlert[] = [];
  for (const tile of state.tiles.values()) {
    if (tile.ownerId === state.me && shouldShowTownUnfedWarning(tile)) {
      alerts.push({
        id: `town_unfed:${tile.x},${tile.y}`,
        kind: "town_unfed",
        title: "Town unfed",
        detail: `${townLabel(tile)} needs FOOD upkeep.`,
        x: tile.x,
        y: tile.y,
        severity: "warn"
      });
    }
    if (tile.muster && tile.muster.ownerId === state.me) {
      alerts.push({
        id: `muster_active:${tile.x},${tile.y}`,
        kind: "muster_active",
        title: "Muster flag active",
        detail: musterLabel(tile),
        x: tile.x,
        y: tile.y,
        severity: "warn"
      });
    }
  }
  for (const wp of state.waypoint) {
    if (!wp.pausedForManpower) continue;
    const origin = wp.plan.steps[0]?.origin ?? wp.target;
    alerts.push({
      id: `waypoint_manpower_paused:${wp.target.x},${wp.target.y}`,
      kind: "waypoint_manpower_paused",
      title: "Waypoint paused",
      detail: `Waiting on manpower to keep expanding toward (${wp.target.x}, ${wp.target.y}).`,
      x: origin.x,
      y: origin.y,
      severity: "warn"
    });
  }
  const shardAlert = state.shardAlert;
  if (shardAlert?.phase === "started" && shardAlert.sites && nowMs < shardAlert.expiresAt) {
    for (const site of shardAlert.sites) {
      alerts.push({
        id: `shard_rain:${site.x},${site.y}`,
        kind: "shard_rain",
        title: "Shard rain",
        detail: shardRainSiteLabel(site.x, site.y),
        x: site.x,
        y: site.y,
        severity: "warn"
      });
    }
  }
  return alerts;
};

export const nearestPersistentAlerts = (
  alerts: PersistentAlert[],
  state: Pick<ClientState, "camX" | "camY">,
  deps: { toroidDelta: (from: number, to: number, dim: number) => number; worldWidth: number; worldHeight: number },
  limit: number
): PersistentAlert[] => {
  return [...alerts]
    .sort((a, b) => {
      const adx = deps.toroidDelta(state.camX, a.x, deps.worldWidth);
      const ady = deps.toroidDelta(state.camY, a.y, deps.worldHeight);
      const bdx = deps.toroidDelta(state.camX, b.x, deps.worldWidth);
      const bdy = deps.toroidDelta(state.camY, b.y, deps.worldHeight);
      return adx * adx + ady * ady - (bdx * bdx + bdy * bdy);
    })
    .slice(0, limit);
};

const locatorEdgePoint = (
  targetScreen: { sx: number; sy: number },
  canvas: { width: number; height: number },
  inset: number
): { x: number; y: number; angle: number } => {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const dx = targetScreen.sx - cx;
  const dy = targetScreen.sy - cy;
  const safeDx = Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 ? 0 : dx;
  const safeDy = Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 ? -1 : dy;
  const scaleX = safeDx === 0 ? Number.POSITIVE_INFINITY : (safeDx > 0 ? canvas.width - inset - cx : inset - cx) / safeDx;
  const scaleY = safeDy === 0 ? Number.POSITIVE_INFINITY : (safeDy > 0 ? canvas.height - inset - cy : inset - cy) / safeDy;
  const scale = Math.max(0, Math.min(Math.abs(scaleX), Math.abs(scaleY)));
  return {
    x: Math.max(inset, Math.min(canvas.width - inset, cx + safeDx * scale)),
    y: Math.max(inset, Math.min(canvas.height - inset, cy + safeDy * scale)),
    angle: Math.atan2(safeDy, safeDx)
  };
};

const isOnScreen = (point: { sx: number; sy: number }, canvas: { width: number; height: number }, margin: number): boolean =>
  point.sx >= margin && point.sx <= canvas.width - margin && point.sy >= margin && point.sy <= canvas.height - margin;

const drawCrossedSwordsGlyph = (ctx: CanvasRenderingContext2D, size: number): void => {
  ctx.save();
  ctx.lineCap = "round";
  for (const flip of [1, -1]) {
    ctx.save();
    ctx.scale(flip, 1);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.lineWidth = Math.max(3, size * 0.3);
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.55);
    ctx.lineTo(size * 0.55, size * 0.55);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.55);
    ctx.lineTo(-size * 0.3, -size * 0.55);
    ctx.lineTo(-size * 0.55, -size * 0.3);
    ctx.closePath();
    ctx.stroke();
    ctx.save();
    ctx.translate(-size * 0.42, -size * 0.42);
    ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = Math.max(2.5, size * 0.25);
    ctx.beginPath();
    ctx.moveTo(-size * 0.16, 0);
    ctx.lineTo(size * 0.16, 0);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  ctx.strokeStyle = "#fff7d1";
  ctx.fillStyle = "#fff7d1";
  ctx.lineWidth = Math.max(1.5, size * 0.16);
  for (const flip of [1, -1]) {
    ctx.save();
    ctx.scale(flip, 1);
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.55);
    ctx.lineTo(size * 0.55, size * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.55);
    ctx.lineTo(-size * 0.3, -size * 0.55);
    ctx.lineTo(-size * 0.55, -size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(-size * 0.42, -size * 0.42);
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-size * 0.16, 0);
    ctx.lineTo(size * 0.16, 0);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
};

const drawShardGlyph = (ctx: CanvasRenderingContext2D, size: number): void => {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.62, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.62, 0);
  ctx.closePath();
  ctx.fill();
  ctx.translate(-size * 0.08, -size * 0.08);
  ctx.fillStyle = "#bdf3ff";
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.62, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.62, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

// Toast anchored over the exact impact tile once it's scrolled on-screen —
// a positional blip only, deliberately silent on whether the shard is still
// there (the tile may still be unexplored/fogged, or already collected).
const drawShardRainToast = (ctx: CanvasRenderingContext2D, point: { x: number; y: number }, label: string): void => {
  ctx.save();
  ctx.font = "600 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const paddingX = 10;
  const paddingY = 6;
  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 14 + paddingY * 2;
  const boxX = point.x - boxWidth / 2;
  const tileClearance = 28;
  const boxY = point.y - tileClearance - boxHeight;
  ctx.fillStyle = "rgba(17, 23, 34, 0.92)";
  ctx.strokeStyle = "rgba(102, 224, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  ctx.beginPath();
  ctx.moveTo(point.x - 6, boxY + boxHeight);
  ctx.lineTo(point.x + 6, boxY + boxHeight);
  ctx.lineTo(point.x, boxY + boxHeight + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#bdf3ff";
  ctx.fillText(label, point.x, boxY + boxHeight / 2);
  ctx.restore();
};

export const drawPersistentAlertLocators = (
  state: PersistentAlertState & Pick<ClientState, "camX" | "camY">,
  deps: {
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
    toroidDelta: (from: number, to: number, dim: number) => number;
    size: number;
    halfW: number;
    halfH: number;
    nowMs: number;
    precomputedAlerts?: PersistentAlert[];
  }
): void => {
  const allAlerts = deps.precomputedAlerts ?? persistentAlertsForState(state);
  const alerts = nearestPersistentAlerts(
    allAlerts,
    state,
    { toroidDelta: deps.toroidDelta, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT },
    allAlerts.length
  );
  state.persistentAlertLocators = [];
  if (alerts.length === 0) return;
  const ctx = deps.ctx;
  const canvas = deps.canvas;
  const margin = 34;
  const inset = 30;
  ctx.save();
  let drawnCount = 0;
  let toastCount = 0;
  for (const alert of alerts) {
    const projected = deps.worldToScreen(alert.x, alert.y, deps.size, deps.halfW, deps.halfH);
    if (isOnScreen(projected, canvas, margin)) {
      if (alert.kind === "shard_rain" && toastCount < 3) {
        drawShardRainToast(ctx, { x: projected.sx, y: projected.sy }, "Shard landed here");
        toastCount += 1;
      }
      continue;
    }
    if (drawnCount >= 3) continue;
    const edge = locatorEdgePoint(projected, canvas, inset);
    const pulse = 0.78 + Math.sin(deps.nowMs / 260) * 0.12;
    const radius = 26;
    state.persistentAlertLocators.push({
      id: alert.id,
      kind: alert.kind,
      x: alert.x,
      y: alert.y,
      screenX: edge.x,
      screenY: edge.y,
      radius
    });
    ctx.save();
    ctx.translate(edge.x, edge.y);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "rgba(17, 23, 34, 0.92)";
    ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(edge.angle);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(radius * 0.6, 0);
    ctx.lineTo(-radius * 0.35, -radius * 0.5);
    ctx.lineTo(-radius * 0.15, 0);
    ctx.lineTo(-radius * 0.35, radius * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-edge.angle);
    if (alert.kind === "muster_active") {
      drawCrossedSwordsGlyph(ctx, radius * 0.55);
    } else if (alert.kind === "shard_rain") {
      drawShardGlyph(ctx, radius * 0.55);
    } else {
      ctx.font = `700 ${radius * 1.3}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillText("!", 0, radius * 0.05);
      ctx.fillStyle = "#fff7d1";
      ctx.fillText("!", 0, radius * 0.02);
    }
    ctx.restore();
    drawnCount += 1;
  }
  ctx.restore();
};

export const persistentAlertLocatorAt = (
  state: Pick<ClientState, "persistentAlertLocators">,
  offsetX: number,
  offsetY: number
): PersistentAlertLocator | undefined => {
  let best: PersistentAlertLocator | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const locator of state.persistentAlertLocators) {
    const distance = Math.hypot(offsetX - locator.screenX, offsetY - locator.screenY);
    if (distance > locator.radius + 8 || distance >= bestDistance) continue;
    best = locator;
    bestDistance = distance;
  }
  return best;
};
