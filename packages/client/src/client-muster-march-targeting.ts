import type { ClientState } from "./client-state/client-state.js";

type MarchTargetingDeps = {
  pushFeed: (msg: string, type?: string, severity?: string) => void;
  sendGameMessage: (payload: unknown) => boolean;
};

/** Arms march-target picking for the flag at (x, y): the next tile click sets its march target. */
export const armMusterMarchTargeting = (
  state: Pick<ClientState, "musterMarchTargeting">,
  x: number,
  y: number,
  deps: MarchTargetingDeps
): void => {
  state.musterMarchTargeting.active = true;
  state.musterMarchTargeting.originX = x;
  state.musterMarchTargeting.originY = y;
  deps.pushFeed("Select a tile to march toward.", "combat", "info");
};

/**
 * Consumes an armed march-target click: sends SET_MUSTER with the clicked
 * tile as the march target, or cancels back to HOLD if the click landed on
 * unexplored ground or the flag's own tile. Always disarms targeting.
 */
export const handleMusterMarchTargetClick = (
  state: Pick<ClientState, "musterMarchTargeting">,
  wx: number,
  wy: number,
  vis: "visible" | "fogged" | "unexplored",
  deps: MarchTargetingDeps
): void => {
  const { originX, originY } = state.musterMarchTargeting;
  state.musterMarchTargeting.active = false;
  if (vis !== "unexplored" && (wx !== originX || wy !== originY)) {
    deps.sendGameMessage({ type: "SET_MUSTER", x: originX, y: originY, mode: "MARCH", targetX: wx, targetY: wy });
  } else {
    deps.pushFeed("March target cancelled.", "combat", "info");
  }
};
