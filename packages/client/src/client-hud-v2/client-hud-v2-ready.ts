// Whether the game itself is on screen, so the new HUD may draw. The sign-in
// overlay stays up after sign-in through the staged map build (mapPrep), and
// the season lobby / join screen and the first map load all sit where the
// HUD would be; drawing over them looks broken.

import type { ClientState } from "../client-state/client-state.js";

type ReadyState = Pick<
  ClientState,
  "authSessionReady" | "profileSetupRequired" | "mapPrep" | "authError" | "hasEverInitialized" | "firstChunkAt" | "seasonPending" | "needsSeasonJoin" | "joinSeasonOverlayOpen"
>;

export const hudV2GameOnScreen = (state: ReadyState, body: Pick<HTMLElement, "classList"> | undefined): boolean => {
  if (!state.authSessionReady || state.profileSetupRequired) return false;
  // Mirrors client-auth-ui.ts: the overlay stays up while the map is being prepared.
  if (state.mapPrep && !state.authError) return false;
  // First load only: a later reconnect keeps the HUD (the small reconnect card sits above the map).
  if (!state.hasEverInitialized || state.firstChunkAt === 0) return false;
  if (state.seasonPending || (state.needsSeasonJoin && state.joinSeasonOverlayOpen)) return false;
  if (body?.classList.contains("season-lobby-active")) return false;
  return true;
};
