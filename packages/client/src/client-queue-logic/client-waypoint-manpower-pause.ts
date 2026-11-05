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
  waypoint: Pick<ClientWaypoint, "pausedForManpower">,
  firstStep: Pick<WaypointStep, "action" | "manpowerMin" | "target">,
  manpower: number,
  pushFeed: PushFeed,
  expandManpowerCost = 0
): boolean => {
  const needed = Math.max(firstStep.manpowerMin, expandManpowerCost);
  const short = firstStep.action === "EXPAND" && manpower < needed;
  if (short) {
    if (!waypoint.pausedForManpower) {
      pushFeed(
        `Waypoint paused at (${firstStep.target.x}, ${firstStep.target.y}) — needs ${needed} manpower, have ${manpower}. Resumes automatically once manpower regenerates.`,
        "info",
        "warn"
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
