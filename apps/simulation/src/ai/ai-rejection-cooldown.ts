/**
 * Tracks per-player, per-decision-class rejection cooldowns.
 *
 * When a build command (BUILD_FORT, BUILD_SIEGE_OUTPOST, BUILD_ECONOMIC_STRUCTURE)
 * is rejected by the runtime, the corresponding decision class is placed on
 * cooldown so the utility policy scores it 0 and WAIT or another class wins
 * instead.  This prevents the AI from burning planner cycles re-proposing the
 * same build every tick.
 *
 * UPGRADE_TOWN_TIER isn't a utility-policy DecisionClass (it's decided by the
 * preplan step, ai-preplan-command.ts, which runs before the utility policy
 * and short-circuits it entirely when it returns a command) but it needs the
 * exact same treatment: a rejection (e.g. INSUFFICIENT_SLOT — no free FOOD
 * slot for the upgrade) must not be re-proposed identically every tick. Without
 * a cooldown, chooseAiTownTierUpgrade picks the same tile every time (nothing
 * about eligibility changed), the preplan step keeps winning over tech/domain
 * choices, and the whole planner — not just the upgrade — livelocks on that
 * one player. "UPGRADE_TOWN_TIER" is folded into the same cooldown-tag space
 * as DecisionClass (not added to DECISION_CLASSES itself — it's never scored
 * by the utility policy) purely so it can ride the existing cooldown map.
 */

import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DecisionClass } from "./utility/decisions.js";

/** How long a rejected decision class stays on cooldown (ms). */
export const REJECTION_COOLDOWN_MS = 10_000;

/** Decision classes plus non-utility-policy commands that share the cooldown map. */
export type CooldownTag = DecisionClass | "UPGRADE_TOWN_TIER";

/** Shared shape for cooldown maps crossing worker/runtime boundaries. */
export type DecisionCooldownMap = Partial<Record<CooldownTag, boolean>>;

const COMMAND_TO_DECISION_CLASS: Partial<Record<CommandEnvelope["type"], CooldownTag>> = {
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
  ATTACK: "ATTACK",
  // Self-mapped tag (not a real DecisionClass) — see file header comment.
  UPGRADE_TOWN_TIER: "UPGRADE_TOWN_TIER"
};

export const decisionClassForCommand = (commandType: CommandEnvelope["type"]): CooldownTag | undefined =>
  COMMAND_TO_DECISION_CLASS[commandType];

export type RejectionCooldownState = Map<string, Map<CooldownTag, number>>;

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
