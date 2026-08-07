import { MUSTER_TRANSIT_MS_PER_TILE } from "../client-constants.js";
import type { ClientState } from "../client-state/client-state.js";

// A player's muster flags (staged manpower on an owned tile) each fund
// attacks independently on the server (see musterReservedByKey /
// resolveMusterSource in apps/simulation). This module mirrors that
// client-side by tracking transit/deferred-send state per flag tile key
// (`${x},${y}`) instead of a single global slot, so multiple flags can
// arm, march, and fire concurrently without stomping on each other.

export type MusterTransitEntry = {
  musterX: number;
  musterY: number;
  targetX: number;
  targetY: number;
  transitStartAt: number;
  transitEndsAt: number;
};

export type DeferredMusterAttack = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  commandId: string;
  clientSeq: number;
};

type MusterTransitMaps = Pick<ClientState, "musterTransitByTile" | "deferredAttackByTile">;

type ArmMusterTransitState = MusterTransitMaps &
  Pick<
    ClientState,
    "capture" | "actionInFlight" | "actionAcceptedAck" | "combatStartAck" | "actionAcceptTimeoutHandledAt" | "actionStartedAt" | "actionCurrent" | "actionTargetKey"
  >;

// Arm a new muster-fed attack: schedule its transit and remember the
// deferred send. Arming is purely local bookkeeping — nothing is sent to
// the server yet — so it must NOT hold the single actionInFlight lock.
// Doing so would block every other flag's transit (and the rest of the
// action queue) behind this one attack's multi-second march.
//
// Note: state.capture stays a single slot (out of scope for this per-flag
// conversion — see activeMusterSupplyLines for the real multi-flag overlay
// source of truth). Arming a second flag while an earlier one is still
// resolving overwrites capture.resolvesAt with the newer attack's timeline,
// which can delay (never break) the runtime loop's 5s combat-result-timeout
// safety net for the still-in-flight older attack — a rare fallback-for-a-
// fallback path that self-corrects once that attack's real result arrives.
export const armMusterTransit = (
  state: ArmMusterTransitState,
  keyFor: (x: number, y: number) => string,
  args: {
    musterX: number;
    musterY: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    transitTiles: number;
    commandId: string;
    clientSeq: number;
  }
): void => {
  const now = Date.now();
  const transitMs = args.transitTiles * MUSTER_TRANSIT_MS_PER_TILE;
  const flagKey = keyFor(args.musterX, args.musterY);
  state.musterTransitByTile.set(flagKey, {
    musterX: args.musterX,
    musterY: args.musterY,
    targetX: args.toX,
    targetY: args.toY,
    transitStartAt: now,
    transitEndsAt: now + transitMs
  });
  state.deferredAttackByTile.set(flagKey, {
    fromX: args.fromX,
    fromY: args.fromY,
    toX: args.toX,
    toY: args.toY,
    commandId: args.commandId,
    clientSeq: args.clientSeq
  });
  state.capture = {
    startAt: now + transitMs,
    resolvesAt: now + transitMs + 3_000,
    target: { x: args.toX, y: args.toY }
  };
  state.actionInFlight = false;
  state.actionAcceptedAck = false;
  state.combatStartAck = false;
  state.actionAcceptTimeoutHandledAt = 0;
  state.actionStartedAt = 0;
  state.actionCurrent = undefined;
  state.actionTargetKey = "";
};

type FireDueMusterTransitsState = MusterTransitMaps &
  Pick<ClientState, "actionInFlight" | "actionAcceptedAck" | "combatStartAck" | "actionAcceptTimeoutHandledAt" | "actionStartedAt" | "actionCurrent" | "actionTargetKey">;

// Once fired, a flag's entry is only meant to live in "locked" phase
// (musterTransitByTile without a matching deferredAttackByTile) until its
// combat result arrives, at which point clearMusterTransitForTarget removes
// it. But several other reset paths (accept-timeout, command rejection,
// reconnect/resync) reset actionInFlight/actionCurrent without knowing
// about these maps, so an unclean resolution can orphan a locked entry
// forever — permanently excluding that flag from findClosestMuster and
// leaving a stale overlay line. Every legitimate resolution/recovery path
// in this system completes within ~12s of the transit ending (see the
// frontierSyncWaitUntilByTarget/frontierLateAckUntilByTarget windows
// elsewhere); prune anything still locked well beyond that as a safety net.
const STALE_LOCKED_MUSTER_TRANSIT_MS = 30_000;

// Fire whichever flags' transit windows have elapsed. Only one frontier
// command can be awaiting a server ack at a time (state.actionInFlight is
// still a single slot for the actual send/ack/resolution cycle); any flag
// that's ready but finds the slot busy just stays parked and is retried on
// a later tick — it does not block other flags from continuing to count
// down independently in the meantime.
export const fireDueMusterTransits = (
  state: FireDueMusterTransitsState,
  deps: {
    keyFor: (x: number, y: number) => string;
    sendDeferredAttack: (fromX: number, fromY: number, toX: number, toY: number, commandId: string, clientSeq: number) => void;
    requestViewRefresh: () => void;
  }
): void => {
  const now = Date.now();
  for (const [flagKey, transit] of state.musterTransitByTile) {
    const deferred = state.deferredAttackByTile.get(flagKey);
    if (!deferred) {
      // Already fired — normally waiting on combat resolution, but prune it
      // if it's been orphaned well past every legitimate recovery window.
      if (now - transit.transitEndsAt > STALE_LOCKED_MUSTER_TRANSIT_MS) state.musterTransitByTile.delete(flagKey);
      continue;
    }
    if (now < transit.transitEndsAt) continue;
    if (state.actionInFlight) continue;
    state.deferredAttackByTile.delete(flagKey);
    state.actionInFlight = true;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionAcceptTimeoutHandledAt = 0;
    state.actionStartedAt = now;
    state.actionTargetKey = deps.keyFor(deferred.toX, deferred.toY);
    state.actionCurrent = { x: deferred.toX, y: deferred.toY, retries: 0, actionType: "ATTACK", commandId: deferred.commandId, clientSeq: deferred.clientSeq };
    deps.sendDeferredAttack(deferred.fromX, deferred.fromY, deferred.toX, deferred.toY, deferred.commandId, deferred.clientSeq);
    deps.requestViewRefresh();
    break;
  }
};

// Drop the tracked transit/deferred state for a specific resolved target
// (called once the server's combat result for that attack arrives). Other
// flags' still-active entries are untouched.
export const clearMusterTransitForTarget = (state: MusterTransitMaps, targetX: number, targetY: number): void => {
  for (const [flagKey, transit] of state.musterTransitByTile) {
    if (transit.targetX !== targetX || transit.targetY !== targetY) continue;
    state.musterTransitByTile.delete(flagKey);
    state.deferredAttackByTile.delete(flagKey);
  }
};

// Cancel every muster-fed attack that hasn't been sent to the server yet
// (still marching). Returns true if anything was cancelled. Flags that
// already fired (awaiting resolution) aren't touched here — those are real
// server-side locks, cancelled via the CANCEL_CAPTURE message instead.
export const cancelUnsentMusterTransits = (state: MusterTransitMaps): boolean => {
  let hadAny = false;
  for (const flagKey of state.deferredAttackByTile.keys()) {
    state.musterTransitByTile.delete(flagKey);
    state.deferredAttackByTile.delete(flagKey);
    hadAny = true;
  }
  return hadAny;
};

export type MusterSupplyLine = {
  musterX: number;
  musterY: number;
  targetX: number;
  targetY: number;
  targetKey: string;
  phase: "transit" | "locked";
};

// All currently-active muster-fed supply lines, independent of the single
// `state.capture` slot — one flag "marching" doesn't hide another flag's
// line, and firing one doesn't cancel another's overlay.
export const activeMusterSupplyLines = (state: MusterTransitMaps, keyFor: (x: number, y: number) => string): MusterSupplyLine[] => {
  const lines: MusterSupplyLine[] = [];
  for (const [flagKey, transit] of state.musterTransitByTile) {
    lines.push({
      musterX: transit.musterX,
      musterY: transit.musterY,
      targetX: transit.targetX,
      targetY: transit.targetY,
      targetKey: keyFor(transit.targetX, transit.targetY),
      phase: state.deferredAttackByTile.has(flagKey) ? "transit" : "locked"
    });
  }
  return lines;
};

export type AdvanceMusterFallbackCache = { targetKey: string; result: { x: number; y: number } | undefined } | undefined;

// ADVANCE-mode attacks are fired autonomously by the server and never go
// through armMusterTransit, so they aren't covered by musterTransitByTile.
// Overlay code falls back to scanning for the nearest owned ADVANCE flag
// for the single tracked `state.capture` target. Shared (with a
// caller-owned cache slot) between the 2D and 3D overlay renderers.
export const resolveAdvanceMusterFallbackSource = (
  state: Pick<ClientState, "tiles" | "me">,
  targetKey: string,
  target: { x: number; y: number },
  cache: AdvanceMusterFallbackCache
): { cache: AdvanceMusterFallbackCache; result: { x: number; y: number } | undefined } => {
  if (cache?.targetKey === targetKey) return { cache, result: cache.result };
  let bestTile: { x: number; y: number } | undefined;
  let bestDist = Infinity;
  for (const tile of state.tiles.values()) {
    if (!tile.muster || tile.muster.ownerId !== state.me || tile.muster.mode !== "ADVANCE") continue;
    const d = Math.max(Math.abs(tile.x - target.x), Math.abs(tile.y - target.y));
    if (d < bestDist) {
      bestDist = d;
      bestTile = { x: tile.x, y: tile.y };
    }
  }
  return { cache: { targetKey, result: bestTile }, result: bestTile };
};
