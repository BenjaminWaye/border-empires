import { describe, expect, it, vi } from "vitest";
import { applyPlayerStyleMessage } from "./client-player-style-message.js";
import type { EmpireVisualStyle } from "../client-types.js";

const createState = () => ({
  me: "player-1",
  meName: "Old Name",
  playerNames: new Map<string, string>(),
  playerColors: new Map<string, string>(),
  playerVisualStyles: new Map<string, EmpireVisualStyle>(),
  playerShieldUntil: new Map<string, number>()
});

describe("applyPlayerStyleMessage", () => {
  it("updates player names and colors from PLAYER_STYLE messages", () => {
    const state = createState();
    const renderHud = vi.fn();
    const syncAuthOverlay = vi.fn();

    applyPlayerStyleMessage(
      { type: "PLAYER_STYLE", playerId: "player-1", name: "Nauticus Prime", tileColor: "#123456" },
      { state, authProfileNameEl: { value: "" }, authProfileColorEl: { value: "" }, syncAuthOverlay, renderHud }
    );

    expect(state.meName).toBe("Nauticus Prime");
    expect(state.playerNames.get("player-1")).toBe("Nauticus Prime");
    expect(state.playerColors.get("player-1")).toBe("#123456");
  });

  it("re-renders the HUD when the message updates the local player's own name", () => {
    // Regression guard: SET_PROFILE responses fan out as PLAYER_STYLE
    // (broadcast to everyone, including the sender) followed by a self-only
    // PLAYER_UPDATE. Without a re-render here, the settings panel/HUD could
    // keep showing the stale name until some unrelated message happened to
    // call renderHud().
    const state = createState();
    const renderHud = vi.fn();
    const syncAuthOverlay = vi.fn();

    const affectsSelf = applyPlayerStyleMessage(
      { type: "PLAYER_STYLE", playerId: "player-1", name: "Wayepoint", tileColor: "#123456" },
      { state, authProfileNameEl: { value: "" }, authProfileColorEl: { value: "" }, syncAuthOverlay, renderHud }
    );

    expect(affectsSelf).toBe(true);
    expect(state.meName).toBe("Wayepoint");
    expect(renderHud).toHaveBeenCalled();
    expect(syncAuthOverlay).toHaveBeenCalled();
  });

  it("does not re-render the HUD for messages about other players", () => {
    const state = createState();
    const renderHud = vi.fn();
    const syncAuthOverlay = vi.fn();

    const affectsSelf = applyPlayerStyleMessage(
      { type: "PLAYER_STYLE", playerId: "player-2", name: "Other Player", tileColor: "#654321" },
      { state, authProfileNameEl: { value: "" }, authProfileColorEl: { value: "" }, syncAuthOverlay, renderHud }
    );

    expect(affectsSelf).toBe(false);
    expect(state.playerNames.get("player-2")).toBe("Other Player");
    expect(renderHud).not.toHaveBeenCalled();
    expect(syncAuthOverlay).not.toHaveBeenCalled();
  });
});
