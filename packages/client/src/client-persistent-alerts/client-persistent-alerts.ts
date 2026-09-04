import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { shouldShowTownUnfedWarning } from "../client-town-growth/client-town-growth.js";
import type { ClientState } from "../client-state/client-state.js";
import type { ClientShardRainAlert } from "../client-shard-alert/client-shard-alert.js";
import type { Tile } from "../client-types.js";
import { musterStatusText } from "../client-side-panel-html/client-side-panel-html.js";

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
  shardRainStatus?: ClientState["shardRainStatus"] | undefined;
};

const townLabel = (tile: Tile): string => tile.town?.name || tile.townName || `Town ${tile.x}, ${tile.y}`;

// Shares musterStatusText with the HUD panel and tile menu (see that
// function's doc comment) so ADVANCE and MARCH flags both get a real status
// ("Fighting at (x,y)", "Traveling"/"Planning next move — Ns") instead of
// MARCH silently falling through to the generic "Holding" text a mode-only
// check would give it.
const musterLabel = (tile: Tile): string => {
  const muster = tile.muster;
  if (!muster) return "";
  return musterStatusText({
    mode: muster.mode,
    amount: muster.amount,
    x: tile.x,
    y: tile.y,
    targetX: muster.targetX,
    targetY: muster.targetY,
    inFlight: muster.inFlight,
    nextActionAt: muster.nextActionAt,
    fightX: muster.fightX,
    fightY: muster.fightY,
    noTargetInRange: muster.noTargetInRange,
    insufficientManpower: muster.insufficientManpower
  });
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

// Shard rain sites are shown for the full life of the event
// (shardRainStatus.expiresAt, ~30 minutes) rather than the short
// client-shard-rain-pings reveal window: this is a "something landed here"
// locator, independent of whether the player has since explored/fogged the
// tile. Deliberately reads shardRainStatus, not the dismissible shardAlert
// toast field (client-alerts.ts clears shardAlert on dismissal but leaves
// shardRainStatus alone) — dismissing the toast shouldn't also blind the
// player to where the sites are. It does drop once the tile confirms the
// shard is actually gone (an unfogged read with no shardSite) — an
// absent/fogged tile just means we haven't heard about it yet, so the
// locator keeps showing in that case.
const shardSiteCollected = (tiles: Pick<ClientState, "tiles">["tiles"], x: number, y: number): boolean => {
  const tile = tiles.get(`${x},${y}`);
  return tile !== undefined && !tile.fogged && !tile.shardSite;
};

export const persistentAlertsForState = (
  state: Pick<ClientState, "me" | "tiles" | "waypoint"> & { shardRainStatus?: ClientShardRainAlert | undefined },
  nowMs: number = Date.now()
): PersistentAlert[] => {
  const alerts: PersistentAlert[] = [];
  for (const tile of state.tiles.values()) {
    if (tile.ownerId === state.me && shouldShowTownUnfedWarning(tile, state.me)) {
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
  const shardRainStatus = state.shardRainStatus;
  if (shardRainStatus?.phase === "started" && shardRainStatus.sites && nowMs < shardRainStatus.expiresAt) {
    for (const site of shardRainStatus.sites) {
      if (shardSiteCollected(state.tiles, site.x, site.y)) continue;
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

// A "ping" pin — a round badge whose rim tapers to a single point aimed at
// the off-screen target, like the off-screen waypoint/ally markers in
// Apex Legends, Destiny 2, and Fortnite: a circular icon slot stays
// perfectly round and legible, and only a small integrated tip (not the
// whole badge) carries the direction. Earlier this whole body was a
// 4-point kite/chevron outline, which read as a lopsided arrowhead with no
// room for the icon inside it — this keeps the same "outline is the
// pointer" idea but merges the tip into a circle via two straight tangent
// lines plus the remaining arc, instead of replacing the circle outright.
const LOCATOR_TIP_HALF_ANGLE = 0.85; // radians; wider = fatter tip base
const LOCATOR_TIP_LENGTH_RATIO = 0.85; // extra length beyond the rim, as a fraction of radius

const drawLocatorPinBody = (ctx: CanvasRenderingContext2D, radius: number): void => {
  const p1 = -LOCATOR_TIP_HALF_ANGLE;
  const p2 = LOCATOR_TIP_HALF_ANGLE;
  const tipDistance = radius * (1 + LOCATOR_TIP_LENGTH_RATIO);
  ctx.beginPath();
  ctx.moveTo(radius * Math.cos(p2), radius * Math.sin(p2));
  ctx.lineTo(tipDistance, 0);
  ctx.lineTo(radius * Math.cos(p1), radius * Math.sin(p1));
  // Sweep the long way around (through angle = π, the back of the badge)
  // so the small wedge facing the tip is the only part the tangent lines
  // replace — the rest stays a true circle.
  ctx.arc(0, 0, radius, p1, p2, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

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

// A shard, not the CRYSTAL resource's faceted round gem (💎 reads as "you're
// short on Crystal", the wrong message for "something landed here"). White
// fill with a pale cyan rim and facet lines — the same palette as the real
// shard-site model (client-map-3d-shard-overlay.ts: color "#ffffff",
// emissive "#ccefff", shimmer core rgb(50,210,233)) so the locator/badge
// reads as the same object, just a 2D silhouette of it. Exported so the 3D
// badge overlay (client-map-3d.ts's shardRainBadgeOverlay) can paint the
// identical icon onto its canvas texture instead of duplicating the shape.
export const drawShardGlyph = (ctx: CanvasRenderingContext2D, size: number): void => {
  ctx.save();
  const points: Array<[number, number]> = [
    [0, -size],
    [size * 0.55, -size * 0.38],
    [size * 0.34, size * 0.75],
    [0, size],
    [-size * 0.34, size * 0.75],
    [-size * 0.55, -size * 0.38]
  ];
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (const [px, py] of points.slice(1)) ctx.lineTo(px, py);
  ctx.closePath();
  // Dark contrast base first — white-on-gold-shield or white-on-pale-badge
  // is under 1.2:1 contrast on its own (WCAG wants 3:1+ for graphics), so a
  // wide dark stroke sits under the fill the same way drawCrossedSwordsGlyph
  // above lays a black stroke under its bright color on this same shield.
  ctx.strokeStyle = "rgba(15, 26, 33, 0.75)";
  ctx.lineWidth = Math.max(3, size * 0.32);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#8fd9ec";
  ctx.lineWidth = Math.max(1.5, size * 0.12);
  ctx.stroke();
  // Two facet lines through the middle, echoing the shimmer core color of
  // the real shard-site model.
  ctx.strokeStyle = "rgba(50, 210, 233, 0.55)";
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.moveTo(-size * 0.55, -size * 0.38);
  ctx.lineTo(size * 0.34, size * 0.75);
  ctx.stroke();
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
  for (const alert of alerts) {
    const projected = deps.worldToScreen(alert.x, alert.y, deps.size, deps.halfW, deps.halfH);
    // On-screen alerts get their own in-world indicator (e.g. the 3D
    // bobbing badge over a shard rain site in client-map-3d.ts, or the
    // muster flag model itself) rather than a HUD locator here.
    if (isOnScreen(projected, canvas, margin)) continue;
    if (drawnCount >= 3) continue;
    const edge = locatorEdgePoint(projected, canvas, inset);
    const pulse = 0.78 + Math.sin(deps.nowMs / 260) * 0.12;
    const radius = 22;
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
    // A round badge with the direction carried by a single tapered tip
    // (drawLocatorPinBody), not the whole outline — see that function's
    // comment for why. The icon inside stays upright: rotate for the body,
    // draw it, then rotate back before drawing the glyph.
    ctx.rotate(edge.angle);
    ctx.fillStyle = "rgba(17, 23, 34, 0.92)";
    ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    drawLocatorPinBody(ctx, radius);
    ctx.rotate(-edge.angle);
    if (alert.kind === "muster_active") {
      drawCrossedSwordsGlyph(ctx, radius * 0.5);
    } else if (alert.kind === "shard_rain") {
      drawShardGlyph(ctx, radius * 0.5);
    } else {
      ctx.font = `700 ${radius * 1.1}px system-ui`;
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
