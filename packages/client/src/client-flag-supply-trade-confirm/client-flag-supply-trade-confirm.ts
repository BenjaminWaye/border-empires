// Attacking a House ends every supply trade with it (runtime-frontier-command.ts).
// Launch Attack, March To and Set Advance all ask to confirm that first, with
// the same "End supply trades?" sheet, when the attack would hit a House the
// player trades with. March To knows its target tile; Advance picks its own
// targets, so it confirms when a trade partner holds land the flag can reach.
import { MUSTER_ADVANCE_RANGE_STEPS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { showBreakPactSheet, type BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import { supplyTradeAttackWarningsForTargets, type SupplyWarningState } from "../client-supply-trade-attack-warning/client-supply-trade-attack-warning.js";
import { landingGroundKeys, linkedDocksFrom } from "../client-dock-landing-ground/client-dock-landing-ground.js";
import type { ClientState } from "../client-state/client-state.js";

export type SupplyTradeSheet = (options: BreakPactSheetOptions) => boolean;

/**
 * Runs `proceed` straight away when `warning` is undefined; otherwise asks
 * first and runs it on confirm. Also proceeds when no sheet can be shown (no
 * DOM), so the action never silently does nothing.
 */
export const confirmSupplyTradeEnd = (
  warning: string | undefined,
  confirmLabel: string,
  proceed: () => void,
  show: SupplyTradeSheet = showBreakPactSheet
): void => {
  if (!warning) return proceed();
  const shown = show({
    title: "End supply trades?",
    subtitle: `${warning}.`,
    consequences: ["Supply in both directions stops at once.", "Coin already paid is not refunded."],
    confirmLabel,
    onConfirm: proceed
  });
  if (!shown) proceed();
};

type ReachState = Pick<ClientState, "tiles" | "me" | "allies" | "activeTruces" | "dockPairs">;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/**
 * Owners of the visible Houses an ADVANCE flag at (x, y) could attack: the
 * same step walk as the server's nearestHostileWithinSteps (muster-advance-
 * clear.ts) -- through own or neutral land (fogged too), up to
 * MUSTER_ADVANCE_RANGE_STEPS, never across water or another player's land,
 * with one of our docks reaching its linked docks' landing ground in one
 * step. Aether bridge links aren't known to the client and are not walked.
 * Only visible FRONTIER/SETTLED tiles count, and allies and truced Houses are
 * skipped, as the flag never attacks them.
 */
export const advanceReachOwnerIds = (state: ReachState, x: number, y: number, now = Date.now()): string[] => {
  const truced = new Set(state.activeTruces.filter((t) => t.endsAt > now).map((t) => t.otherPlayerId));
  const owners = new Set<string>();
  const visited = new Set<string>([`${x},${y}`]);
  let frontier: Array<{ x: number; y: number }> = [{ x, y }];
  const next: Array<{ x: number; y: number }> = [];
  const consider = (cx: number, cy: number): void => {
    const key = `${cx},${cy}`;
    if (visited.has(key)) return;
    visited.add(key);
    const tile = state.tiles.get(key);
    if (!tile || tile.terrain !== "LAND") return;
    if (!tile.ownerId || tile.ownerId === state.me) {
      next.push({ x: cx, y: cy });
      return;
    }
    if (tile.fogged || (tile.ownershipState !== "FRONTIER" && tile.ownershipState !== "SETTLED")) return;
    if (!state.allies.includes(tile.ownerId) && !truced.has(tile.ownerId)) owners.add(tile.ownerId);
  };
  for (let depth = 0; depth < MUSTER_ADVANCE_RANGE_STEPS && frontier.length > 0; depth += 1) {
    next.length = 0;
    for (const node of frontier) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx !== 0 || dy !== 0) consider(wrap(node.x + dx, WORLD_WIDTH), wrap(node.y + dy, WORLD_HEIGHT));
        }
      }
      if (state.tiles.get(`${node.x},${node.y}`)?.ownerId !== state.me) continue;
      for (const linked of linkedDocksFrom(state.dockPairs, node.x, node.y)) {
        for (const key of landingGroundKeys(state, linked.x, linked.y)) {
          const [lx, ly] = key.split(",").map(Number);
          if (lx !== undefined && ly !== undefined) consider(lx, ly);
        }
      }
    }
    frontier = [...next];
  }
  return [...owners];
};

/** The supply-trade warning for switching the flag at (x, y) to ADVANCE, or undefined when no trade partner is in reach. */
export const advanceSupplyTradeWarning = (state: ReachState & SupplyWarningState, x: number, y: number): string | undefined =>
  supplyTradeAttackWarningsForTargets(state, advanceReachOwnerIds(state, x, y));
