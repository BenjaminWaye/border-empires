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
  type ScoutFindingTile,
  type ScoutReportFindings
} from "@border-empires/shared";
import { resourceLabel } from "../client-map-display.js";
import { serverClock } from "../client-server-clock/client-server-clock.js";
import type { FeedEntry } from "../client-types.js";

export const createInitialScoutDroneState = () => ({
  /** The player's drone while it is in the air (times in local clock), otherwise undefined. */
  scoutDroneFlight: undefined as ScoutDroneFlight | undefined,
  /** Armed by Send scout drone on an AFC menu: the next map tap picks where to send it (client-scout-drone-picking.ts). */
  scoutDronePicking: { active: false }
});

type ScoutDroneState = ReturnType<typeof createInitialScoutDroneState> & { playerNames: Map<string, string> };

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
    ...(isFiniteNumber(raw.blockedAtY) ? { blockedAtY: raw.blockedAtY } : {})
  };
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
    ...(isFiniteNumber(raw.focusX) && isFiniteNumber(raw.focusY) ? { focusX: raw.focusX, focusY: raw.focusY } : {}),
    ...(typeof raw.blockedByPlayerId === "string" ? { blockedByPlayerId: raw.blockedByPlayerId } : {})
  };
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** One find group as the report words it, and where it is (empty when the report predates sites). */
export type ScoutFindingPart = { text: string; tiles: ScoutFindingTile[] };

/** The findings, one part per group, e.g. "1 town", "GRAIN (10 tiles)", in the report's order. */
export const scoutFindingParts = (findings: ScoutReportFindings, nameOf: (playerId: string) => string): ScoutFindingPart[] => {
  const sites = findings.sites;
  const parts: ScoutFindingPart[] = [];
  const add = (text: string, tiles: ScoutFindingTile[] | undefined): void => {
    parts.push({ text, tiles: tiles ?? [] });
  };
  if (findings.towns > 0) add(plural(findings.towns, "town"), sites?.towns);
  if (findings.docks > 0) add(plural(findings.docks, "dock"), sites?.docks);
  if (findings.waystations > 0) add(plural(findings.waystations, "waystation"), sites?.waystations);
  if (findings.watchtowers > 0) add(plural(findings.watchtowers, "watchtower"), sites?.watchtowers);
  if (findings.resourcesSighted?.length) {
    for (const { resource, count } of findings.resourcesSighted) add(`${resourceLabel(resource)} (${plural(count, "tile")})`, sites?.resources[resource]);
  } else if (findings.resourceTiles > 0) {
    add(plural(findings.resourceTiles, "resource tile"), sites ? Object.values(sites.resources).flat() : undefined);
  }
  if (findings.planetaryDefenseTiles > 0) add(`Planetary Defense (${plural(findings.planetaryDefenseTiles, "tile")})`, sites?.planetaryDefense);
  findings.empiresSighted.forEach((id, index) => {
    const name = nameOf(id);
    add(index === 0 ? `the borders of ${name}` : name, sites?.empires[id]);
  });
  return parts;
};

/** The findings as a short list, e.g. "1 town, 2 waystations, Planetary Defense (6 tiles)". Empty when nothing was found. */
export const scoutFindingsText = (findings: ScoutReportFindings, nameOf: (playerId: string) => string): string =>
  scoutFindingParts(findings, nameOf).map((part) => part.text).join(", ");

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
  const nameOf = (playerId: string): string => state.playerNames.get(playerId) ?? "another empire";
  // The Alerts feed is admin-only (client-feed-alert-surface.ts), so launch and report lines set
  // `alert`: a player who pressed Explore otherwise saw no drone message at all (2026-11-14 playtest).
  const push = (title: string, text: string, severity: FeedEntry["severity"], at: { x: number; y: number }, type: FeedEntry["type"] = "info"): void =>
    pushEntry({ title, text, type, severity, at: nowMs, alert: true, focusX: at.x, focusY: at.y, actionLabel: "Show" });
  if (msg.type === SCOUT_DRONE_MESSAGE_TYPE) {
    const previous = state.scoutDroneFlight;
    const next = msg.flight === null || msg.flight === undefined ? undefined : parseScoutDroneFlight(msg.flight, toLocal);
    state.scoutDroneFlight = next;
    // No "launched" popup: it only repeated the tap. The drone on the map, with its "Back in …"
    // pill (client-scout-drone-eta-label.ts), is the confirmation. A recall needs none either.
    if (next?.blockedByPlayerId && previous?.launchedAt === next.launchedAt && !previous.blockedByPlayerId) {
      push("Scout drone turned back", `Turned back at ${nameOf(next.blockedByPlayerId)}'s border.`, "warn", { x: next.blockedAtX ?? next.targetX, y: next.blockedAtY ?? next.targetY });
    }
    const report = parseScoutReport(msg.report);
    if (report) push("Scout report", scoutReportFeedText(report, nameOf, report.blockedByPlayerId ?? previous?.blockedByPlayerId), "success", { x: report.focusX ?? report.targetX, y: report.focusY ?? report.targetY });
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
