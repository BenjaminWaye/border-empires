// Client half of the scout drone (docs/explore-scout-plan.md). The simulation
// pushes SCOUT_DRONE when the player's drone launches, when it lands (with
// what it found) and on subscribe, and SCOUT_SIGHTED when a rival's drone is
// turned back at this player's border. Flight times arrive on the server's
// clock and are converted to local time here, so renderers and the Explore
// button compare them with Date.now() like every other client timer.
import { scoutReportShownHere } from "./client-scout-drone-seen-reports.js";
import {
  SCOUT_DRONE_MESSAGE_TYPE,
  SCOUT_SIGHTED_MESSAGE_TYPE,
  type ScoutDroneCharges,
  type ScoutDroneEndReason,
  type ScoutDroneFlight,
  type ScoutDroneStep,
  type ScoutFindingSites,
  type ScoutFindingTile,
  type ScoutReportFindings
} from "@border-empires/shared";
import { resourceLabel } from "../client-map-display.js";
import { serverClock } from "../client-server-clock/client-server-clock.js";
import type { FeedEntry } from "../client-types.js";
import { createInitialScoutFindsState, handleScoutFindsMessage, parseScoutFindingSites } from "./client-scout-drone-finds.js";

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
  /** A report id shown on this page that the server hasn't been told about yet (SCOUT_REPORT_SEEN, sent by client-scout-drone-hud.ts). */
  scoutReportUnacked: undefined as string | undefined,
  /** How many tiles the player had explored when the drone in the air launched: the report counts the new ones. */
  scoutDroneExploredAtLaunch: undefined as number | undefined,
  /** The flight in the air's launch time on the server's clock: identifies "the same flight" across messages. */
  scoutDroneLaunchedAtServer: undefined as number | undefined,
  // What the drone spots as it flies: pops over the map, and the card's chips frame them (client-scout-drone-finds.ts).
  ...createInitialScoutFindsState()
});

/** What a landed drone found, as the report card shows it. `at` is local time of landing. */
/** `id` names the flight; `viewed: false` until the card has been on a visible page (client-scout-drone-hud.ts), and `at` restarts then. */
export type ScoutDroneLandingReport = ScoutReportFindings & { targetX: number; targetY: number; blockedBy?: string; at: number; explored?: number; id?: string; viewed?: boolean };

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

const withSites = (sites: ScoutFindingSites | undefined): { sites?: ScoutFindingSites } => (sites ? { sites } : {});

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
    // Zero is kept: a flight over known ground explored nothing, and must not fall back to tilesSeen.
    ...(isFiniteNumber(raw.tilesExplored) && raw.tilesExplored >= 0 ? { tilesExplored: Math.floor(raw.tilesExplored) } : {}),
    ...withSites(parseScoutFindingSites(raw.sites)),
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
  if (findings.planetaryDefenseTiles > 0) add(`Insurgents (${plural(findings.planetaryDefenseTiles, "tile")})`, sites?.planetaryDefense);
  findings.empiresSighted.forEach((id, index) => {
    const name = nameOf(id);
    add(index === 0 ? `the borders of ${name}` : name, sites?.empires[id]);
  });
  return parts;
};

/** The findings as a short list, e.g. "1 town, 2 waystations, Insurgents (6 tiles)". Empty when nothing was found. */
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
    // A new flight, judged on the server's own launch time: the local conversion moves with the clock
    // offset, so a mid-flight message (sped up, turned, replayed on reconnect) read as a new flight and wiped
    // its finds (review 2026-11-21). Then: remember the explored count, drop the last flight's finds unless
    // they already belong to this one (the launch tick's SCOUT_FINDS arrive before this message), and clear
    // the last report's framed find.
    const serverLaunchedAt = next && msg.flight && typeof msg.flight === "object" ? (msg.flight as { launchedAt?: unknown }).launchedAt : undefined;
    if (next && typeof serverLaunchedAt === "number" && serverLaunchedAt !== state.scoutDroneLaunchedAtServer) {
      state.scoutDroneLaunchedAtServer = serverLaunchedAt;
      if (state.discoveredTiles) state.scoutDroneExploredAtLaunch = state.discoveredTiles.size;
      if (state.scoutDroneFinds?.launchedAt !== serverLaunchedAt) state.scoutDroneFinds = undefined;
      state.scoutFindFocus = undefined;
    }
    const charges = parseScoutDroneCharges(msg.charges, toLocal);
    if (charges) state.scoutDroneCharges = charges;
    // No "launched" popup: it only repeated the tap. The drone on the map, with its "Back in …"
    // pill (client-scout-drone-eta-label.ts), is the confirmation. A recall needs none either.
    if (next?.blockedByPlayerId && previous?.launchedAt === next.launchedAt && !previous.blockedByPlayerId) {
      push("Scout drone turned back", `Turned back at ${nameOf(next.blockedByPlayerId)}'s border.`, "warn", { x: next.blockedAtX ?? next.targetX, y: next.blockedAtY ?? next.targetY });
    }
    const report = parseScoutReport(msg.report);
    const rawReport = (msg.report ?? {}) as { id?: unknown; landedAt?: unknown };
    const reportId = typeof rawReport.id === "string" ? rawReport.id : undefined;
    // The server resends the last report until some device says it was seen (SCOUT_REPORT_SEEN). One this page
    // already showed isn't shown again; telling the server is retried instead (the last try may not have gone out).
    const shownHere = Boolean(reportId && (state.scoutDroneReport?.id === reportId || scoutReportShownHere(reportId)));
    if (reportId && shownHere && state.scoutDroneReport?.viewed !== false) state.scoutReportUnacked = reportId;
    // A resend without the report the player hasn't looked at here yet: another device showed it (SCOUT_REPORT_SEEN
    // cleared it on the server), so this one drops it instead of popping it up later (review 2026-11-21).
    if (!msg.report && state.scoutDroneReport?.viewed === false && state.scoutDroneReport.id) state.scoutDroneReport = undefined;
    if (report && !shownHere) {
      const landedAt = isFiniteNumber(rawReport.landedAt) ? Math.min(nowMs, toLocal(rawReport.landedAt)) : nowMs;
      const blockedBy = report.blockedByPlayerId ?? previous?.blockedByPlayerId;
      // The landing is the reward, so it gets its own card on top of the HUD (client-scout-drone-hud.ts)
      // rather than the shared alert card, where guide and House popups buried it (player review 2026-11-21).
      // The feed keeps the line for history.
      pushEntry({ title: "Scout report", text: scoutReportFeedText(report, nameOf, blockedBy), type: "info", severity: "success", at: landedAt, focusX: report.focusX ?? report.targetX, focusY: report.focusY ?? report.targetY, actionLabel: "Show" });
      const baseline = state.scoutDroneExploredAtLaunch;
      // The server's count of tiles the flight explored first, the same count Cartographer adds (playtest
      // 2026-11-26: "+160 Tiles" counted known ground too). Older servers send only the tiles the drone saw,
      // or nothing, so fall back to those, then to the tiles discovered since launch.
      const explored = report.tilesExplored ?? report.tilesSeen ?? (baseline !== undefined && state.discoveredTiles ? Math.max(0, state.discoveredTiles.size - baseline) : undefined);
      state.scoutDroneReport = { ...report, ...(blockedBy ? { blockedBy } : {}), ...(explored ? { explored } : {}), at: nowMs, ...(reportId ? { id: reportId } : {}), viewed: false };
      state.scoutFindFocus = undefined;
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
