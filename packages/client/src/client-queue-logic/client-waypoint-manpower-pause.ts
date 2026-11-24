import type { WaypointStep } from "@border-empires/shared";
import type { ClientWaypoint } from "../client-state/client-state.js";

type PushFeed = (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;

/**
 * EXPAND steps are gated on the raw manpower pool (mirrors processActionQueue's
 * own check) — unlike ATTACK, which draws from a muster flag's banked total
 * and already has its own stall handling (pendingMusterAttacks /
 * dropStuckPendingMusterAttack in client-muster-attack-gate.ts). Without
 * this, an EXPAND leg that outruns manpower gets enqueued anyway, rejected
 * downstream by processActionQueue, and topUpFromWaypoint's "same step
 * re-emitted" guard treats that as a stuck path — halting the whole waypoint
 * after a few ticks with a misleading "halted"/impassable-sounding message,
 * instead of just waiting for manpower to regenerate.
 *
 * `expandManpowerCost` is the live frontier-scaled EXPAND price: a step's
 * `manpowerMin` was fixed when the route was planned, and the price can step
 * up as the route's own claims grow the frontier, so the gate uses whichever
 * is higher (the same live price processActionQueue checks).
 *
 * Mutates `waypoint.pausedForManpower` and pushes a feed message only on the
 * transition into/out of the paused state (never every tick, so it can't
 * spam). Returns true when the waypoint should stay parked this tick (the
 * caller should enqueue nothing and return).
 */
export const pauseWaypointForManpowerIfNeeded = (
  waypoint: Pick<ClientWaypoint, "pausedForManpower" | "attacksConfirmed" | "pausedForAttack" | "trackBarbarian">,
  firstStep: Pick<WaypointStep, "action" | "manpowerMin" | "target">,
  manpower: number,
  pushFeed: PushFeed,
  expandManpowerCost = 0
): boolean => {
  if (pauseWaypointForUnapprovedAttack(waypoint, firstStep, pushFeed)) return true;
  const needed = Math.max(firstStep.manpowerMin, expandManpowerCost);
  const short = firstStep.action === "EXPAND" && manpower < needed;
  if (short) {
    if (!waypoint.pausedForManpower) {
      pushFeed(
        `Waypoint paused at (${firstStep.target.x}, ${firstStep.target.y}) — needs ${needed} manpower, have ${manpower}. Resumes automatically once manpower regenerates.`,
        "info",
        "info" // shown by the waypoint_manpower_paused persistent alert
      );
    }
    waypoint.pausedForManpower = true;
    return true;
  }
  if (waypoint.pausedForManpower) {
    waypoint.pausedForManpower = false;
    pushFeed("Waypoint resumed — manpower available.", "info", "success");
  }
  return false;
};

/**
 * Expand To asks before it attacks (Playtest Run 4 follow-up, client-waypoint-attack-confirm.ts), but the route is
 * re-planned every step: a barbarian or rival moving onto the path turns a leg into an ATTACK, and the attack queue
 * would raise a muster flag for it. Unless the player approved attacks on this route (or it chases a barbarian by
 * design), park the waypoint instead, telling the player once; it resumes when the path is clear again.
 */
const pauseWaypointForUnapprovedAttack = (
  waypoint: Pick<ClientWaypoint, "attacksConfirmed" | "pausedForAttack" | "trackBarbarian">,
  firstStep: Pick<WaypointStep, "action" | "target">,
  pushFeed: PushFeed
): boolean => {
  const blocked = firstStep.action === "ATTACK" && !waypoint.attacksConfirmed && !waypoint.trackBarbarian;
  if (blocked && !waypoint.pausedForAttack) {
    pushFeed(`Waypoint waiting at (${firstStep.target.x}, ${firstStep.target.y}): the way there now needs an attack. Cancel it, or Expand To again to approve.`, "combat", "warn");
  }
  if (blocked) waypoint.pausedForAttack = true;
  else if (waypoint.pausedForAttack) waypoint.pausedForAttack = false;
  return blocked;
};
