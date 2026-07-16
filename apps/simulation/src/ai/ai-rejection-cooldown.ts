/**
 * Tracks per-player, per-decision-class rejection cooldowns.
 *
 * When a build command (BUILD_FORT, BUILD_SIEGE_OUTPOST, BUILD_ECONOMIC_STRUCTURE)
 * is rejected by the runtime, the corresponding decision class is placed on
 * cooldown so the utility policy scores it 0 and WAIT or another class wins
 * instead.  This prevents the AI from burning planner cycles re-proposing the
 * same build every tick.
 */

import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DecisionClass } from "./utility/decisions.js";

/** How long a rejected decision class stays on cooldown (ms). */
export const REJECTION_COOLDOWN_MS = 10_000;

/** Shared shape for cooldown maps crossing worker/runtime boundaries. */
export type DecisionCooldownMap = Partial<Record<DecisionClass, boolean>>;

const COMMAND_TO_DECISION_CLASS: Partial<Record<CommandEnvelope["type"], DecisionClass>> = {
  BUILD_FORT: "BUILD_DEFENSE",
  BUILD_SIEGE_OUTPOST: "BUILD_DEFENSE",
  BUILD_ECONOMIC_STRUCTURE: "BUILD_ECONOMY",
  // ATTACK was missing from this map, so a rejected ATTACK (e.g. ATTACK_COOLDOWN/
  // LOCKED while the previous attack from the same origin is still resolving —
  // COMBAT_LOCK_MS = 3000ms) never went on cooldown. The utility policy re-picks
  // ATTACK on the very next tick (250ms), re-submits the same doomed command, and
  // repeats until the lock clears — up to ~11 wasted rejected submissions per
  // successful attack. Observed as an 81% ATTACK rejection rate in production
  // (see docs/agents/topics/ai-planner.md).
  ATTACK: "ATTACK"
};

export const decisionClassForCommand = (commandType: CommandEnvelope["type"]): DecisionClass | undefined =>
  COMMAND_TO_DECISION_CLASS[commandType];

export type RejectionCooldownState = Map<string, Map<DecisionClass, number>>;

export const createRejectionCooldownState = (): RejectionCooldownState => new Map();

export const recordRejectionCooldown = (
  state: RejectionCooldownState,
  playerId: string,
  commandType: CommandEnvelope["type"],
  nowMs: number
): void => {
  const cls = decisionClassForCommand(commandType);
  if (!cls) return;
  let playerCooldowns = state.get(playerId);
  if (!playerCooldowns) {
    playerCooldowns = new Map();
    state.set(playerId, playerCooldowns);
  }
  playerCooldowns.set(cls, nowMs + REJECTION_COOLDOWN_MS);
};

export const activeCooldownsForPlayer = (
  state: RejectionCooldownState,
  playerId: string,
  nowMs: number
): DecisionCooldownMap | undefined => {
  const playerCooldowns = state.get(playerId);
  if (!playerCooldowns || playerCooldowns.size === 0) return undefined;
  const result: DecisionCooldownMap = {};
  let hasActive = false;
  for (const [cls, expiresAt] of playerCooldowns) {
    if (expiresAt > nowMs) {
      result[cls] = true;
      hasActive = true;
    } else {
      playerCooldowns.delete(cls);
    }
  }
  if (!hasActive) {
    state.delete(playerId);
    return undefined;
  }
  return result;
};
