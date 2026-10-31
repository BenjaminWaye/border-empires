/**
 * Encirclement — connectivity-based frontier decay.
 *
 * A frontier tile owned by player P is "connected" when there exists a path
 * through other frontier tiles owned by P that terminates at a settled tile
 * owned by P or at a frontier tile that carries a dock. Docks are persistent
 * world-gen features: owning the dock tile gives connectivity even before it
 * is settled. Connectivity uses 8-neighbors (diagonals count). The path may
 * NOT traverse another player's settled tiles.
 *
 * When a frontier tile loses connectivity it is "cut off" and loses ownership
 * **immediately**, on the same tick the encirclement is computed (see
 * applyEncirclement). Encirclement sets no timer: it once used a 60 s
 * `ENCIRCLEMENT_DECAY_MS` window, but the tick that expired those timers was
 * removed in PR #627 (a 9 s event-loop block), so the timer would never have
 * fired and the mechanic was made instant instead.
 *
 * `frontierDecayAt`/`frontierDecayKind` are therefore not written by this
 * module (nor by anything else since out-of-reach decay was removed -- see
 * runtime-reach-out-of-reach.ts). The reconnection paths here still *read*
 * `frontierDecayKind === "ENCIRCLEMENT"` so any such tile left over from an
 * older snapshot is cleaned up correctly.
 */

import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY, type FrontierDecayKind } from "@border-empires/shared";

/** 8-neighbor coordinate offsets. */
const NEIGHBOR_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -1, dy: -1 },
  { dx:  0, dy: -1 },
  { dx:  1, dy: -1 },
  { dx: -1, dy:  0 },
  { dx:  1, dy:  0 },
  { dx: -1, dy:  1 },
  { dx:  0, dy:  1 },
  { dx:  1, dy:  1 }
];

type ExtraNeighborKeys = (tileKey: string) => Iterable<string>;

const connectedNeighborKeys = (tileKey: string, extraNeighborKeys?: ExtraNeighborKeys): string[] => {
  const [xStr, yStr] = tileKey.split(",");
  const cx = Number(xStr);
  const cy = Number(yStr);
  const keys = NEIGHBOR_OFFSETS.map(({ dx, dy }) => {
    const nx = wrapX(cx + dx, WORLD_WIDTH);
    const ny = wrapY(cy + dy, WORLD_HEIGHT);
    return `${nx},${ny}`;
  });
  if (extraNeighborKeys) {
    for (const extraKey of extraNeighborKeys(tileKey)) keys.push(extraKey);
  }
  return keys;
};

/**
 * Allocation-free variant of connectedNeighborKeys for the hot component
 * flood: writes into `out` (cleared first) instead of building a new array.
 */
const writeNeighborKeys = (tileKey: string, out: string[], extraNeighborKeys?: ExtraNeighborKeys): void => {
  out.length = 0;
  const comma = tileKey.indexOf(",");
  const cx = Number(tileKey.slice(0, comma));
  const cy = Number(tileKey.slice(comma + 1));
  for (const { dx, dy } of NEIGHBOR_OFFSETS) out.push(`${wrapX(cx + dx, WORLD_WIDTH)},${wrapY(cy + dy, WORLD_HEIGHT)}`);
  if (extraNeighborKeys) {
    for (const extraKey of extraNeighborKeys(tileKey)) out.push(extraKey);
  }
};

/**
 * Minimal tile shape this module needs from the runtime tile map.
 * Runtime uses DomainTileState; pure functions here only require what they
 * read so they can be called from tests without the full type.
 */
export interface EncirclementTileView {
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  // Widened to the shared union because old snapshots can also carry the
  // legacy "OUT_OF_REACH" kind (cleared at boot). Encirclement only ever
  // reads/acts on "ENCIRCLEMENT".
  frontierDecayKind?: FrontierDecayKind | undefined;
  dockId?: string | undefined;
}

const isSupplyTerminal = (tile: EncirclementTileView): boolean =>
  tile.ownershipState === "SETTLED" || (tile.ownershipState === "FRONTIER" && Boolean(tile.dockId));

/**
 * Check whether a single frontier tile owned by `playerId` is connected to
 * any settled tile owned by `playerId` or to any frontier tile that carries
 * a dock, walking only through that player's own frontier tiles. (Settled
 * tiles and frontier dock tiles of the same player are valid path terminators
 * but NOT traversed further; other players' settled tiles block.)
 *
 * Returns true if connected, false if cut off.
 */
export const isFrontierConnected = (
  tileKey: string,
  playerId: string,
  getTile: (key: string) => EncirclementTileView | undefined,
  options?: { extraNeighborKeys?: ExtraNeighborKeys }
): boolean => {
  const tile = getTile(tileKey);
  if (!tile || tile.ownerId !== playerId || tile.ownershipState !== "FRONTIER") return false;

  if (tile.dockId) return true;

  const visited = new Set<string>();
  const queue: string[] = [tileKey];
  visited.add(tileKey);

  while (queue.length > 0) {
    // biome-ignore lint: queue.shift() is fine here; BFS over bounded territory
    const current = queue.shift()!;
    for (const nk of connectedNeighborKeys(current, options?.extraNeighborKeys)) {
      if (visited.has(nk)) continue;

      const neighbor = getTile(nk);
      if (!neighbor || neighbor.ownerId !== playerId) continue;

      if (isSupplyTerminal(neighbor)) {
        // Reached a friendly settled tile or a frontier dock — connected!
        return true;
      }

      if (neighbor.ownershipState === "FRONTIER") {
        visited.add(nk);
        queue.push(nk);
      }
      // Any other state (BARBARIAN, or another player's tile) — skip.
    }
  }

  return false;
};

/**
 * Per-component work cap for computeEncirclementDeltas (Option C): the number
 * of neighbour lookups one frontier component's flood may make (about eight
 * per flooded tile), the same unit the old whole-territory walk was bounded by.
 *
 * The flood only crosses the affected player's own FRONTIER tiles (settled
 * land is a supply terminal and is never traversed), so its cost tracks the
 * size of the frontier around the change, not the whole empire. A component
 * that exhausts the cap stops flooding: if it has already touched supply it
 * is classified supplied (correct, since supply is all that matters), and
 * otherwise it is left unclassified and reported through `onCapExceeded`.
 * Other components touched by the same change are still classified, each with
 * its own budget. A skipped component is not retried automatically; the
 * stranded-frontier region check (stranded-frontier-cleanup.ts) is the
 * backstop.
 */
export const ENCIRCLEMENT_BFS_CAP = 10_000;

type FrontierComponent = { keys: string[]; status: "supplied" | "unsupplied" | "unknown" };

/**
 * Given a set of tile keys that may have been affected by a recent ownership
 * change, compute two sets:
 *   - `cutOff`       — keys that are now disconnected
 *   - `reconnected`  — keys that had `frontierDecayAt` set (were cut off)
 *                      but are now connected again
 *
 * Only considers frontier tiles owned by `affectedPlayerId`.
 *
 * Implementation: a frontier tile's connectivity depends only on the frontier
 * component it sits in (8-neighbour connected through the player's own
 * FRONTIER tiles) and whether that component touches a supply terminal. A
 * change at tile X can therefore only affect the components containing X or
 * one of X's neighbours. We seed from those tiles, flood each component through
 * frontier tiles only, and classify the whole component at once.
 *
 * This used to walk every tile the player owned from the change (settled
 * included) and count unowned border tiles toward one shared cap, so any
 * empire of roughly 1,800+ connected tiles hit the 2,000 cap combat passes and
 * silently skipped encirclement.
 */
export const computeEncirclementDeltas = (
  changedKeys: Iterable<string>,
  affectedPlayerId: string,
  getTile: (key: string) => (EncirclementTileView & { frontierDecayAt?: number | undefined }) | undefined,
  nowMs: number,
  options?: {
    bfsCap?: number;
    /**
     * When true, skip cut-off detection — only detect reconnections.
     * Safe for EXPAND: adding a tile can never cut off the attacker's own territory.
     */
    skipCutOff?: boolean;
    extraNeighborKeys?: ExtraNeighborKeys;
    onCapExceeded?: (playerId: string, visitedCount: number, capLimit: number) => void;
  }
): { cutOff: Set<string>; reconnected: Set<string> } => {
  const bfsCap = options?.bfsCap ?? ENCIRCLEMENT_BFS_CAP;
  const cutOff = new Set<string>();
  const reconnected = new Set<string>();
  const isOwnFrontier = (tile: EncirclementTileView | undefined): boolean =>
    tile?.ownerId === affectedPlayerId && tile.ownershipState === "FRONTIER";

  // Seeds: every changed tile and its neighbours that is now one of the
  // player's frontier tiles. The changed tile itself is often no longer the
  // player's (a lost origin, a captured target), so its neighbours matter.
  const seeds: string[] = [];
  const seen = new Set<string>();
  for (const key of changedKeys) {
    for (const candidate of [key, ...connectedNeighborKeys(key, options?.extraNeighborKeys)]) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (isOwnFrontier(getTile(candidate))) seeds.push(candidate);
    }
  }

  // Flood each seed's frontier component. A flood only stops early at the
  // cap, so running into a tile an earlier flood already claimed means both
  // are the same component: inherit that component's verdict.
  const components: FrontierComponent[] = [];
  const componentOf = new Map<string, number>();
  const neighborKeys: string[] = [];
  for (const seed of seeds) {
    if (componentOf.has(seed)) continue;
    const index = components.length;
    const component: FrontierComponent = { keys: [seed], status: "unsupplied" };
    components.push(component);
    componentOf.set(seed, index);
    // Seeds were read as own FRONTIER above; a frontier dock is its own supply.
    let supplied = Boolean(getTile(seed)?.dockId);
    let joinsUnknown = false;
    let capped = false;
    let lookups = 0;
    const queue = [seed];
    for (let head = 0; head < queue.length && !capped; head += 1) {
      writeNeighborKeys(queue[head]!, neighborKeys, options?.extraNeighborKeys);
      lookups += neighborKeys.length;
      for (const nk of neighborKeys) {
        const earlier = componentOf.get(nk);
        if (earlier !== undefined) {
          if (earlier === index) continue;
          if (components[earlier]!.status === "supplied") supplied = true;
          else joinsUnknown = true;
          continue;
        }
        const neighbor = getTile(nk);
        if (neighbor?.ownerId !== affectedPlayerId) continue;
        if (neighbor.ownershipState === "FRONTIER") {
          componentOf.set(nk, index);
          component.keys.push(nk);
          queue.push(nk);
          if (neighbor.dockId) supplied = true;
        } else if (isSupplyTerminal(neighbor)) {
          supplied = true;
        }
      }
      if (bfsCap > 0 && lookups > bfsCap) capped = true;
    }
    if (supplied) component.status = "supplied";
    else if (capped || joinsUnknown) {
      component.status = "unknown";
      if (capped) options?.onCapExceeded?.(affectedPlayerId, lookups, bfsCap);
    }
  }

  for (const { keys, status } of components) {
    if (status === "unknown") continue;
    for (const key of keys) {
      if (status === "unsupplied") {
        if (!options?.skipCutOff) cutOff.add(key);
        continue;
      }
      const tile = getTile(key);
      // Was cut off by encirclement and is now reconnected. Natural decay
      // timers are not ours to clear.
      if (typeof tile?.frontierDecayAt === "number" && tile.frontierDecayKind === "ENCIRCLEMENT") reconnected.add(key);
    }
  }

  return { cutOff, reconnected };
};
