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

/**
 * How long an ATTACK stays on cooldown after an ATTACK_TARGET_INVALID
 * rejection specifically (ms) — see ATTACK_COOLDOWN_SKIPPED_REJECTION_CODES'
 * replacement, ATTACK_TARGET_INVALID_COOLDOWN_MS below, for why this is much
 * shorter than REJECTION_COOLDOWN_MS rather than zero.
 */
export const ATTACK_TARGET_INVALID_COOLDOWN_MS = 1_000;

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
  //
  // NOT every ATTACK rejection code should cool down the class, though — see
  // ATTACK_COOLDOWN_SKIPPED_REJECTION_CODES below for the ATTACK_TARGET_INVALID
  // exception.
  ATTACK: "ATTACK",
  // Self-mapped tag (not a real DecisionClass) — see file header comment.
  UPGRADE_TOWN_TIER: "UPGRADE_TOWN_TIER"
};

/**
 * BUILD_ECONOMIC_STRUCTURE is shared by two decision classes: a plain
 * economic structure (BUILD_ECONOMY) and a RELAY_BEACON (BUILD_BEACON —
 * reach infrastructure, deliberately its own class since decisions.ts's
 * scoreBuildBeacon doc comment; not folded into BUILD_ECONOMY). The command
 * TYPE alone can't tell them apart — only the payload's structureType can —
 * so a rejected beacon build was being cooled down as "BUILD_ECONOMY"
 * instead of "BUILD_BEACON", leaving BUILD_BEACON free to re-propose the
 * exact same doomed build every tick (the precise livelock class this file
 * exists to prevent — see the ATTACK-cooldown precedent in the comment
 * above). Parses the payload inline rather than importing a shared parser:
 * the shape here is only ever `{ x, y, structureType }`.
 */
const decisionClassForBuildEconomicStructure = (payloadJson: string): CooldownTag => {
  try {
    const payload = JSON.parse(payloadJson) as { structureType?: unknown };
    if (payload.structureType === "RELAY_BEACON") return "BUILD_BEACON";
  } catch {
    // Malformed payload: fall through to the default BUILD_ECONOMY tag —
    // matches the runtime's own rejection path (BAD_COMMAND), which the
    // caller already handles as a normal rejection needing a cooldown.
  }
  return "BUILD_ECONOMY";
};

export const decisionClassForCommand = (command: Pick<CommandEnvelope, "type" | "payloadJson">): CooldownTag | undefined =>
  command.type === "BUILD_ECONOMIC_STRUCTURE"
    ? decisionClassForBuildEconomicStructure(command.payloadJson)
    : COMMAND_TO_DECISION_CLASS[command.type];

/**
 * ATTACK rejection codes that use the shorter ATTACK_TARGET_INVALID_COOLDOWN_MS
 * instead of the full REJECTION_COOLDOWN_MS.
 *
 * ATTACK_TARGET_INVALID (validateFrontierCommand, game-domain/index.ts) means
 * the target tile's ownership changed between the planner picking it and the
 * command actually landing -- on a fast-moving barbarian frontier (tiles can
 * flip dozens of times a day) this is routine, not a sign the class is stuck.
 * Unlike LOCKED (the exact same command would fail again within
 * COMBAT_LOCK_MS regardless of what else changes -- the case this file's
 * ATTACK cooldown mapping exists for), the very next planner tick's fresh
 * frontier scan naturally picks a different, currently-valid target, so the
 * full 10s cooldown is unnecessarily long here.
 *
 * A PREVIOUS version of this file skipped the cooldown entirely for this
 * code (zero wait, immediate retry every ~250ms tick). That caused a
 * production incident (2026-09-14): on a contested/fast-flipping frontier,
 * many AI players could land ATTACK_TARGET_INVALID back-to-back every tick
 * with no throttle at all, driving a sustained spike in ATTACK submit/reject/
 * retarget cycles across the player population -- heavy enough to stack up
 * the simulation's synchronous rebuild phases (town_network_rebuild,
 * cached_economy_snapshot_rebuild, auto_settlement_queue_rebuild) and block
 * the event loop for multiple seconds at a time, tripping both the gateway's
 * simulation-ping timeout (stalling every player's login) and the process's
 * own event-loop-stall watchdog kill. See docs/agents/topics/ai-planner.md.
 *
 * ATTACK_TARGET_INVALID_COOLDOWN_MS=1s keeps the original fix's intent (an
 * AI stuck against a barbarian border isn't parked on WAIT for a full 10s
 * cooldown -- it retargets within ~4 ticks) while still bounding worst-case
 * retry rate under real player load, instead of zero throttle at all.
 *
 * Confirmed live (2026-09-14, pre-incident): production's ai-2 (Sigrid Storm)
 * was stuck at WAIT on 40/52 sampled ticks, every gate green (hasBarbTarget,
 * hasAnyAttackCandidate, attackReady, frontPosture: WAR, pressureAttackScore
 * 1300+) -- entirely explained by attackOnCooldown being true on every one of
 * those WAIT ticks (0 mismatches), driven by a self-sustaining
 * ATTACK_TARGET_INVALID -> cooldown -> stale-retarget -> ATTACK_TARGET_INVALID
 * loop against its barbarian border.
 */
const ATTACK_SHORT_COOLDOWN_REJECTION_CODES = new Set(["ATTACK_TARGET_INVALID"]);

export type RejectionCooldownState = Map<string, Map<CooldownTag, number>>;

export const createRejectionCooldownState = (): RejectionCooldownState => new Map();

export const recordRejectionCooldown = (
  state: RejectionCooldownState,
  playerId: string,
  command: Pick<CommandEnvelope, "type" | "payloadJson">,
  nowMs: number,
  rejectionCode?: string
): void => {
  const cls = decisionClassForCommand(command);
  if (!cls) return;
  const useShortCooldown =
    cls === "ATTACK" && rejectionCode !== undefined && ATTACK_SHORT_COOLDOWN_REJECTION_CODES.has(rejectionCode);
  let playerCooldowns = state.get(playerId);
  if (!playerCooldowns) {
    playerCooldowns = new Map();
    state.set(playerId, playerCooldowns);
  }
  playerCooldowns.set(cls, nowMs + (useShortCooldown ? ATTACK_TARGET_INVALID_COOLDOWN_MS : REJECTION_COOLDOWN_MS));
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
