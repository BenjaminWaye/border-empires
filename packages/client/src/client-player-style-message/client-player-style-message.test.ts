import { describe, expect, it, vi } from "vitest";
import type { CosmeticId, PlayerCosmeticSelection } from "@border-empires/shared";
import { applyInitPlayerStyles, applyPlayerAppearanceMessage, applyPlayerStyleMessage } from "./client-player-style-message.js";
import type { EmpireVisualStyle } from "../client-types.js";

const createState = () => ({
  me: "player-1",
  meName: "Old Name",
  playerNames: new Map<string, string>(),
  playerColors: new Map<string, string>(),
  playerVisualStyles: new Map<string, EmpireVisualStyle>(),
  playerShieldUntil: new Map<string, number>(),
  playerCosmetics: new Map<string, PlayerCosmeticSelection>(),
  ownedCosmetics: [] as CosmeticId[],
  cosmeticsRequested: false,
  dukePlayers: new Set<string>()
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

  it("does not let a renderHud/syncAuthOverlay throw during a self name change escape to the caller", () => {
    // Regression: this runs synchronously inside the WebSocket "message"
    // listener, which has no surrounding try/catch. On Safari, a throw
    // inside syncAuthOverlay/renderHud (e.g. a DOM/storage call hitting a
    // locked-down browser API) used to propagate out of the whole message
    // handler and could crash the app right after a routine profile save.
    const state = createState();
    const renderHud = vi.fn();
    const syncAuthOverlay = vi.fn(() => {
      throw new Error("simulated Safari DOM/storage failure");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      applyPlayerStyleMessage(
        { type: "PLAYER_STYLE", playerId: "player-1", name: "Wayepoint", tileColor: "#123456" },
        { state, authProfileNameEl: { value: "" }, authProfileColorEl: { value: "" }, syncAuthOverlay, renderHud }
      )
    ).not.toThrow();

    expect(state.meName).toBe("Wayepoint");
    expect(consoleErrorSpy).toHaveBeenCalled();
    // renderHud is never reached because syncAuthOverlay threw first, but the
    // important thing is nothing escaped the call.
    expect(renderHud).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
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

describe("cosmetics on appearance messages", () => {
  const deps = (state: ReturnType<typeof createState>, renderHud = vi.fn()) => ({
    state, authProfileNameEl: { value: "" }, authProfileColorEl: { value: "" }, syncAuthOverlay: vi.fn(), renderHud
  });

  it("stores another player's look from PLAYER_STYLE and clears it on an empty selection", () => {
    const state = createState();
    expect(applyPlayerAppearanceMessage({ type: "PLAYER_STYLE", playerId: "rival", cosmetics: { musterFlag: "flag-high-noble" } }, deps(state))).toBe(true);
    expect(state.playerCosmetics.get("rival")).toEqual({ musterFlag: "flag-high-noble" });
    applyPlayerAppearanceMessage({ type: "PLAYER_STYLE", playerId: "rival", cosmetics: {} }, deps(state));
    expect(state.playerCosmetics.has("rival")).toBe(false);
  });

  it("leaves a player's look alone when PLAYER_STYLE carries no cosmetics field", () => {
    const state = createState();
    state.playerCosmetics.set("rival", { musterFlag: "flag-high-noble" });
    applyPlayerAppearanceMessage({ type: "PLAYER_STYLE", playerId: "rival", name: "Renamed" }, deps(state));
    expect(state.playerCosmetics.get("rival")).toEqual({ musterFlag: "flag-high-noble" });
  });

  it("drops cosmetic ids this client does not know", () => {
    const state = createState();
    applyPlayerAppearanceMessage({ type: "PLAYER_STYLE", playerId: "rival", cosmetics: { musterFlag: "flag-from-the-future" } }, deps(state));
    expect(state.playerCosmetics.has("rival")).toBe(false);
  });

  it("applies COSMETICS_STATE to the local account and re-renders", () => {
    const state = createState();
    const renderHud = vi.fn();
    expect(applyPlayerAppearanceMessage({ type: "COSMETICS_STATE", owned: ["flag-high-noble", "bogus"], selected: { musterFlag: "flag-high-noble" } }, deps(state, renderHud))).toBe(true);
    expect(state.ownedCosmetics).toEqual(["flag-high-noble"]);
    expect(state.playerCosmetics.get("player-1")).toEqual({ musterFlag: "flag-high-noble" });
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated messages", () => {
    expect(applyPlayerAppearanceMessage({ type: "PING" }, deps(createState()))).toBe(false);
  });

  it("INIT replaces every known look, so a look removed while offline does not linger", () => {
    const state = createState();
    state.playerCosmetics.set("gone", { musterFlag: "flag-high-noble" });
    applyInitPlayerStyles(state, {
      playerStyles: [{ id: "rival", name: "Rival", tileColor: "#112233", duke: true }],
      playerCosmetics: { rival: { musterFlag: "flag-high-noble" } }
    });
    expect(state.playerNames.get("rival")).toBe("Rival");
    expect(state.playerColors.get("rival")).toBe("#112233");
    expect(state.dukePlayers.has("rival")).toBe(true);
    expect([...state.playerCosmetics]).toEqual([["rival", { musterFlag: "flag-high-noble" }]]);
  });
});
