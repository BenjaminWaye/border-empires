import { isFriendlyOwner, type HostileMusterAlertState } from "../client-hostile-muster-alerts/client-hostile-muster-alerts.js";
import { landingGroundKeys, type DockLandingState } from "./client-dock-landing-ground.js";

export type HostileLandingState = DockLandingState & HostileMusterAlertState;

/**
 * Where enemy troops could come ashore on the viewer's side: the landing
 * ground of every dock whose linked dock is held by a hostile player (not the
 * viewer, an ally or a live truce partner -- barbarians count), limited to
 * tiles the viewer owns or has in reach. Drawn always-on by both renderers so
 * a defender can see which stretches of coast to watch without selecting
 * anything. A neutral far dock is not a threat until someone takes it.
 * O(dock pairs x 9) per call.
 */
export const hostileLandingGroundKeys = (
  state: HostileLandingState,
  reach: ReadonlySet<string>,
  nowEpochMs: number
): Set<string> => {
  const keys = new Set<string>();
  if (!state.me) return keys;
  const hostileAt = (x: number, y: number): boolean => {
    const ownerId = state.tiles.get(`${x},${y}`)?.ownerId;
    return ownerId !== undefined && !isFriendlyOwner(state, ownerId, nowEpochMs);
  };
  const addCoast = (dockX: number, dockY: number): void => {
    for (const key of landingGroundKeys(state, dockX, dockY)) {
      if (state.tiles.get(key)?.ownerId === state.me || reach.has(key)) keys.add(key);
    }
  };
  for (const pair of state.dockPairs) {
    if (hostileAt(pair.bx, pair.by)) addCoast(pair.ax, pair.ay);
    if (hostileAt(pair.ax, pair.ay)) addCoast(pair.bx, pair.by);
  }
  return keys;
};
