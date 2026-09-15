import type { ClientState } from "../client-state/client-state.js";

export type ApplyPlayerUpdateNameChangeDeps = {
  state: Pick<ClientState, "meName" | "pendingDisplayNameChange">;
  authProfileNameEl: { value: string };
  pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
};

// Extracted from client-network.ts's PLAYER_UPDATE handler (which is at the
// 500-line file cap) purely to keep that file's growth budget available for
// new state fields -- no behavior change. A PLAYER_UPDATE carrying our own
// (possibly server-normalized) name: sync local state/the auth form, and if
// it matches a display-name change we're waiting to see confirmed, clear the
// pending flag and let the player know.
export const applyPlayerUpdateNameChange = (name: string, deps: ApplyPlayerUpdateNameChangeDeps): void => {
  const { state, authProfileNameEl, pushFeed } = deps;
  state.meName = name;
  authProfileNameEl.value = name;
  if (state.pendingDisplayNameChange && state.pendingDisplayNameChange === name) {
    state.pendingDisplayNameChange = "";
    pushFeed("Display name updated.", "info", "success");
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(`Your display name is now "${name}".`);
    }
  }
};
