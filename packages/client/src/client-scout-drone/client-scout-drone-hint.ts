// Where the "tap here" beacon sits (client-map-3d-scout-drone-plan-overlay.ts): the nearest
// unexplored tile a few tiles out from the player's first active AFC, so a new player sees
// that the fog is something to tap. Cached until the explored map or the AFCs change.
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { ownActiveAfcs } from "./client-scout-drone-plan.js";

type Point = { x: number; y: number };

const MIN_RING = 4;
const MAX_RING = 18;

let cache: { key: string; tile: Point | undefined } | undefined;

export const scoutHintTile = (state: Pick<ClientState, "tiles" | "me" | "tilesRevision" | "discoveredTiles">): Point | undefined => {
  const afc = ownActiveAfcs(state)[0];
  if (!afc) return undefined;
  const key = `${afc.x},${afc.y}|${state.discoveredTiles.size}`;
  if (cache?.key === key) return cache.tile;
  let tile: Point | undefined;
  for (let r = MIN_RING; r <= MAX_RING && !tile; r += 1) {
    // Walk the ring from its top edge, clockwise.
    for (let i = -r; i <= r && !tile; i += 1) {
      for (const [dx, dy] of [[i, -r], [r, i], [-i, r], [-r, -i]] as const) {
        const x = (((afc.x + dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
        const y = (((afc.y + dy) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
        if (!state.discoveredTiles.has(`${x},${y}`)) {
          tile = { x, y };
          break;
        }
      }
    }
  }
  cache = { key, tile };
  return tile;
};
