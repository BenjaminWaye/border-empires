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

const COMMAND_TO_DECISION_CLASS: Partial<Record<CommandEnvelope["type"], DecisionClass>> = {
  BUILD_FORT: "BUILD_DEFENSE",
  BUILD_SIEGE_OUTPOST: "BUILD_DEFENSE",
  BUILD_ECONOMIC_STRUCTURE: "BUILD_ECONOMY"
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
): Partial<Record<DecisionClass, boolean>> | undefined => {
  const playerCooldowns = state.get(playerId);
  if (!playerCooldowns || playerCooldowns.size === 0) return undefined;
  const result: Partial<Record<DecisionClass, boolean>> = {};
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
