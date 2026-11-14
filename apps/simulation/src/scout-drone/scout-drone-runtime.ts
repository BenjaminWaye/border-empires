import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  SCOUT_DRONE_MESSAGE_TYPE,
  SCOUT_DRONE_VISION_RADIUS,
  SCOUT_SIGHTED_ALERT_COOLDOWN_MS,
  SCOUT_SIGHTED_MESSAGE_TYPE,
  planScoutDroneFlight,
  scoutDroneStepIndexAt,
  type ScoutDroneFlight,
  type ScoutDronePayload,
  type ScoutDroneTileClass,
  type ScoutSightedPayload
} from "@border-empires/shared";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "../visibility-coverage-cache.js";
import { createScoutFindings, scoutFindingsReport, type ScoutFindings } from "./scout-drone-findings.js";

// Explore (docs/explore-scout-plan.md): one scout drone per player, launched
// from the AFC nearest the target. While it flies it holds a radius-3
// temporary reveal on the tile it is over, through the same coverage the fog
// of war and Planetary Defense wake-up read, so both follow it with no extra
// rules. Flights live only in memory: they last minutes, and a restart docks
// any drone in the air (EXPLORE is excluded from restart parity for this
// reason, sim-protocol command-coverage-sets.ts).

/** Hard bounds (docs/agents/state-and-persistence-discipline.md); each eviction or refusal counts in gauge(). */
export const SCOUT_DRONE_MAX_ACTIVE_FLIGHTS = 10_000;
export const SCOUT_SIGHTED_MAX_COOLDOWN_ENTRIES = 20_000;

type ActiveFlight = {
  readonly playerId: string;
  readonly commandId: string;
  readonly flight: ScoutDroneFlight;
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
  // Getters: the runtime builds its coverage tracker after this module is created.
  readonly visibilityCoverage: () => Pick<VisibilityCoverageTracker, "addTemporaryReveal" | "removeTemporaryReveal">;
  readonly visionTransitionCallbacks: () => VisibilityTransitionCallbacks;
  readonly emitEvent: (event: SimulationEvent) => void;
  readonly emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  readonly recordPersonalImpact: (event: PersonalImpactEvent) => void;
};

export type ScoutDroneGauge = { activeFlights: number; alertCooldownEntries: number; capRefusals: number; cooldownEvictions: number };

export type ScoutDroneRuntime = {
  readonly handleExplore: (command: CommandEnvelope) => void;
  readonly tick: (nowMs: number) => void;
  /** Push the player their drone's current state (live subscribe / reconnect). */
  readonly sendTo: (playerId: string) => void;
  readonly flightFor: (playerId: string) => ScoutDroneFlight | undefined;
  readonly gauge: () => ScoutDroneGauge;
};

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const keyOf = (x: number, y: number): string => `${x},${y}`;
export const isPlanetaryDefenseId = (playerId: string): boolean => playerId.startsWith("barbarian-");

const parseTarget = (payloadJson: string): { x: number; y: number } | undefined => {
  try {
    const payload = JSON.parse(payloadJson) as { x?: unknown; y?: unknown };
    return Number.isInteger(payload.x) && Number.isInteger(payload.y) ? { x: payload.x as number, y: payload.y as number } : undefined;
  } catch {
    return undefined;
  }
};

export const createScoutDroneRuntime = (deps: ScoutDroneRuntimeDeps): ScoutDroneRuntime => {
  const flights = new Map<string, ActiveFlight>();
  const lastAlertAt = new Map<string, number>();
  let capRefusals = 0;
  let cooldownEvictions = 0;

  const reject = (command: CommandEnvelope, code: string, message: string): void =>
    deps.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });

  const classifyFor = (actor: DomainPlayer) => (x: number, y: number): { kind: ScoutDroneTileClass; ownerId?: string } => {
    const ownerId = deps.tiles().get(keyOf(x, y))?.ownerId;
    if (!ownerId || isPlanetaryDefenseId(ownerId)) return { kind: "OPEN" };
    if (ownerId === actor.id || actor.allies.has(ownerId)) return { kind: "HOME" };
    return { kind: "BLOCKED", ownerId };
  };

  const nearestAfc = (playerId: string, target: { x: number; y: number }): { x: number; y: number } | undefined => {
    let best: { x: number; y: number; d: number } | undefined;
    for (const key of deps.afcTileKeys(playerId)) {
      const tile = deps.tiles().get(key);
      if (!tile) continue;
      const dx = Math.abs(wrap(target.x - tile.x + deps.worldWidth / 2, deps.worldWidth) - deps.worldWidth / 2);
      const dy = Math.abs(wrap(target.y - tile.y + deps.worldHeight / 2, deps.worldHeight) - deps.worldHeight / 2);
      const d = Math.max(dx, dy);
      if (!best || d < best.d) best = { x: tile.x, y: tile.y, d };
    }
    return best;
  };

  const send = (playerId: string, commandId: string, payload: ScoutDronePayload): void => deps.emitPlayerMessage({ commandId, playerId }, payload);

  const moveReveal = (active: ActiveFlight, to: { x: number; y: number } | undefined): void => {
    if (active.revealAt) {
      deps.visibilityCoverage().removeTemporaryReveal(active.playerId, active.revealAt.x, active.revealAt.y, SCOUT_DRONE_VISION_RADIUS, deps.visionTransitionCallbacks());
    }
    active.revealAt = to;
    if (to) deps.visibilityCoverage().addTemporaryReveal(active.playerId, to.x, to.y, SCOUT_DRONE_VISION_RADIUS, deps.visionTransitionCallbacks());
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
    deps.recordPersonalImpact({
      kind: "SCOUT_REPORT",
      id: `scout-report:${active.commandId}`,
      playerId: active.playerId,
      occurredAt: nowMs,
      x: targetX,
      y: targetY,
      ...report,
      ...(blockedByPlayerId ? { blockedByPlayerId } : {})
    });
    send(active.playerId, `scout-drone-landed:${active.commandId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: null, report: { ...report, targetX, targetY } });
  };

  const advance = (active: ActiveFlight, nowMs: number): void => {
    const { flight } = active;
    const index = scoutDroneStepIndexAt(flight, nowMs);
    if (index > active.lastStepIndex) {
      const owner = deps.players().get(active.playerId);
      // Outbound steps passed since the last tick all count toward the report, even when a slow tick skipped them.
      for (let i = Math.max(0, active.lastStepIndex + 1); i <= Math.min(index, flight.turnIndex); i += 1) {
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
      const target = parseTarget(command.payloadJson);
      if (!actor || !target) return reject(command, "BAD_COMMAND", "invalid explore request");
      if (flights.has(actor.id)) return reject(command, "SCOUT_DRONE_BUSY", "your scout drone is already out");
      if (flights.size >= SCOUT_DRONE_MAX_ACTIVE_FLIGHTS) {
        capRefusals += 1;
        return reject(command, "SCOUT_DRONE_BUSY", "no scout drones can launch right now");
      }
      const normalized = { x: wrap(target.x, deps.worldWidth), y: wrap(target.y, deps.worldHeight) };
      const launch = nearestAfc(actor.id, normalized);
      if (!launch) return reject(command, "SCOUT_NO_AFC", "scout drones launch from your AFC");
      const now = deps.now();
      const flight = planScoutDroneFlight(launch, normalized, now, { width: deps.worldWidth, height: deps.worldHeight, classify: classifyFor(actor) });
      if (!flight) return reject(command, "SCOUT_NO_PATH", "a rival's border blocks the way out");
      const active: ActiveFlight = { playerId: actor.id, commandId: command.commandId, flight, lastStepIndex: -1, revealAt: undefined, findings: createScoutFindings(deps.tiles, deps.worldWidth, deps.worldHeight), alerted: false };
      flights.set(actor.id, active);
      advance(active, now);
      send(actor.id, command.commandId, { type: SCOUT_DRONE_MESSAGE_TYPE, flight });
      deps.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    },
    tick: (nowMs) => {
      for (const active of [...flights.values()]) advance(active, nowMs);
      for (const [key, at] of lastAlertAt) if (nowMs - at >= SCOUT_SIGHTED_ALERT_COOLDOWN_MS) lastAlertAt.delete(key);
    },
    sendTo: (playerId) => send(playerId, `scout-drone:${playerId}`, { type: SCOUT_DRONE_MESSAGE_TYPE, flight: flights.get(playerId)?.flight ?? null }),
    flightFor: (playerId) => flights.get(playerId)?.flight,
    gauge: () => ({ activeFlights: flights.size, alertCooldownEntries: lastAlertAt.size, capRefusals, cooldownEvictions })
  };
};
