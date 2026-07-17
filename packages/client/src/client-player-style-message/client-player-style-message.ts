import type { ClientState } from "../client-state/client-state.js";
import type { EmpireVisualStyle } from "../client-types.js";

export type ApplyPlayerStyleMessageDeps = {
  state: Pick<ClientState, "me" | "meName" | "playerNames" | "playerColors" | "playerVisualStyles" | "playerShieldUntil">;
  authProfileNameEl: { value: string };
  authProfileColorEl: { value: string };
  syncAuthOverlay: () => void;
  renderHud: () => void;
};

// Applies a PLAYER_STYLE message (broadcast to every connected player,
// including the sender, whenever a name/color/visual-style change is
// accepted). Returns true when the update was about the local player so
// callers/tests can assert on the resulting re-render.
export const applyPlayerStyleMessage = (msg: Record<string, unknown>, deps: ApplyPlayerStyleMessageDeps): boolean => {
  const { state, authProfileNameEl, authProfileColorEl, syncAuthOverlay, renderHud } = deps;
  const playerId = msg.playerId as string;
  const name = msg.name as string | undefined;
  const color = msg.tileColor as string | undefined;
  const visualStyle = msg.visualStyle as EmpireVisualStyle | undefined;
  const shieldUntil = msg.shieldUntil as number | undefined;
  let affectsSelf = false;

  if (playerId && name) {
    state.playerNames.set(playerId, name);
    if (playerId === state.me) {
      state.meName = name;
      authProfileNameEl.value = name;
      affectsSelf = true;
    }
  }
  if (playerId && color) {
    state.playerColors.set(playerId, color);
    if (playerId === state.me) {
      authProfileColorEl.value = color;
      affectsSelf = true;
    }
  }
  if (playerId && visualStyle) state.playerVisualStyles.set(playerId, visualStyle);
  if (playerId && typeof shieldUntil === "number") state.playerShieldUntil.set(playerId, shieldUntil);

  // Re-render immediately so the change is visible without waiting on a
  // later, unrelated PLAYER_UPDATE. Skipping the re-render here left the
  // HUD/settings panel showing a stale name until some other message
  // happened to trigger renderHud().
  if (affectsSelf) {
    syncAuthOverlay();
    renderHud();
  }
  return affectsSelf;
};
