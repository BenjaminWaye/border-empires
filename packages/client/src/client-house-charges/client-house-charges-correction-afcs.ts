// A Writ of Correction's rival AFCs the player can see. The server sends only
// the charge's rough search circle, never the rival's landing site
// (house-charges-view.ts), so the dotted circle is the only guide until the
// player finds the AFC. Once one the rival founded is on explored ground
// inside that circle, the circle has done its job: both map renderers ring the
// AFC instead (owner report 2026-11-23). Bounded: the circle's square only
// (radius HOUSE_CHARGE_SEARCH_RADIUS, a few hundred tile lookups per frame).
import { afcFoundedBy, type HouseChargeView } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { correctionRivalId } from "./client-house-charges-live-names.js";

type Point = { x: number; y: number };

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/** Explored AFC tiles inside the Writ's search circle that its rival House founded; empty for any other charge. */
export const correctionRivalAfcsInView = (
  charge: HouseChargeView,
  tiles: ClientState["tiles"],
  worldWidth: number,
  worldHeight: number
): Point[] => {
  const rivalId = correctionRivalId(charge);
  if (!rivalId) return [];
  const { x, y, radius } = charge.searchCircle;
  const reach = Math.ceil(radius);
  const found: Point[] = [];
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const tileX = wrap(Math.round(x) + dx, worldWidth);
      const tileY = wrap(Math.round(y) + dy, worldHeight);
      const afc = tiles.get(`${tileX},${tileY}`)?.afc;
      if (afc && afcFoundedBy(afc) === rivalId) found.push({ x: tileX, y: tileY });
    }
  }
  return found;
};

/** Whether the Writ no longer needs its search circle: held, or a rival AFC is in view. */
export const correctionSearchDone = (charge: HouseChargeView, tiles: ClientState["tiles"], worldWidth: number, worldHeight: number): boolean =>
  charge.kind === "CORRECTION" && (charge.held || correctionRivalAfcsInView(charge, tiles, worldWidth, worldHeight).length > 0);
