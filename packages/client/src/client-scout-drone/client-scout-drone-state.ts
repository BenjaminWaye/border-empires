// Client half of the scout drone (docs/explore-scout-plan.md). The simulation
// pushes SCOUT_DRONE when the player's drone launches, when it lands (with
// what it found) and on subscribe, and SCOUT_SIGHTED when a rival's drone is
// turned back at this player's border. Flight times arrive on the server's
// clock and are converted to local time here, so renderers and the Explore
// button compare them with Date.now() like every other client timer.
import {
  SCOUT_DRONE_MESSAGE_TYPE,
  SCOUT_SIGHTED_MESSAGE_TYPE,
  type ScoutDroneEndReason,
  type ScoutDroneFlight,
  type ScoutDroneStep,
  type ScoutReportFindings
} from "@border-empires/shared";
import { serverClock } from "../client-server-clock/client-server-clock.js";
import type { FeedSeverity, FeedType } from "../client-types.js";

export const createInitialScoutDroneState = () => ({
  /** The player's drone while it is in the air (times in local clock), otherwise undefined. */
  scoutDroneFlight: undefined as ScoutDroneFlight | undefined
});

type ScoutDroneState = ReturnType<typeof createInitialScoutDroneState> & { playerNames: Map<string, string> };

type ScoutReport = ScoutReportFindings & { targetX: number; targetY: number };

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const END_REASONS: readonly ScoutDroneEndReason[] = ["TARGET", "RANGE", "BLOCKED"];

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
    ...(isFiniteNumber(raw.blockedAtY) ? { blockedAtY: raw.blockedAtY } : {})
  };
};

const count = (value: unknown): number => (isFiniteNumber(value) && value > 0 ? Math.floor(value) : 0);

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
    planetaryDefenseTiles: count(raw.planetaryDefenseTiles),
    empiresSighted: Array.isArray(raw.empiresSighted) ? raw.empiresSighted.filter((id): id is string => typeof id === "string") : []
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
  if (findings.resourceTiles > 0) parts.push(plural(findings.resourceTiles, "resource tile"));
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

type PushFeed = (text: string, type?: FeedType, severity?: FeedSeverity) => void;

/**
 * Applies SCOUT_DRONE / SCOUT_SIGHTED. Returns true when `msg` was one of
 * them (handled or ignored as malformed), false for any other message.
 */
export const handleScoutDroneMessage = (
  msg: Record<string, unknown>,
  state: ScoutDroneState,
  pushFeed: PushFeed,
  renderHud: () => void,
  toLocal: (serverTime: number) => number = serverClock.toLocal
): boolean => {
  const nameOf = (playerId: string): string => state.playerNames.get(playerId) ?? "another empire";
  if (msg.type === SCOUT_DRONE_MESSAGE_TYPE) {
    const previous = state.scoutDroneFlight;
    state.scoutDroneFlight = msg.flight === null || msg.flight === undefined ? undefined : parseScoutDroneFlight(msg.flight, toLocal);
    const report = parseScoutReport(msg.report);
    if (report) pushFeed(scoutReportFeedText(report, nameOf, previous?.blockedByPlayerId), "info", "success");
    renderHud();
    return true;
  }
  if (msg.type === SCOUT_SIGHTED_MESSAGE_TYPE) {
    if (typeof msg.scoutPlayerId === "string" && isFiniteNumber(msg.x) && isFiniteNumber(msg.y)) {
      pushFeed(`Foreign scouts sighted near (${msg.x}, ${msg.y}): ${nameOf(msg.scoutPlayerId)}.`, "combat", "warn");
      renderHud();
    }
    return true;
  }
  return false;
};
