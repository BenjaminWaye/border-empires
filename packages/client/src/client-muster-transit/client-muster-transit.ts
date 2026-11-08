import { attackSyncLog } from "../client-debug/client-debug.js";
import { MUSTER_TRANSIT_MS_PER_TILE } from "../client-constants.js";
import type { ClientState } from "../client-state/client-state.js";

// A player's muster flags (staged manpower on an owned tile) fund attacks on
// the server through a per-flag reservation (musterReservedByKey /
// resolveMusterSource in apps/simulation): a flag can back several attacks at
// once as long as its staged amount covers every reservation. This module
// mirrors that client-side by tracking transit/deferred-send state per
// attack (keyed by the attack's commandId) instead of per flag, so one flag
// can send several companies and many flags can arm, march and fire
// concurrently. musterReservedAt sums what a flag has already committed.

export type MusterTransitEntry = {
  musterX: number;
  musterY: number;
  // Where the flag's company physically marches to and the transit timer is
  // budgeted for — the firing tile (may equal musterX/Y when the flag itself
  // is adjacent/dock-linked to the target and fires directly, or a separate
  // border origin the flag funds remotely). NOT necessarily the same tile as
  // targetX/Y: a remotely-funded attack's real distance is flag-to-firing-
  // tile, since the firing tile is already adjacent to the target (the
  // ATTACK itself needs no further travel once the company arrives there).
  // Overlay code (marching dots, supply line) must walk/draw to this point,
  // not straight to targetX/Y, or the visualized march covers a completely
  // different (and differently-timed) distance than what transitEndsAt was
  // actually budgeted for.
  marchToX: number;
  marchToY: number;
  // The attack's real target — kept separate from marchToX/Y purely as the
  // stable key clearMusterTransitForTarget matches the server's eventual
  // combat result against; never used for path/distance math.
  targetX: number;
  targetY: number;
  transitStartAt: number;
  transitEndsAt: number;
  /** Manpower this attack reserved on its flag (released on the attack's result). */
  manpower: number;
  /** Server combat-lock resolution time, stamped once the attack is locked. */
  resolvesAt?: number;
};

export type DeferredMusterAttack = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  commandId: string;
  clientSeq: number;
};

type MusterTransitMaps = Pick<ClientState, "musterTransitByCommand" | "deferredAttackByCommand">;

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
  args: {
    musterX: number;
    musterY: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    transitTiles: number;
    manpower: number;
    commandId: string;
    clientSeq: number;
  }
): void => {
  const now = Date.now();
  const transitMs = args.transitTiles * MUSTER_TRANSIT_MS_PER_TILE;
  attackSyncLog("muster-transit-armed", { commandId: args.commandId, clientSeq: args.clientSeq, transitMs, transitEndsAt: now + transitMs, target: { x: args.toX, y: args.toY } });
  state.musterTransitByCommand.set(args.commandId, {
    musterX: args.musterX,
    musterY: args.musterY,
    marchToX: args.fromX,
    marchToY: args.fromY,
    targetX: args.toX,
    targetY: args.toY,
    transitStartAt: now,
    transitEndsAt: now + transitMs,
    manpower: args.manpower
  });
  state.deferredAttackByCommand.set(args.commandId, {
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
// (musterTransitByCommand without a matching deferredAttackByCommand) until its
// combat result arrives, at which point clearMusterTransitForTarget removes
// it. But several other reset paths (accept-timeout, command rejection,
// reconnect/resync) reset actionInFlight/actionCurrent without knowing
// about these maps, so an unclean resolution can orphan a locked entry
// forever — permanently holding that flag's manpower reserved (see
// musterReservedAt) and leaving a stale overlay line. Every legitimate resolution/recovery path
// in this system completes within ~12s of the transit ending (see the
// frontierSyncWaitUntilByTarget/frontierLateAckUntilByTarget windows
// elsewhere) and its combat lock resolving (resolvesAt, stamped when the
// server locks it); prune anything still locked well beyond that.
const STALE_LOCKED_MUSTER_TRANSIT_MS = 30_000;

// Fire whichever attacks' transit windows have elapsed. Only one frontier
// command can be awaiting a server ack at a time (state.actionInFlight), but
// that slot is released as soon as the server locks an ATTACK (COMBAT_START,
// see client-detached-attacks.ts), so several attacks can be resolving at
// once. Anything ready while the slot is busy stays parked and is retried on
// a later tick, without blocking other marches from counting down.
export const fireDueMusterTransits = (
  state: FireDueMusterTransitsState,
  deps: {
    keyFor: (x: number, y: number) => string;
    sendDeferredAttack: (fromX: number, fromY: number, toX: number, toY: number, commandId: string, clientSeq: number) => void;
    requestViewRefresh: () => void;
  }
): void => {
  const now = Date.now();
  for (const [attackKey, transit] of state.musterTransitByCommand) {
    const deferred = state.deferredAttackByCommand.get(attackKey);
    if (!deferred) {
      // Already fired — normally waiting on combat resolution, but prune it
      // if it's been orphaned well past every legitimate recovery window.
      const settlesBy = Math.max(transit.transitEndsAt, transit.resolvesAt ?? 0);
      if (now - settlesBy > STALE_LOCKED_MUSTER_TRANSIT_MS) state.musterTransitByCommand.delete(attackKey);
      continue;
    }
    if (now < transit.transitEndsAt) continue;
    if (state.actionInFlight) continue;
    state.deferredAttackByCommand.delete(attackKey);
    state.actionInFlight = true;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionAcceptTimeoutHandledAt = 0;
    state.actionStartedAt = now;
    state.actionTargetKey = deps.keyFor(deferred.toX, deferred.toY);
    state.actionCurrent = { x: deferred.toX, y: deferred.toY, retries: 0, actionType: "ATTACK", commandId: deferred.commandId, clientSeq: deferred.clientSeq };
    attackSyncLog("muster-transit-ready", { commandId: deferred.commandId, clientSeq: deferred.clientSeq, transitEndsAt: transit.transitEndsAt, timerLateByMs: now - transit.transitEndsAt });
    deps.sendDeferredAttack(deferred.fromX, deferred.fromY, deferred.toX, deferred.toY, deferred.commandId, deferred.clientSeq);
    deps.requestViewRefresh();
    break;
  }
};

// Manpower already committed from the flag at (x, y) by this client's own
// attacks that haven't resolved yet. The server keeps the flag's staged
// amount untouched until resolution and only reserves against it, so the
// client subtracts these itself to know how much the flag can still fund.
export const musterReservedAt = (state: Pick<ClientState, "musterTransitByCommand">, x: number, y: number): number => {
  let reserved = 0;
  for (const transit of state.musterTransitByCommand.values()) {
    if (transit.musterX === x && transit.musterY === y) reserved += transit.manpower;
  }
  return reserved;
};

/** Staged manpower on a flag tile that no unresolved attack has claimed yet. */
export const musterAvailableAt = (state: Pick<ClientState, "musterTransitByCommand">, tile: { x: number; y: number; muster?: { amount: number } }): number =>
  Math.max(0, (tile.muster?.amount ?? 0) - musterReservedAt(state, tile.x, tile.y));

// Record when the server will resolve a locked attack, so the stale-entry
// prune above keeps its reservation alive for the whole combat lock.
export const stampMusterTransitResolvesAt = (state: Pick<ClientState, "musterTransitByCommand">, commandId: string, resolvesAt: number): void => {
  const transit = state.musterTransitByCommand.get(commandId);
  if (transit) transit.resolvesAt = resolvesAt;
};

// Drop one finished or rejected attack's march and reservation. Matching by
// commandId keeps a second attack on the same tile (still marching, or
// refused because the tile is locked) from taking the first one's
// reservation with it; the target is only a fallback for a message that
// carries no commandId we know.
export const clearMusterTransitForAttack = (
  state: MusterTransitMaps,
  commandId: unknown,
  target: { x: number; y: number } | undefined
): void => {
  if (typeof commandId === "string" && state.musterTransitByCommand.has(commandId)) {
    state.musterTransitByCommand.delete(commandId);
    state.deferredAttackByCommand.delete(commandId);
    return;
  }
  if (target) clearMusterTransitForTarget(state, target.x, target.y);
};

// Drop the tracked transit/deferred state for a specific resolved target
// (called once the server's combat result for that attack arrives). Other
// flags' still-active entries are untouched.
export const clearMusterTransitForTarget = (state: MusterTransitMaps, targetX: number, targetY: number): void => {
  for (const [attackKey, transit] of state.musterTransitByCommand) {
    if (transit.targetX !== targetX || transit.targetY !== targetY) continue;
    state.musterTransitByCommand.delete(attackKey);
    state.deferredAttackByCommand.delete(attackKey);
  }
};

// Cancel every muster-fed attack that hasn't been sent to the server yet
// (still marching). Returns true if anything was cancelled. Flags that
// already fired (awaiting resolution) aren't touched here — those are real
// server-side locks, cancelled via the CANCEL_CAPTURE message instead.
export const cancelUnsentMusterTransits = (state: MusterTransitMaps): boolean => {
  let hadAny = false;
  for (const attackKey of state.deferredAttackByCommand.keys()) {
    state.musterTransitByCommand.delete(attackKey);
    state.deferredAttackByCommand.delete(attackKey);
    hadAny = true;
  }
  return hadAny;
};

export type MusterSupplyLine = {
  musterX: number;
  musterY: number;
  // Where the line is actually drawn to — the flag's march destination
  // (marchToX/Y), NOT necessarily the attack's real target; see
  // MusterTransitEntry.marchToX's comment for why those can differ.
  targetX: number;
  targetY: number;
  // Keyed by the real attack target regardless of where the line is drawn,
  // so drawMusterSupplyLines2D's "is this target already covered by a supply
  // line" check still matches against the tile actually being attacked.
  targetKey: string;
  phase: "transit" | "locked";
};

// All currently-active muster-fed supply lines, independent of the single
// `state.capture` slot — one flag "marching" doesn't hide another flag's
// line, and firing one doesn't cancel another's overlay.
export const activeMusterSupplyLines = (state: MusterTransitMaps, keyFor: (x: number, y: number) => string): MusterSupplyLine[] => {
  const lines: MusterSupplyLine[] = [];
  for (const [attackKey, transit] of state.musterTransitByCommand) {
    lines.push({
      musterX: transit.musterX,
      musterY: transit.musterY,
      targetX: transit.marchToX,
      targetY: transit.marchToY,
      targetKey: keyFor(transit.targetX, transit.targetY),
      phase: state.deferredAttackByCommand.has(attackKey) ? "transit" : "locked"
    });
  }
  return lines;
};

type OutgoingMusterAttackMaps = Pick<ClientState, "outgoingMusterAttacksByTile">;

// ADVANCE/MARCH auto-fire's own mechanical travel-time delay (see
// runtime-frontier-command.ts) is carried on state.outgoingMusterAttacksByTile
// itself (transitEndsAt/musterOriginX/musterOriginY), independent of both
// musterTransitByCommand (only ever populated for this client's own manually-
// armed attacks) and state.capture (deliberately never set for these
// server-fired fights -- see handleMusterAdvanceCombatStart -- so it can't
// be relied on as a supply-line source either). Lets the 2D map's
// "still marching to the front" supply line cover auto-fire the same way the
// 3D marching-company mesh (syncMusterTransitOverlay) does.
export const outgoingMusterAttackTransitLines = (
  state: OutgoingMusterAttackMaps,
  nowEpochMs: number,
  coveredTargetKeys: ReadonlySet<string>
): MusterSupplyLine[] => {
  const lines: MusterSupplyLine[] = [];
  for (const [targetKey, outgoing] of state.outgoingMusterAttacksByTile) {
    if (coveredTargetKeys.has(targetKey)) continue;
    if (outgoing.transitEndsAt === undefined || outgoing.musterOriginX === undefined || outgoing.musterOriginY === undefined) continue;
    if (nowEpochMs >= outgoing.transitEndsAt) continue;
    lines.push({
      musterX: outgoing.musterOriginX,
      musterY: outgoing.musterOriginY,
      targetX: outgoing.originX,
      targetY: outgoing.originY,
      targetKey,
      phase: "transit"
    });
  }
  return lines;
};

export type AdvanceMusterFallbackCache = { targetKey: string; result: { x: number; y: number } | undefined } | undefined;

// ADVANCE-mode attacks are fired autonomously by the server and never go
// through armMusterTransit, so they aren't covered by musterTransitByCommand.
// Overlay code falls back to scanning for the nearest owned ADVANCE flag
// for the single tracked `state.capture` target. Takes a
// caller-owned cache slot (the 2D supply-line overlay's).
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
