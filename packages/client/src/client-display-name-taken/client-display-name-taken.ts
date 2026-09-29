import type { ClientState } from "../client-state/client-state.js";

// Applies a NAME_TAKEN rejection from SET_PROFILE. Mirrors the COLOR_TAKEN
// handling in client-network.ts, but leaves the colour picker alone: only the
// name was rejected, so resetting the picker would throw away the player's
// colour choice. Extracted because client-network.ts is over its line cap.
export const applyNameTakenError = (
  deps: {
    state: Pick<ClientState, "pendingDisplayNameChange" | "pendingColorChange">;
    setAuthStatus: (message: string, tone?: "normal" | "error") => void;
    syncAuthOverlay: () => void;
    pushFeed: (message: string, type: "error", tone: "error") => void;
  },
  msg: { message?: unknown; suggestion?: unknown }
): void => {
  const suggestion = typeof msg.suggestion === "string" && msg.suggestion ? msg.suggestion : undefined;
  const base = typeof msg.message === "string" && msg.message ? msg.message : "That name is already taken.";
  const fullMessage = `${base}${suggestion ? ` Try: ${suggestion}` : ""}`;
  deps.setAuthStatus(fullMessage, "error");
  deps.syncAuthOverlay();
  // A rename and a colour change ride on the same SET_PROFILE message, so a
  // name rejection means neither was persisted; say so where Settings shows it.
  if (deps.state.pendingDisplayNameChange) {
    deps.state.pendingDisplayNameChange = "";
    deps.pushFeed(`Display name not updated: ${fullMessage}`, "error", "error");
  }
  if (deps.state.pendingColorChange) {
    deps.state.pendingColorChange = "";
    deps.pushFeed(`Empire colour not updated: ${fullMessage}`, "error", "error");
  }
};
