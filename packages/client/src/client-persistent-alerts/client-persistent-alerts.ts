import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { shouldShowTownUnfedWarning } from "../client-town-growth/client-town-growth.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

export type NotificationCategory = "persistent_alert" | "action_feedback" | "history" | "debug";

export type PersistentAlertKind = "town_unfed" | "muster_active";

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

type PersistentAlertState = Pick<ClientState, "me" | "tiles" | "persistentAlertLocators">;

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

export const persistentAlertsForState = (state: Pick<ClientState, "me" | "tiles">): PersistentAlert[] => {
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
  ctx.strokeStyle = "#fff7d1";
  ctx.fillStyle = "#fff7d1";
  ctx.lineWidth = Math.max(1.5, size * 0.16);
  ctx.lineCap = "round";
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
  }
): void => {
  const allAlerts = persistentAlertsForState(state);
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
  for (const alert of alerts) {
    if (drawnCount >= 3) break;
    const projected = deps.worldToScreen(alert.x, alert.y, deps.size, deps.halfW, deps.halfH);
    if (isOnScreen(projected, canvas, margin)) continue;
    const edge = locatorEdgePoint(projected, canvas, inset);
    const pulse = 0.78 + Math.sin(deps.nowMs / 260) * 0.12;
    const radius = 20;
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
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(edge.angle);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-5, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-edge.angle);
    if (alert.kind === "muster_active") {
      drawCrossedSwordsGlyph(ctx, 9);
    } else {
      ctx.fillStyle = "#fff7d1";
      ctx.font = "700 13px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", 0, 0);
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
