import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  SCOUT_DRONE_MESSAGE_TYPE,
  SCOUT_DRONE_VISION_RADIUS,
  SCOUT_REPORT_ACTIVITY_MIN_INTERVAL_MS,
  SCOUT_SIGHTED_ALERT_COOLDOWN_MS,
  SCOUT_SIGHTED_MESSAGE_TYPE,
  planScoutDroneWaypointFlight,
  recallScoutDroneFlight,
  scoutDroneBlockAt,
  scoutDroneStepIndexAt,
  speedUpScoutDroneFlight,
  turnScoutDroneFlightBack,
  type ScoutDroneFlight,
  type ScoutDronePayload,
  type ScoutDroneTileClass,
  type ScoutReportFindings,
  type ScoutDroneWorld,
  type ScoutSightedPayload
} from "@border-empires/shared";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "../visibility-coverage-cache.js";
import { createScoutChargeLedger } from "./scout-drone-charge-ledger.js";
import { parseScoutDroneExploreStops } from "./scout-drone-explore-payload.js";
import { createScoutFindings, scoutFindingsReport, type ScoutFindings } from "./scout-drone-findings.js";

// Explore (docs/explore-scout-plan.md): one scout drone per player, launched
// from the active AFC nearest its first stop. It flies through up to
// SCOUT_DRONE_MAX_STOPS stops (each leg at most SCOUT_DRONE_MAX_LEG_TILES open
// tiles, shared scout-drone-route.ts), then straight home, or back along its
// route when a rival border is in the way. Each stop it will reach spends one
// charge at launch; a charge refills SCOUT_DRONE_CHARGE_REFILL_MS later
// (scout-drone-charge-ledger.ts), and every SCOUT_DRONE message carries the
// player's charges. While it flies it holds a radius-3 temporary reveal on the
// tile it is over, through the same coverage the fog of war and Planetary
// Defense wake-up read, so both follow it with no extra rules; the report
// counts what it saw out and home. Flights and charge spends live only in
// memory: flights last minutes, and a restart docks any drone in the air and
// refunds spent charges (EXPLORE is excluded from restart parity for this
// reason, sim-protocol command-coverage-sets.ts).

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
  // Getters: the runtime builds its coverage tracker after this module is created.
  readonly visibilityCoverage: () => Pick<VisibilityCoverageTracker, "addTemporaryReveal" | "removeTemporaryReveal">;
  readonly visionTransitionCallbacks: () => VisibilityTransitionCallbacks;
  readonly emitEvent: (event: SimulationEvent) => void;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  readonly recordPersonalImpact: (event: PersonalImpactEvent) => void;
};

export type ScoutDroneGauge = {
  activeFlights: number;
  alertCooldownEntries: number;
  capRefusals: number;
  cooldownEvictions: number;
  /** Players with charges still refilling, and how many were evicted at the cap (each eviction refunds that player). */
  chargeEntries: number;
  chargeEvictions: number;
  /** EXPLOREs refused with SCOUT_NO_CHARGES. */
  noChargeRefusals: number;
};

export type ScoutDroneRuntime = {
  readonly handleExplore: (command: CommandEnvelope) => void;
  /** RECALL_SCOUT: turn the drone back over the outbound tile it is over now. */
  readonly handleRecall: (command: CommandEnvelope) => void;
  readonly tick: (nowMs: number) => void;
  /** Push the player their drone (live subscribe / reconnect), `flight: null` while docked, with their charges. */
  readonly sendTo: (playerId: string) => void;
  readonly flightFor: (playerId: string) => ScoutDroneFlight | undefined;
  readonly gauge: () => ScoutDroneGauge;
};

/** The runtime's EXPLORE and RECALL_SCOUT dispatch entries (runtime-command-dispatch.ts). A getter: the runtime's drones are a class field. */
export const scoutDroneCommandDispatchHandlers = (
  drones: () => Pick<ScoutDroneRuntime, "handleExplore" | "handleRecall">
): { handleExploreCommand: (command: CommandEnvelope) => void; handleRecallScoutCommand: (command: CommandEnvelope) => void } => ({
  handleExploreCommand: (command) => drones().handleExplore(command),
  handleRecallScoutCommand: (command) => drones().handleRecall(command)
});

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const keyOf = (x: number, y: number): string => `${x},${y}`;
export const isPlanetaryDefenseId = (playerId: string): boolean => playerId.startsWith("barbarian-");

export const createScoutDroneRuntime = (deps: ScoutDroneRuntimeDeps): ScoutDroneRuntime => {
  const flights = new Map<string, ActiveFlight>();
  const lastAlertAt = new Map<string, number>();
  // When each player's last scout report went into the shared Activity log, so free
  // back-to-back flights can't crowd out everyone's other cards. Same bound as lastAlertAt.
  const lastReportActivityAt = new Map<string, number>();
  const charges = createScoutChargeLedger();
  let capRefusals = 0;
  let noChargeRefusals = 0;
  let cooldownEvictions = 0;

  const reject = (command: CommandEnvelope, code: string, message: string): void =>
    deps.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });

  const isOwnOrAllied = (actorId: string, ownerId: string): boolean => ownerId === actorId || (deps.players().get(actorId)?.allies.has(ownerId) ?? false);

  // Read live each time, so a border that appears, an alliance that ends or reach that grows mid-flight counts.
  const worldFor = (actorId: string): ScoutDroneWorld => ({
    width: deps.worldWidth,
    height: deps.worldHeight,
    classify: (x: number, y: number): { kind: ScoutDroneTileClass; ownerId?: string } => {
      const wx = wrap(x, deps.worldWidth);
      const wy = wrap(y, deps.worldHeight);
      const ownerId = deps.tiles().get(keyOf(wx, wy))?.ownerId;
      // Planetary Defense land stays open even inside reach: the drone still scouts it.
      if (ownerId && isPlanetaryDefenseId(ownerId)) return { kind: "OPEN" };
      if (ownerId) return isOwnOrAllied(actorId, ownerId) ? { kind: "HOME" } : { kind: "BLOCKED", ownerId };
      // Unclaimed ground inside the player's (or an ally's) reach is already in sight: fly it at home pace.
      const reachOwnerId = deps.reachOwnerAt(wx, wy);
      return reachOwnerId && isOwnOrAllied(actorId, reachOwnerId) ? { kind: "HOME" } : { kind: "OPEN" };
    }
  });

  /** Ground ahead that became the player's reach or land mid-flight: the drone jumps forward over it. */
  const speedUpOverHomeGround = (active: ActiveFlight, nowMs: number): void => {
    const world = worldFor(active.playerId);
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
    send(active.playerId, `scout-drone-landed:${active.commandId}`, {
      type: SCOUT_DRONE_MESSAGE_TYPE,
      flight: null,
      report: { ...report, targetX, targetY, ...(blockedByPlayerId ? { blockedByPlayerId } : {}) }
    });
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

  /** A rival border on the next outbound tile (claimed, or an alliance ended, mid-flight): turn back now. Returns true when it did. */
  const turnBackIfBlocked = (active: ActiveFlight, stepIndex: number, nowMs: number): boolean => {
    if (stepIndex <= 0) return false;
    const { steps } = active.flight;
    const wall = scoutDroneBlockAt(steps[stepIndex - 1]!, steps[stepIndex]!, worldFor(active.playerId));
    if (!wall) return false;
    active.flight = turnScoutDroneFlightBack(active.flight, stepIndex - 1, nowMs, wall);
    active.lastStepIndex = stepIndex - 1;
    alertRival(active, nowMs);
    send(active.playerId, `scout-drone-turned:${active.commandId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: active.flight });
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
      // back: the way home was checked clear at planning, and a border that appears on it later must
      // not strand the drone, so it keeps flying home.
      for (let i = Math.max(0, active.lastStepIndex + 1); i <= index; i += 1) {
        if (i <= flight.turnIndex && turnBackIfBlocked(active, i, nowMs)) {
          const turn = active.flight.steps[active.flight.turnIndex]!;
          moveReveal(active, { x: turn.x, y: turn.y });
          return;
        }
        const step = flight.steps[i]!;
        if (owner) active.findings.observe(step.x, step.y, owner);
      }
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

  return {
    handleExplore: (command) => {
      const actor = deps.players().get(command.playerId);
      const stops = parseScoutDroneExploreStops(command.payloadJson, deps.worldWidth, deps.worldHeight);
      if (!actor || !stops) return reject(command, "BAD_COMMAND", "invalid explore request");
      if (flights.has(actor.id)) return reject(command, "SCOUT_DRONE_BUSY", "your scout drone is already out");
      if (flights.size >= SCOUT_DRONE_MAX_ACTIVE_FLIGHTS) {
        capRefusals += 1;
        return reject(command, "SCOUT_DRONE_BUSY", "no scout drones can launch right now");
      }
      const first = stops[0]!;
      const world = worldFor(actor.id);
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
      active.flight = recallScoutDroneFlight(active.flight, active.lastStepIndex + 1, now);
      send(command.playerId, command.commandId, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: active.flight });
      deps.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    },
    tick: (nowMs) => {
      for (const active of [...flights.values()]) advance(active, nowMs);
      for (const [key, at] of lastAlertAt) if (nowMs - at >= SCOUT_SIGHTED_ALERT_COOLDOWN_MS) lastAlertAt.delete(key);
      for (const [key, at] of lastReportActivityAt) if (nowMs - at >= SCOUT_REPORT_ACTIVITY_MIN_INTERVAL_MS) lastReportActivityAt.delete(key);
      charges.prune(nowMs);
    },
    sendTo: (playerId) => {
      // A docked drone is sent as `flight: null` too: flights live only in memory, so after a
      // restart the client (and the gateway's replay of the last message) would otherwise keep a
      // flight that no longer exists and block Explore until its old landing time, which on a
      // long flight is over an hour.
      const flight = flights.get(playerId)?.flight ?? null;
      send(playerId, `scout-drone:${playerId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight });
    },
    flightFor: (playerId) => flights.get(playerId)?.flight,
    gauge: () => ({
      activeFlights: flights.size,
      alertCooldownEntries: lastAlertAt.size,
      capRefusals,
      cooldownEvictions,
      chargeEntries: charges.size(),
      chargeEvictions: charges.evictions(),
      noChargeRefusals
    })
  };
};
