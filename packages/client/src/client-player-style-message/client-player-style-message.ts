import type { ClientState } from "../client-state/client-state.js";
import type { EmpireVisualStyle } from "../client-types.js";
import { applyCosmeticsStateMessage, applyInitPlayerCosmetics, applyPlayerStyleCosmetics } from "../client-cosmetics/client-cosmetics.js";

export type ApplyPlayerStyleMessageDeps = {
  state: Pick<ClientState, "me" | "meName" | "playerNames" | "playerColors" | "playerVisualStyles" | "playerShieldUntil" | "playerCosmetics" | "ownedCosmetics" | "cosmeticsRequested">;
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
  applyPlayerStyleCosmetics(state, playerId, msg.cosmetics);
  if (playerId === state.me && msg.cosmetics !== undefined) affectsSelf = true;

  // Re-render immediately so the change is visible without waiting on a
  // later, unrelated PLAYER_UPDATE. Skipping the re-render here left the
  // HUD/settings panel showing a stale name until some other message
  // happened to trigger renderHud().
  //
  // This runs synchronously inside the WebSocket "message" event listener
  // (client-network.ts), which has no surrounding try/catch of its own. On
  // Safari, an uncaught throw here (e.g. a DOM/storage call inside
  // syncAuthOverlay or renderHud hitting a locked-down browser API) used to
  // propagate out of the message handler entirely and could crash the app
  // right after a routine profile save. Contain it here so a single
  // rendering hiccup degrades to a logged error instead of taking the whole
  // client down.
  if (affectsSelf) {
    try {
      syncAuthOverlay();
      renderHud();
    } catch (error) {
      console.error("[player-style-render-fatal]", error);
    }
  }
  return affectsSelf;
};

/**
 * Handles the messages that change how a player looks or what cosmetics this
 * account owns. Returns true when the message was one of them.
 */
export const applyPlayerAppearanceMessage = (msg: Record<string, unknown>, deps: ApplyPlayerStyleMessageDeps): boolean => {
  if (msg.type === "PLAYER_STYLE") {
    applyPlayerStyleMessage(msg, deps);
    return true;
  }
  if (msg.type !== "COSMETICS_STATE") return false;
  applyCosmeticsStateMessage(deps.state, msg);
  try {
    deps.renderHud();
  } catch (error) {
    console.error("[cosmetics-state-render-fatal]", error);
  }
  return true;
};

type InitStyle = { id: string; name?: string; tileColor?: string; visualStyle?: EmpireVisualStyle; shieldUntil?: number; duke?: boolean };

/** INIT: every other player's name, colour, style and cosmetics. Lifted out of client-network-init-message.ts unchanged. */
export const applyInitPlayerStyles = (
  state: Pick<ClientState, "playerNames" | "playerColors" | "playerVisualStyles" | "playerShieldUntil" | "dukePlayers" | "playerCosmetics">,
  msg: Record<string, unknown>
): void => {
  for (const style of ((msg.playerStyles as InitStyle[] | undefined) ?? [])) {
    if (style.name) state.playerNames.set(style.id, style.name);
    if (style.tileColor) state.playerColors.set(style.id, style.tileColor);
    if (style.visualStyle) state.playerVisualStyles.set(style.id, style.visualStyle);
    if (typeof style.shieldUntil === "number") state.playerShieldUntil.set(style.id, style.shieldUntil);
    if (style.duke) state.dukePlayers.add(style.id);
    else state.dukePlayers.delete(style.id);
  }
  applyInitPlayerCosmetics(state, msg.playerCosmetics);
};
