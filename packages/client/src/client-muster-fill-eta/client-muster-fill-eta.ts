// The Launch Attack sheet's fill-time line. An attack the pool can't fund from a
// ready flag waits on a muster flag filling from the pool, and that flag (and
// what it holds) can be taken while it fills (muster-capture), which nothing
// said (owner request 2026-11-27): "Flag fills in ~6m · can be attacked while
// filling".
//
// The time comes from the refill rate in force now: the reused flag's
// server-reported `ratePerMin`, or for a new flag its share of
// MUSTER_BASE_RATE_PER_MIN once it joins the others (runtime-muster-tick.ts
// splits that rate evenly across flags). Depot speed-ups on a flag that does
// not exist yet are not known, so a new flag's time can run long; "~" says so.

import { MUSTER_BASE_RATE_PER_MIN } from "@border-empires/shared";
import { findClosestOwnedMusterTile, findFundedMusterWithinRange } from "../client-muster-attack-gate/client-muster-attack-gate.js";
import { musterAvailableAt } from "../client-muster-transit/client-muster-transit.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

export const FILL_WHILE_ATTACKABLE = "can be attacked while filling";

/** "<1m", "6m", "1h 5m". */
export const fillDurationText = (ms: number): string => {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const rest = minutes % 60;
  return rest > 0 ? `${Math.floor(minutes / 60)}h ${rest}m` : `${Math.floor(minutes / 60)}h`;
};

/**
 * Time for a flag to gain `shortfall` at `ratePerMin` from a pool of `pool`.
 * 0 when nothing is missing; undefined when the pool can't cover it now (the
 * flag then waits for a refill) or nothing flows.
 */
export const musterFillEtaMs = (shortfall: number, ratePerMin: number, pool: number): number | undefined => {
  if (shortfall <= 0) return 0;
  if (!(ratePerMin > 0) || pool < shortfall) return undefined;
  return (shortfall / ratePerMin) * 60_000;
};

/** The sheet line for a flag short by `shortfall`; "" when it is already full enough. */
export const musterFillNote = (shortfall: number, ratePerMin: number, pool: number): string => {
  if (shortfall <= 0) return "";
  const eta = musterFillEtaMs(shortfall, ratePerMin, pool);
  return eta === undefined
    ? `Flag waits for manpower · ${FILL_WHILE_ATTACKABLE}`
    : `Flag fills in ~${fillDurationText(eta)} · ${FILL_WHILE_ATTACKABLE}`;
};

type FillState = Pick<ClientState, "tiles" | "me" | "manpower" | "musterTransitByCommand" | "dockPairs">;

/**
 * The fill line for attacking `target` from `origin` with `commitManpower`:
 * "" when a ready flag already funds it, otherwise the time for the flag the
 * attack would use (a nearby one, else a new one) to reach the commitment.
 */
export const attackFlagFillNote = (state: FillState, origin: Tile | undefined, target: Tile, commitManpower: number): string => {
  if (!origin) return "";
  if (findFundedMusterWithinRange(state, origin.x, origin.y, commitManpower)) return "";
  let flagCount = 0;
  for (const tile of state.tiles.values()) if (tile.muster?.ownerId === state.me) flagCount += 1;
  const reused = findClosestOwnedMusterTile(state, origin.x, origin.y, target.x, target.y)?.tile;
  if (reused?.muster) {
    const rate = reused.muster.ratePerMin ?? MUSTER_BASE_RATE_PER_MIN / Math.max(1, flagCount);
    return musterFillNote(commitManpower - musterAvailableAt(state, reused), rate, state.manpower);
  }
  return musterFillNote(commitManpower, MUSTER_BASE_RATE_PER_MIN / (flagCount + 1), state.manpower);
};
