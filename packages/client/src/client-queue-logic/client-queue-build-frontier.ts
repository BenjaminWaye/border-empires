import type { ClientState } from "../client-state/client-state.js";

// Split out of client-queue-logic.ts (over the repo's 500-line growth cap),
// which re-exports it so existing importers are unchanged.

export const buildFrontierQueue = (
  state: ClientState,
  candidates: string[],
  deps: {
    keyFor: (x: number, y: number) => string;
    parseKey: (key: string) => { x: number; y: number };
    wrapX: (x: number) => number;
    wrapY: (y: number) => number;
    enqueue: (x: number, y: number) => boolean;
    // Optional reachability check beyond "touches an owned/planned tile":
    // lets a target bordering a still-pending EXPAND (or reachable via a
    // linked dock / aether bridge) qualify, matching pickOriginForTarget.
    // It can be costly (dock lookups scan every tile), so it is only asked
    // once adjacency runs dry, and at most once per candidate.
    hasOrigin?: (x: number, y: number) => boolean;
  }
): { queued: number; skipped: number; queuedKeys: string[] } => {
  if (candidates.length === 0) return { queued: 0, skipped: 0, queuedKeys: [] };
  const owned = new Set<string>();
  for (const tile of state.tiles.values()) {
    if (tile.ownerId === state.me) owned.add(deps.keyFor(tile.x, tile.y));
  }
  const planned = new Set<string>();
  const remaining = new Set<string>(candidates);
  const originChecked = new Set<string>();
  let queued = 0;

  while (remaining.size > 0) {
    const frontier: string[] = [];
    for (const targetKey of remaining) {
      const { x, y } = deps.parseKey(targetKey);
      const neighbors = [
        deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1)),
        deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y)),
        deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1)),
        deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)),
        deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y - 1)),
        deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y - 1)),
        deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y + 1)),
        deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y + 1))
      ];
      if (neighbors.some((neighborKey) => owned.has(neighborKey) || planned.has(neighborKey))) frontier.push(targetKey);
    }
    if (frontier.length === 0 && deps.hasOrigin) {
      for (const targetKey of remaining) {
        if (originChecked.has(targetKey)) continue;
        originChecked.add(targetKey);
        const { x, y } = deps.parseKey(targetKey);
        if (deps.hasOrigin(x, y)) frontier.push(targetKey);
      }
    }
    if (frontier.length === 0) break;
    frontier.sort();
    for (const frontierKey of frontier) {
      const { x, y } = deps.parseKey(frontierKey);
      remaining.delete(frontierKey);
      if (deps.enqueue(x, y)) {
        planned.add(frontierKey);
        queued += 1;
      }
    }
  }

  return { queued, skipped: remaining.size, queuedKeys: [...planned] };
};
