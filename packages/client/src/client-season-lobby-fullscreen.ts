import type { ClientState } from "./client-state/client-state.js";

// The pending-season lobby is a full-screen page (see
// client-join-season-overlay.ts / client-season-lobby-style.css): the canvas
// is hidden behind it entirely, so client-runtime-loop.ts uses this to skip
// its per-frame tile/world work rather than doing it for a player who isn't
// in the game yet. Pulled into its own module (rather than inlined in the
// already-oversized client-runtime-loop.ts) so it's unit-testable without
// standing up the full draw() dependency graph.
export const isSeasonLobbyFullscreenActive = (
  state: Pick<ClientState, "needsSeasonJoin" | "joinSeasonOverlayOpen" | "seasonPending">
): boolean => state.needsSeasonJoin && state.joinSeasonOverlayOpen && state.seasonPending;
