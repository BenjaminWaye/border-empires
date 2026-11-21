// Client half of the scout drone (docs/explore-scout-plan.md). The simulation
// pushes SCOUT_DRONE when the player's drone launches, when it lands (with
// what it found) and on subscribe, and SCOUT_SIGHTED when a rival's drone is
// turned back at this player's border. Flight times arrive on the server's
// clock and are converted to local time here, so renderers and the Explore
// button compare them with Date.now() like every other client timer.
import {
  SCOUT_DRONE_MESSAGE_TYPE,
  SCOUT_SIGHTED_MESSAGE_TYPE,
  type ScoutDroneCharges,
  type ScoutDroneEndReason,
  type ScoutDroneFlight,
  type ScoutDroneStep,
  type ScoutReportFindings
} from "@border-empires/shared";
import { resourceLabel } from "../client-map-display.js";
import { serverClock } from "../client-server-clock/client-server-clock.js";
import type { FeedEntry } from "../client-types.js";
import { createInitialScoutFindsState, handleScoutFindsMessage } from "./client-scout-drone-finds.js";

export const createInitialScoutDroneState = () => ({
  /** The player's drone while it is in the air (times in local clock), otherwise undefined. */
  scoutDroneFlight: undefined as ScoutDroneFlight | undefined,
  /** The charges as the server last sent them, spend times in local clock (client-scout-drone-plan.ts). */
  scoutDroneCharges: undefined as ScoutDroneCharges | undefined,
  /**
   * A flight being planned (client-scout-drone-plan.ts): started by tapping fog or Send scout drone
   * on an AFC. `stops` as tapped; `bumpAt` / `shakeAt` animate the dock; `launches` counts this
   * session's flights, so the "tap the fog" hint stops once the player has the idea.
   */
  scoutDronePicking: { active: false, stops: [] as Array<{ x: number; y: number }>, bumpAt: 0, shakeAt: 0, launches: 0 },
  /** The last landing's report, shown as a card until dismissed, for 90 s, and not while planning or flying (client-scout-drone-hud.ts). */
  scoutDroneReport: undefined as ScoutDroneLandingReport | undefined,
  /** How many tiles the player had explored when the drone in the air launched: the report counts the new ones. */
  scoutDroneExploredAtLaunch: undefined as number | undefined,
  // What the drone spots as it flies: pops over the map, and the card's chips frame them (client-scout-drone-finds.ts).
  ...createInitialScoutFindsState()
});

/** What a landed drone found, as the report card shows it. `at` is local time of landing. */
export type ScoutDroneLandingReport = ScoutReportFindings & { targetX: number; targetY: number; blockedBy?: string; at: number; explored?: number };

type ScoutDroneState = ReturnType<typeof createInitialScoutDroneState> & { playerNames: Map<string, string>; discoveredTiles?: ReadonlySet<string> };

type ScoutReport = ScoutReportFindings & { targetX: number; targetY: number; blockedByPlayerId?: string };

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const END_REASONS: readonly ScoutDroneEndReason[] = ["TARGET", "BLOCKED", "RECALLED"];

/** Parses a wire flight, converting its server-clock times with `toLocal`. Undefined when malformed. */
export const parseScoutDroneFlight = (value: unknown, toLocal: (serverTime: number) => number): ScoutDroneFlight | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!isFiniteNumber(raw.launchedAt) || !isFiniteNumber(raw.landsAt) || !isFiniteNumber(raw.targetX) || !isFiniteNumber(raw.targetY)) return undefined;
  if (!isFiniteNumber(raw.turnIndex) || !Array.isArray(raw.steps)) return undefined;
  const steps: ScoutDroneStep[] = [];
  for (const entry of raw.steps) {
    if (!entry || typeof entry !== "object") return undefined;
    const step = entry as Record<string, unknown>;
    if (!isFiniteNumber(step.x) || !isFiniteNumber(step.y) || !isFiniteNumber(step.at)) return undefined;
    steps.push({ x: step.x, y: step.y, at: toLocal(step.at) });
  }
  if (steps.length === 0 || raw.turnIndex < 0 || raw.turnIndex >= steps.length) return undefined;
  const endReason = END_REASONS.find((reason) => reason === raw.endReason) ?? "TARGET";
  return {
    launchedAt: toLocal(raw.launchedAt),
    landsAt: toLocal(raw.landsAt),
    targetX: raw.targetX,
    targetY: raw.targetY,
    steps,
    turnIndex: raw.turnIndex,
    endReason,
    ...(typeof raw.blockedByPlayerId === "string" ? { blockedByPlayerId: raw.blockedByPlayerId } : {}),
    ...(isFiniteNumber(raw.blockedAtX) ? { blockedAtX: raw.blockedAtX } : {}),
    ...(isFiniteNumber(raw.blockedAtY) ? { blockedAtY: raw.blockedAtY } : {}),
    ...(Array.isArray(raw.waypoints)
      ? { waypoints: raw.waypoints.flatMap((p: unknown) => (p && typeof p === "object" && isFiniteNumber((p as Point).x) && isFiniteNumber((p as Point).y) ? [{ x: (p as Point).x, y: (p as Point).y }] : [])) }
      : {})
  };
};

type Point = { x: number; y: number };

/** Parses the charges on a SCOUT_DRONE message into local clock. Undefined when absent or malformed. */
export const parseScoutDroneCharges = (value: unknown, toLocal: (serverTime: number) => number): ScoutDroneCharges | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!isFiniteNumber(raw.max) || !isFiniteNumber(raw.refillMs) || !Array.isArray(raw.usedAt)) return undefined;
  return { max: raw.max, refillMs: raw.refillMs, usedAt: raw.usedAt.filter(isFiniteNumber).map(toLocal) };
};

const count = (value: unknown): number => (isFiniteNumber(value) && value > 0 ? Math.floor(value) : 0);

const readScoutResourceCounts = (value: unknown): NonNullable<ScoutReportFindings["resourcesSighted"]> => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.resource !== "string") return [];
    const amount = count(entry.count);
    return amount > 0 ? [{ resource: entry.resource, count: amount }] : [];
  });
};

const parseScoutReport = (value: unknown): ScoutReport | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!isFiniteNumber(raw.targetX) || !isFiniteNumber(raw.targetY)) return undefined;
  return {
    targetX: raw.targetX,
    targetY: raw.targetY,
    towns: count(raw.towns),
    docks: count(raw.docks),
    waystations: count(raw.waystations),
    watchtowers: count(raw.watchtowers),
    resourceTiles: count(raw.resourceTiles),
    resourcesSighted: readScoutResourceCounts(raw.resourcesSighted),
    planetaryDefenseTiles: count(raw.planetaryDefenseTiles),
    empiresSighted: Array.isArray(raw.empiresSighted) ? raw.empiresSighted.filter((id): id is string => typeof id === "string") : [],
    ...(isFiniteNumber(raw.tilesSeen) && raw.tilesSeen > 0 ? { tilesSeen: Math.floor(raw.tilesSeen) } : {}),
    ...(isFiniteNumber(raw.focusX) && isFiniteNumber(raw.focusY) ? { focusX: raw.focusX, focusY: raw.focusY } : {}),
    ...(typeof raw.blockedByPlayerId === "string" ? { blockedByPlayerId: raw.blockedByPlayerId } : {})
  };
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The findings as a short list, e.g. "1 town, 2 waystations, Planetary Defense (6 tiles)". Empty when nothing was found. */
export const scoutFindingsText = (findings: ScoutReportFindings, nameOf: (playerId: string) => string): string => {
  const parts: string[] = [];
  if (findings.towns > 0) parts.push(plural(findings.towns, "town"));
  if (findings.docks > 0) parts.push(plural(findings.docks, "dock"));
  if (findings.waystations > 0) parts.push(plural(findings.waystations, "waystation"));
  if (findings.watchtowers > 0) parts.push(plural(findings.watchtowers, "watchtower"));
  if (findings.resourcesSighted?.length) {
    parts.push(...findings.resourcesSighted.map(({ resource, count }) => `${resourceLabel(resource)} (${plural(count, "tile")})`));
  } else if (findings.resourceTiles > 0) {
    parts.push(plural(findings.resourceTiles, "resource tile"));
  }
  if (findings.planetaryDefenseTiles > 0) parts.push(`Planetary Defense (${plural(findings.planetaryDefenseTiles, "tile")})`);
  if (findings.empiresSighted.length > 0) parts.push(`the borders of ${findings.empiresSighted.map(nameOf).join(", ")}`);
  return parts.join(", ");
};

/** The feed line for a landed drone. `blockedBy` names the empire whose border turned it back. */
export const scoutReportFeedText = (report: ScoutReport, nameOf: (playerId: string) => string, blockedBy?: string): string => {
  const found = scoutFindingsText(report, nameOf);
  const head = `Scout drone returned from (${report.targetX}, ${report.targetY})`;
  const turned = blockedBy ? ` It was turned back at ${nameOf(blockedBy)}'s border.` : "";
  return found ? `${head}: ${found}.${turned}` : `${head}: found nothing new.${turned}`;
};

/** Pushes a feed entry (client-alerts.ts pushFeedEntry); `alert` entries also reach the on-screen alert card. */
type PushFeedEntry = (entry: FeedEntry) => void;

/**
 * Applies SCOUT_DRONE / SCOUT_SIGHTED. Returns true when `msg` was one of
 * them (handled or ignored as malformed), false for any other message.
 */
export const handleScoutDroneMessage = (
  msg: Record<string, unknown>,
  state: ScoutDroneState,
  pushEntry: PushFeedEntry,
  renderHud: () => void,
  toLocal: (serverTime: number) => number = serverClock.toLocal,
  nowMs: number = Date.now()
): boolean => {
  if (handleScoutFindsMessage(msg, state, nowMs)) return true;
  const nameOf = (playerId: string): string => state.playerNames.get(playerId) ?? "another empire";
  // The Alerts feed is admin-only (client-feed-alert-surface.ts), so launch and report lines set
  // `alert`: a player who pressed Explore otherwise saw no drone message at all (2026-11-14 playtest).
  const push = (title: string, text: string, severity: FeedEntry["severity"], at: { x: number; y: number }, type: FeedEntry["type"] = "info"): void =>
    pushEntry({ title, text, type, severity, at: nowMs, alert: true, focusX: at.x, focusY: at.y, actionLabel: "Show" });
  if (msg.type === SCOUT_DRONE_MESSAGE_TYPE) {
    const previous = state.scoutDroneFlight;
    const next = msg.flight === null || msg.flight === undefined ? undefined : parseScoutDroneFlight(msg.flight, toLocal);
    state.scoutDroneFlight = next;
    // A new flight: remember the explored count, so the landing card can say how much it uncovered, and
    // drop the last flight's finds (the new flight's SCOUT_FINDS start its own list).
    if (next && previous?.launchedAt !== next.launchedAt) {
      if (state.discoveredTiles) state.scoutDroneExploredAtLaunch = state.discoveredTiles.size;
      state.scoutDroneFinds = undefined;
    }
    const charges = parseScoutDroneCharges(msg.charges, toLocal);
    if (charges) state.scoutDroneCharges = charges;
    // No "launched" popup: it only repeated the tap. The drone on the map, with its "Back in …"
    // pill (client-scout-drone-eta-label.ts), is the confirmation. A recall needs none either.
    if (next?.blockedByPlayerId && previous?.launchedAt === next.launchedAt && !previous.blockedByPlayerId) {
      push("Scout drone turned back", `Turned back at ${nameOf(next.blockedByPlayerId)}'s border.`, "warn", { x: next.blockedAtX ?? next.targetX, y: next.blockedAtY ?? next.targetY });
    }
    const report = parseScoutReport(msg.report);
    if (report) {
      const blockedBy = report.blockedByPlayerId ?? previous?.blockedByPlayerId;
      // The landing is the reward, so it gets its own card on top of the HUD (client-scout-drone-hud.ts)
      // rather than the shared alert card, where guide and House popups buried it (player review 2026-11-21).
      // The feed keeps the line for history.
      pushEntry({ title: "Scout report", text: scoutReportFeedText(report, nameOf, blockedBy), type: "info", severity: "success", at: nowMs, focusX: report.focusX ?? report.targetX, focusY: report.focusY ?? report.targetY, actionLabel: "Show" });
      const baseline = state.scoutDroneExploredAtLaunch;
      // The server's count of tiles the drone saw; older servers send none, so fall back to the tiles
      // discovered since launch (rougher: other reveals mix in, and a reload resets the baseline).
      const explored = report.tilesSeen ?? (baseline !== undefined && state.discoveredTiles ? Math.max(0, state.discoveredTiles.size - baseline) : undefined);
      state.scoutDroneReport = { ...report, ...(blockedBy ? { blockedBy } : {}), ...(explored ? { explored } : {}), at: nowMs };
      state.scoutDroneExploredAtLaunch = undefined;
    }
    renderHud();
    return true;
  }
  if (msg.type === SCOUT_SIGHTED_MESSAGE_TYPE) {
    if (typeof msg.scoutPlayerId === "string" && isFiniteNumber(msg.x) && isFiniteNumber(msg.y)) {
      push("Foreign scouts", `Foreign scouts sighted near (${msg.x}, ${msg.y}): ${nameOf(msg.scoutPlayerId)}.`, "warn", { x: msg.x, y: msg.y }, "combat");
      renderHud();
    }
    return true;
  }
  return false;
};
