import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  SCOUT_DRONE_MESSAGE_TYPE,
  SCOUT_DRONE_VISION_RADIUS,
  SCOUT_FINDS_MESSAGE_TYPE,
  SCOUT_REPORT_ACTIVITY_MIN_INTERVAL_MS,
  SCOUT_SIGHTED_ALERT_COOLDOWN_MS,
  SCOUT_SIGHTED_MESSAGE_TYPE,
  planScoutDroneWaypointFlight,
  SCOUT_DRONE_MAX_STOPS,
  extendScoutDroneFlight,
  rerouteScoutDroneFlightHome,
  scoutDroneBlockAt,
  scoutDroneStepIndexAt,
  speedUpScoutDroneFlight,
  turnScoutDroneFlightHome,
  type ScoutDroneFlight,
  type ScoutDronePayload,
  type ScoutReportFindings,
  type ScoutFind,
  type ScoutFindsPayload,
  type ScoutSightedPayload
} from "@border-empires/shared";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "../visibility-coverage-cache.js";
import { holdScoutReport, markScoutReportSeen, unseenScoutReport } from "./scout-drone-held-report.js";
import { createScoutChargeLedger } from "./scout-drone-charge-ledger.js";
import { parseScoutDroneExploreStops } from "./scout-drone-explore-payload.js";
import { createScoutFindings, scoutFindingsReport, type ScoutFindings } from "./scout-drone-findings.js";
import { createScoutDroneWorlds } from "./scout-drone-worlds.js";

export { isPlanetaryDefenseId } from "./scout-drone-worlds.js";

// Explore (docs/explore-scout-plan.md §13): one scout drone per player, launched
// from the active AFC nearest its first stop. It flies through its stops (each
// leg at most SCOUT_DRONE_MAX_LEG_TILES open tiles, shared scout-drone-route.ts),
// then straight home; a recall or a rival border ahead also sends it straight
// home from where it is (back along its route only when a rival border lies
// across the line home). EXPLORE while it is out adds the stops to its route
// (extendScoutDroneFlight), up to SCOUT_DRONE_MAX_ROUTE_STOPS in all. Each stop
// it will reach spends one charge; a charge refills SCOUT_DRONE_CHARGE_REFILL_MS
// later. Spends are kept on the player record and saved with snapshots
// (scout-drone-charge-ledger.ts), and every SCOUT_DRONE message carries them.
// While it flies it holds a radius-3 temporary reveal on the tile it is over,
// through the same coverage the fog of war and Planetary Defense wake-up read,
// so both follow it with no extra rules; the report counts what it saw out and
// home. Flights live only in memory: they last minutes, and a restart docks any
// drone in the air (EXPLORE is excluded from restart parity for this reason,
// sim-protocol command-coverage-sets.ts).

/** Hard bounds (docs/agents/state-and-persistence-discipline.md); each eviction or refusal counts in gauge(). */
export const SCOUT_DRONE_MAX_ACTIVE_FLIGHTS = 10_000;
export const SCOUT_SIGHTED_MAX_COOLDOWN_ENTRIES = 20_000;

type ActiveFlight = {
  readonly playerId: string;
  readonly commandId: string;
  /** Replaced when a border appears on the path mid-flight and the drone turns back early. */
  flight: ScoutDroneFlight;
  /** Last step index applied to vision and findings; -1 before launch. */
  lastStepIndex: number;
  /** The tile currently holding this drone's temporary reveal. */
  revealAt: { x: number; y: number } | undefined;
  readonly findings: ScoutFindings;
  alerted: boolean;
};

export type ScoutDroneRuntimeDeps = {
  readonly now: () => number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  readonly afcTileKeys: (playerId: string) => Iterable<string>;
  /** Owner of the authoritative reach border at a tile, if any: own and allied reach count as home ground. */
  readonly reachOwnerAt: (x: number, y: number) => string | undefined;
  /** Whether the player has ever seen the tile (explored-tiles-store.ts): routes are planned on what they know (scout-drone-worlds.ts). */
  readonly isExplored: (playerId: string, x: number, y: number) => boolean;
  // Getters: the runtime builds its coverage tracker after this module is created.
  readonly visibilityCoverage: () => Pick<VisibilityCoverageTracker, "addTemporaryReveal" | "removeTemporaryReveal">;
  readonly visionTransitionCallbacks: () => VisibilityTransitionCallbacks;
  readonly emitEvent: (event: SimulationEvent) => void;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  readonly recordPersonalImpact: (event: PersonalImpactEvent) => void;
  /** Whether the player has a live socket: SCOUT_FINDS is transient UI, sent only to someone watching. */
  readonly isPlayerSubscribed?: (playerId: string) => boolean;
};

export type ScoutDroneGauge = {
  activeFlights: number;
  alertCooldownEntries: number;
  capRefusals: number;
  cooldownEvictions: number;
  /** EXPLOREs refused with SCOUT_NO_CHARGES. */
  noChargeRefusals: number;
  /** EXPLOREs that would take a flying drone past SCOUT_DRONE_MAX_ROUTE_STOPS (SCOUT_ROUTE_FULL). */
  routeFullRefusals: number;
  /** Finds sent mid-flight in SCOUT_FINDS (the client's pops). */
  findsSent: number;
  /** Resends that carried the player's unseen landing report (scout-drone-held-report.ts). */
  heldReportsResent: number;
  /** SCOUT_REPORT_SEEN that cleared a report. */
  heldReportsSeen: number;
  /** Unseen reports dropped after a day. */
  heldReportsExpired: number;
  /** Times a rival border met on the way out turned the drone back (borders are planned on what the player knows). */
  borderTurnBacks: number;
  /** Times a rival border on the way home sent the drone round it. */
  homeReroutes: number;
  /** Charges given back for stops past a border the drone was turned back at. */
  chargesRefunded: number;
};

/** Stops one flight may hold once extended mid-flight (EXPLORE while the drone is out). */
export const SCOUT_DRONE_MAX_ROUTE_STOPS = SCOUT_DRONE_MAX_STOPS * 2;

export type ScoutDroneRuntime = {
  readonly handleExplore: (command: CommandEnvelope) => void;
  /** RECALL_SCOUT: turn the drone back over the outbound tile it is over now. */
  readonly handleRecall: (command: CommandEnvelope) => void;
  /** SCOUT_REPORT_SEEN: the player saw their last report on some device, so it stops riding along (scout-drone-held-report.ts). */
  readonly handleReportSeen: (command: CommandEnvelope) => void;
  readonly tick: (nowMs: number) => void;
  /** Push the player their drone (live subscribe / reconnect), `flight: null` while docked, with their charges. */
  readonly sendTo: (playerId: string) => void;
  readonly flightFor: (playerId: string) => ScoutDroneFlight | undefined;
  readonly gauge: () => ScoutDroneGauge;
};

/** The runtime's EXPLORE, RECALL_SCOUT and SCOUT_REPORT_SEEN dispatch entries (runtime-command-dispatch.ts). A getter: the runtime's drones are a class field. */
export const scoutDroneCommandDispatchHandlers = (
  drones: () => Pick<ScoutDroneRuntime, "handleExplore" | "handleRecall" | "handleReportSeen">
): {
  handleExploreCommand: (command: CommandEnvelope) => void;
  handleRecallScoutCommand: (command: CommandEnvelope) => void;
  handleScoutReportSeenCommand: (command: CommandEnvelope) => void;
} => ({
  handleExploreCommand: (command) => drones().handleExplore(command),
  handleRecallScoutCommand: (command) => drones().handleRecall(command),
  handleScoutReportSeenCommand: (command) => drones().handleReportSeen(command)
});

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const keyOf = (x: number, y: number): string => `${x},${y}`;

export const createScoutDroneRuntime = (deps: ScoutDroneRuntimeDeps): ScoutDroneRuntime => {
  const flights = new Map<string, ActiveFlight>();
  const lastAlertAt = new Map<string, number>();
  // When each player's last scout report went into the shared Activity log, so free
  // back-to-back flights can't crowd out everyone's other cards. Same bound as lastAlertAt.
  const lastReportActivityAt = new Map<string, number>();
  const charges = createScoutChargeLedger(deps.players);
  let capRefusals = 0;
  let noChargeRefusals = 0;
  let routeFullRefusals = 0;
  let findsSent = 0;
  let cooldownEvictions = 0;
  // The last landing report stays on the player until they have seen it on some device (scout-drone-held-report.ts).
  let heldReportsResent = 0;
  let heldReportsSeen = 0;
  let heldReportsExpired = 0;
  // Rival borders met in flight (unseen at planning, or claimed since): turned back on the way out, rerouted on the way home.
  let borderTurnBacks = 0;
  let homeReroutes = 0;
  let chargesRefunded = 0;

  const reject = (command: CommandEnvelope, code: string, message: string): void =>
    deps.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });

  const isOwnOrAllied = (actorId: string, ownerId: string): boolean => ownerId === actorId || (deps.players().get(actorId)?.allies.has(ownerId) ?? false);

  // Planned on what the player knows, flown on the live map (scout-drone-worlds.ts).
  const worlds = createScoutDroneWorlds({ ...deps, isOwnOrAllied });

  /** Ground ahead that became the player's reach or land mid-flight: the drone jumps forward over it. */
  const speedUpOverHomeGround = (active: ActiveFlight, nowMs: number): void => {
    const world = worlds.truth(active.playerId);
    const faster = speedUpScoutDroneFlight(active.flight, nowMs, (x, y) => world.classify(x, y).kind === "HOME");
    if (!faster) return;
    active.flight = faster;
    send(active.playerId, `scout-drone-sped-up:${active.commandId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: faster });
  };

  const nearestAfc = (playerId: string, target: { x: number; y: number }): { x: number; y: number } | undefined => {
    let best: { x: number; y: number; d: number } | undefined;
    for (const key of deps.afcTileKeys(playerId)) {
      const tile = deps.tiles().get(key);
      if (!tile || tile.afc?.status !== "active") continue;
      const dx = Math.abs(wrap(target.x - tile.x + deps.worldWidth / 2, deps.worldWidth) - deps.worldWidth / 2);
      const dy = Math.abs(wrap(target.y - tile.y + deps.worldHeight / 2, deps.worldHeight) - deps.worldHeight / 2);
      const d = Math.max(dx, dy);
      if (!best || d < best.d) best = { x: tile.x, y: tile.y, d };
    }
    return best;
  };

  /** Every SCOUT_DRONE message carries the player's charges, so the client's count never goes stale. */
  const send = (playerId: string, commandId: string, payload: Omit<ScoutDronePayload, "charges">): void => {
    const withCharges: ScoutDronePayload = { ...payload, charges: charges.wire(playerId, deps.now()) };
    deps.emitPlayerMessage({ commandId, playerId }, withCharges);
  };

  const moveReveal = (active: ActiveFlight, to: { x: number; y: number } | undefined): void => {
    if (active.revealAt) {
      deps.visibilityCoverage().removeTemporaryReveal(active.playerId, active.revealAt.x, active.revealAt.y, SCOUT_DRONE_VISION_RADIUS, deps.visionTransitionCallbacks());
    }
    active.revealAt = to;
    if (to) deps.visibilityCoverage().addTemporaryReveal(active.playerId, to.x, to.y, SCOUT_DRONE_VISION_RADIUS, deps.visionTransitionCallbacks());
    // The fanout only drains vision edges on a TILE_DELTA_BATCH. Without one
    // here the revealed tiles waited for an unrelated batch, and the next
    // move's leave edges cancelled the unsent enter edges, so land under the
    // drone flickered in late or never and was gone again moments later
    // (playtest). An empty batch flushes them, like alliance sync does. One id
    // per flight: the gateway dedupes and looks up commands by id.
    deps.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: `scout-drone-vision:${active.commandId}`, playerId: active.playerId, tileDeltas: [] });
  };

  const alertRival = (active: ActiveFlight, nowMs: number): void => {
    const { blockedByPlayerId: rivalId, blockedAtX, blockedAtY } = active.flight;
    if (active.alerted || !rivalId || blockedAtX === undefined || blockedAtY === undefined) return;
    active.alerted = true;
    const cooldownKey = `${rivalId}|${active.playerId}`;
    const last = lastAlertAt.get(cooldownKey);
    if (last !== undefined && nowMs - last < SCOUT_SIGHTED_ALERT_COOLDOWN_MS) return;
    if (!lastAlertAt.has(cooldownKey) && lastAlertAt.size >= SCOUT_SIGHTED_MAX_COOLDOWN_ENTRIES) {
      const oldest = lastAlertAt.keys().next().value;
      if (oldest !== undefined) lastAlertAt.delete(oldest);
      cooldownEvictions += 1;
    }
    lastAlertAt.delete(cooldownKey);
    lastAlertAt.set(cooldownKey, nowMs);
    const payload: ScoutSightedPayload = { type: SCOUT_SIGHTED_MESSAGE_TYPE, scoutPlayerId: active.playerId, x: blockedAtX, y: blockedAtY };
    deps.emitPlayerMessage({ commandId: `scout-sighted:${active.commandId}`, playerId: rivalId }, payload);
    deps.recordPersonalImpact({ kind: "SCOUT_SIGHTED", id: `scout-sighted:${active.commandId}`, playerId: rivalId, occurredAt: nowMs, x: blockedAtX, y: blockedAtY, scoutPlayerId: active.playerId });
  };

  const sendTo = (playerId: string): void => {
    // A docked drone is sent as `flight: null` too: flights live only in memory, so after a
    // restart the client (and the gateway's replay of the last message) would otherwise keep a
    // flight that no longer exists and block Explore until its old landing time, which on a
    // long flight is over an hour.
    const flight = flights.get(playerId)?.flight ?? null;
    const unseen = unseenScoutReport(deps.players().get(playerId), deps.now(), () => { heldReportsExpired += 1; });
    const report = flight ? undefined : unseen;
    if (report) heldReportsResent += 1;
    send(playerId, `scout-drone:${playerId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight, ...(report ? { report } : {}) });
  };

  const land = (active: ActiveFlight, nowMs: number): void => {
    moveReveal(active, undefined);
    flights.delete(active.playerId);
    const report = scoutFindingsReport(active.findings);
    const { targetX, targetY, blockedByPlayerId } = active.flight;
    const foundSomething = report.towns + report.docks + report.waystations + report.watchtowers + report.resourceTiles + report.planetaryDefenseTiles + report.empiresSighted.length > 0;
    const lastLogged = lastReportActivityAt.get(active.playerId);
    if ((foundSomething || blockedByPlayerId) && (lastLogged === undefined || nowMs - lastLogged >= SCOUT_REPORT_ACTIVITY_MIN_INTERVAL_MS)) {
      if (!lastReportActivityAt.has(active.playerId) && lastReportActivityAt.size >= SCOUT_SIGHTED_MAX_COOLDOWN_ENTRIES) {
        const oldest = lastReportActivityAt.keys().next().value;
        if (oldest !== undefined) lastReportActivityAt.delete(oldest);
        cooldownEvictions += 1;
      }
      lastReportActivityAt.delete(active.playerId);
      lastReportActivityAt.set(active.playerId, nowMs);
      recordReport(active, nowMs, report);
    }
    const landed = { ...report, targetX, targetY, ...(blockedByPlayerId ? { blockedByPlayerId } : {}), id: active.commandId, landedAt: nowMs };
    holdScoutReport(deps.players().get(active.playerId), landed);
    send(active.playerId, `scout-drone-landed:${active.commandId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: null, report: landed });
  };

  const recordReport = (active: ActiveFlight, nowMs: number, report: ScoutReportFindings): void => {
    const { targetX, targetY, blockedByPlayerId } = active.flight;
    const { focusX, focusY, ...counts } = report;
    deps.recordPersonalImpact({
      kind: "SCOUT_REPORT",
      id: `scout-report:${active.commandId}`,
      playerId: active.playerId,
      occurredAt: nowMs,
      ...counts,
      // The activity card's Show jumps to x/y: the notable find, not where the drone was aimed.
      x: focusX ?? targetX,
      y: focusY ?? targetY,
      ...(blockedByPlayerId ? { blockedByPlayerId } : {})
    });
  };

  const revealOver = (active: ActiveFlight, tile: { x: number; y: number }): void => {
    if (active.revealAt?.x !== tile.x || active.revealAt.y !== tile.y) moveReveal(active, { x: tile.x, y: tile.y });
  };

  /** A rival border on the next outbound tile (claimed, or an alliance ended, mid-flight): turn back now. Returns true when it did. */
  const turnBackIfBlocked = (active: ActiveFlight, stepIndex: number, nowMs: number): boolean => {
    if (stepIndex <= 0) return false;
    const { steps } = active.flight;
    const wall = scoutDroneBlockAt(steps[stepIndex - 1]!, steps[stepIndex]!, worlds.truth(active.playerId));
    if (!wall) return false;
    // Over the last tile it can reach first: the border comes into its sight (and the player's
    // explored memory), so the way home is planned round it.
    revealOver(active, steps[stepIndex - 1]!);
    const stopsBefore = active.flight.waypoints?.length ?? 1;
    active.flight = turnScoutDroneFlightHome(active.flight, stepIndex - 1, nowMs, worlds.known(active.playerId), wall);
    active.lastStepIndex = stepIndex - 1;
    // Each stop was charged at launch. The leg cut short still costs one, as a route cut at a border the
    // player could see does; the stops past the border were never reached, so they come back.
    const unreached = stopsBefore - (active.flight.waypoints?.length ?? 1) - 1;
    charges.refund(active.playerId, unreached, nowMs);
    chargesRefunded += Math.max(0, unreached);
    borderTurnBacks += 1;
    alertRival(active, nowMs);
    send(active.playerId, `scout-drone-turned:${active.commandId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: active.flight });
    return true;
  };

  /**
   * A rival border on the next homeward tile: the way home was planned on what the player knew, so
   * it can run into land they had never seen (or land claimed since). The drone goes round it from
   * the tile before. Returns true when it did; with no way round it keeps flying, never stranded.
   */
  const rerouteHomeIfBlocked = (active: ActiveFlight, stepIndex: number, nowMs: number): boolean => {
    const { steps } = active.flight;
    if (stepIndex <= active.flight.turnIndex || !scoutDroneBlockAt(steps[stepIndex - 1]!, steps[stepIndex]!, worlds.truth(active.playerId))) return false;
    revealOver(active, steps[stepIndex - 1]!);
    const rerouted = rerouteScoutDroneFlightHome(active.flight, stepIndex - 1, nowMs, worlds.known(active.playerId));
    if (!rerouted) return false;
    active.flight = rerouted;
    active.lastStepIndex = stepIndex - 1;
    homeReroutes += 1;
    send(active.playerId, `scout-drone-rerouted:${active.commandId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: active.flight });
    return true;
  };

  const advance = (active: ActiveFlight, nowMs: number): void => {
    speedUpOverHomeGround(active, nowMs);
    const { flight } = active;
    const index = scoutDroneStepIndexAt(flight, nowMs);
    if (index > active.lastStepIndex) {
      const owner = deps.players().get(active.playerId);
      // Steps passed since the last tick all count toward the report, even when a slow tick skipped them,
      // and the way home too: a straight return flies over new ground. Only outbound steps can turn it
      // back. A border on the way home sends it round (rerouteHomeIfBlocked), or, with no way round,
      // it keeps flying home: a border must never strand the drone.
      // What the steps passed this tick found, sent as it happens so the client can pop it over the map:
      // players waited 2-3 minutes with nothing to show until the landing report (review 2026-11-21).
      const found: ScoutFind[] = [];
      const sendFound = (): void => {
        if (found.length === 0 || deps.isPlayerSubscribed?.(active.playerId) === false) return;
        const payload: ScoutFindsPayload = { type: SCOUT_FINDS_MESSAGE_TYPE, launchedAt: flight.launchedAt, finds: found };
        // One id per flight, as for the drone's vision batches: the gateway records each player message by
        // commandId, and an id per tick would grow that store with every find.
        deps.emitPlayerMessage({ commandId: `scout-finds:${active.commandId}`, playerId: active.playerId }, payload);
        findsSent += found.length;
      };
      for (let i = Math.max(0, active.lastStepIndex + 1); i <= index; i += 1) {
        // Either one leaves the reveal over the tile before the border.
        if ((i <= flight.turnIndex && turnBackIfBlocked(active, i, nowMs)) || (i > flight.turnIndex && rerouteHomeIfBlocked(active, i, nowMs))) {
          sendFound();
          return;
        }
        const step = flight.steps[i]!;
        if (owner) found.push(...active.findings.observe(step.x, step.y, owner));
      }
      sendFound();
      if (index >= flight.turnIndex && flight.endReason === "BLOCKED") alertRival(active, nowMs);
      active.lastStepIndex = index;
    }
    if (nowMs >= flight.landsAt) {
      land(active, nowMs);
      return;
    }
    const step = flight.steps[index];
    if (step && (active.revealAt?.x !== step.x || active.revealAt.y !== step.y)) moveReveal(active, { x: step.x, y: step.y });
  };

  /** EXPLORE while the drone is out: the new stops join its route (shared extendScoutDroneFlight). */
  const extendFlight = (command: CommandEnvelope, active: ActiveFlight, stops: Array<{ x: number; y: number }>): void => {
    const now = deps.now();
    if (stops.length > charges.available(active.playerId, now)) {
      noChargeRefusals += 1;
      return reject(command, "SCOUT_NO_CHARGES", "no scout drone charges left");
    }
    if ((active.flight.waypoints?.length ?? 1) + stops.length > SCOUT_DRONE_MAX_ROUTE_STOPS) {
      routeFullRefusals += 1;
      return reject(command, "SCOUT_ROUTE_FULL", "your scout drone's route is full");
    }
    const extended = extendScoutDroneFlight(active.flight, now, stops, worlds.known(active.playerId));
    if (!extended) return reject(command, "SCOUT_NO_PATH", "no clear way to those tiles");
    charges.spend(active.playerId, extended.newStopsReached, now);
    active.flight = extended.flight;
    active.alerted = false;
    send(active.playerId, command.commandId, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: active.flight });
    deps.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  };

  return {
    handleExplore: (command) => {
      const actor = deps.players().get(command.playerId);
      const stops = parseScoutDroneExploreStops(command.payloadJson, deps.worldWidth, deps.worldHeight);
      if (!actor || !stops) return reject(command, "BAD_COMMAND", "invalid explore request");
      const flying = flights.get(actor.id);
      if (flying) {
        // Catch up first (it may have just landed); a drone still out takes the new stops on.
        advance(flying, deps.now());
        if (flights.has(actor.id)) return extendFlight(command, flying, stops);
      }
      if (flights.size >= SCOUT_DRONE_MAX_ACTIVE_FLIGHTS) {
        capRefusals += 1;
        return reject(command, "SCOUT_DRONE_BUSY", "no scout drones can launch right now");
      }
      const first = stops[0]!;
      const world = worlds.known(actor.id);
      const targetOwnerId = deps.tiles().get(keyOf(first.x, first.y))?.ownerId;
      if (targetOwnerId && isOwnOrAllied(actor.id, targetOwnerId)) return reject(command, "SCOUT_TARGET_HOME", "explore past your own land");
      const launch = nearestAfc(actor.id, first);
      if (!launch) return reject(command, "SCOUT_NO_AFC", "scout drones launch from an active AFC");
      const now = deps.now();
      if (stops.length > charges.available(actor.id, now)) {
        noChargeRefusals += 1;
        return reject(command, "SCOUT_NO_CHARGES", "no scout drone charges left");
      }
      const flight = planScoutDroneWaypointFlight(launch, stops, now, world);
      if (!flight) return reject(command, "SCOUT_NO_PATH", "no clear way out from your AFC toward that tile");
      // One charge per stop it will actually reach: a route cut short at a rival border costs less.
      charges.spend(actor.id, flight.waypoints?.length ?? 1, now);
      const active: ActiveFlight = { playerId: actor.id, commandId: command.commandId, flight, lastStepIndex: -1, revealAt: undefined, findings: createScoutFindings(deps.tiles, deps.worldWidth, deps.worldHeight), alerted: false };
      flights.set(actor.id, active);
      advance(active, now);
      send(actor.id, command.commandId, { type: SCOUT_DRONE_MESSAGE_TYPE, flight });
      deps.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    },
    handleReportSeen: (command) => {
      let id: unknown;
      try {
        id = (JSON.parse(command.payloadJson) as { id?: unknown }).id;
      } catch {
        id = undefined;
      }
      // Seen on one device: resend without it, so the player's other devices and the gateway's replay copy drop it too.
      if (markScoutReportSeen(deps.players().get(command.playerId), id)) {
        heldReportsSeen += 1;
        sendTo(command.playerId);
      }
      // A repeat or a stale id is fine: another device may have said so first.
      deps.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    },
    handleRecall: (command) => {
      const active = flights.get(command.playerId);
      if (!active) return reject(command, "SCOUT_DRONE_DOCKED", "your scout drone is not out");
      const now = deps.now();
      // Catch up first: outbound tiles passed since the last tick still count toward the
      // report, and a border on the path may already have turned it back (or it landed).
      advance(active, now);
      // Already called home (it may still be finishing its last outbound leg), or past its turn.
      if (!flights.has(command.playerId) || active.flight.endReason === "RECALLED" || active.lastStepIndex >= active.flight.turnIndex) {
        return reject(command, "SCOUT_DRONE_RETURNING", "your scout drone is already flying home");
      }
      // Turn over the tile it is flying toward: it finishes this leg, then heads home
      // (turning over the last tile reached would snap it backwards mid-leg).
      active.flight = turnScoutDroneFlightHome(active.flight, active.lastStepIndex + 1, now, worlds.known(command.playerId));
      send(command.playerId, command.commandId, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: active.flight });
      deps.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    },
    tick: (nowMs) => {
      for (const active of [...flights.values()]) advance(active, nowMs);
      for (const [key, at] of lastAlertAt) if (nowMs - at >= SCOUT_SIGHTED_ALERT_COOLDOWN_MS) lastAlertAt.delete(key);
      for (const [key, at] of lastReportActivityAt) if (nowMs - at >= SCOUT_REPORT_ACTIVITY_MIN_INTERVAL_MS) lastReportActivityAt.delete(key);
    },
    sendTo,
    flightFor: (playerId) => flights.get(playerId)?.flight,
    gauge: () => ({
      activeFlights: flights.size,
      alertCooldownEntries: lastAlertAt.size,
      capRefusals,
      cooldownEvictions,
      routeFullRefusals,
      noChargeRefusals,
      findsSent,
      heldReportsResent,
      heldReportsSeen,
      heldReportsExpired,
      borderTurnBacks,
      homeReroutes,
      chargesRefunded
    })
  };
};
