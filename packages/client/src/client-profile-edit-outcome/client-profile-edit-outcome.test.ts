import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPlayerUpdateColorChange,
  applyProfileSaveRejection,
  awaitProfileEditOutcome,
  settleProfileEditOutcome,
  type ProfileEditOutcome
} from "./client-profile-edit-outcome.js";
import { applyServerColorsInUse, colorsInUseFor } from "../client-color-clash/client-color-clash.js";

const makeState = (pending: { name?: string; color?: string } = {}) => ({
  me: "p1",
  playerColors: new Map([["p1", "#38b000"]]),
  pendingDisplayNameChange: pending.name ?? "",
  pendingColorChange: pending.color ?? ""
});
const deps = (state: ReturnType<typeof makeState>) => ({
  state,
  authProfileColorEl: { value: "#000000" },
  setAuthStatus: vi.fn(),
  syncAuthOverlay: vi.fn(),
  pushFeed: vi.fn()
});
const waitFor = (): ProfileEditOutcome[] => {
  const seen: ProfileEditOutcome[] = [];
  awaitProfileEditOutcome((outcome) => seen.push(outcome));
  return seen;
};

afterEach(() => {
  settleProfileEditOutcome({ ok: false, reason: "test over" });
  applyServerColorsInUse({}, true);
});

describe("profile save refusals", () => {
  it("DISPLAY_NAME_LIMIT reaches the waiting dialog with the server's reason", () => {
    const seen = waitFor();
    const d = deps(makeState({ name: "New Name" }));
    expect(applyProfileSaveRejection(d, "DISPLAY_NAME_LIMIT", { message: "Once per Sector Contest." })).toBe(true);
    expect(seen).toEqual([{ ok: false, reason: "Once per Sector Contest." }]);
    expect(d.state.pendingDisplayNameChange).toBe("");
    expect(d.pushFeed).toHaveBeenCalledWith("Once per Sector Contest.", "error", "warn");
  });

  // A rename + recolour ride on one SET_PROFILE: a COLOR_LIMIT used to clear only the colour,
  // leaving the name pending forever with nothing said about it.
  it("COLOR_LIMIT clears the pending name too, since neither was saved", () => {
    const seen = waitFor();
    const d = deps(makeState({ name: "New Name", color: "#f59e0b" }));
    applyProfileSaveRejection(d, "COLOR_LIMIT", { message: "Colour once per Sector Contest." });
    expect(d.state.pendingDisplayNameChange).toBe("");
    expect(d.state.pendingColorChange).toBe("");
    expect(seen).toHaveLength(1);
  });

  // Playtest 2026-11-28: after each refusal the custom colour snapped back to
  // a pink the player never picked (their provisional colour).
  it("COLOR_TAKEN keeps the player's pick, takes the gateway's colours in use and offers the suggestion", () => {
    const seen = waitFor();
    const d = deps(makeState({ color: "#f59e0b" }));
    d.authProfileColorEl.value = "#f59e0b";
    const colorsInUse = { exact: [], empires: [{ playerId: "g47", name: "House Noname 47", color: "#f39c12" }] };
    expect(applyProfileSaveRejection(d, "COLOR_TAKEN", { message: "Taken.", suggestion: "#123456", colorsInUse })).toBe(true);
    expect(d.authProfileColorEl.value).toBe("#f59e0b");
    expect(colorsInUseFor({ me: "p1", playerColors: new Map(), playerNames: new Map() })).toEqual(colorsInUse);
    expect(d.pushFeed).toHaveBeenCalledWith("Empire colour not updated: Taken. Try: #123456", "error", "error");
    expect(seen).toEqual([{ ok: false, reason: "Taken. Try: #123456" }]);
  });

  it("leaves generic errors alone when no profile save is pending, and lets them through when one is", () => {
    const seen = waitFor();
    expect(applyProfileSaveRejection(deps(makeState()), "BAD_MSG", { message: "x" })).toBe(false);
    expect(seen).toHaveLength(0);
    expect(applyProfileSaveRejection(deps(makeState({ name: "N" })), "BAD_MSG", { message: "displayName too long" })).toBe(false);
    expect(seen).toEqual([{ ok: false, reason: "Name not accepted." }]);
    expect(applyProfileSaveRejection(deps(makeState({ name: "N" })), "NOT_ADJACENT", {})).toBe(false);
  });
});

describe("profile save confirmations", () => {
  it("resolves only once both a pending name and colour are confirmed", () => {
    const seen = waitFor();
    const state = makeState({ name: "New Name", color: "#f59e0b" });
    applyPlayerUpdateColorChange("#f59e0b", { state, authProfileColorEl: { value: "" }, pushFeed: vi.fn() });
    expect(seen).toHaveLength(0);
    state.pendingDisplayNameChange = "";
    applyPlayerUpdateColorChange("#f59e0b", { state, authProfileColorEl: { value: "" }, pushFeed: vi.fn() });
    expect(seen).toHaveLength(0); // nothing pending any more: only a confirming update settles
    const seen2 = waitFor();
    state.pendingColorChange = "#aaaaaa";
    applyPlayerUpdateColorChange("#aaaaaa", { state, authProfileColorEl: { value: "" }, pushFeed: vi.fn() });
    expect(seen2).toEqual([{ ok: true }]);
  });

  it("a cancelled wait is never resolved", () => {
    const onOutcome = vi.fn();
    const cancel = awaitProfileEditOutcome(onOutcome);
    cancel();
    settleProfileEditOutcome({ ok: true });
    expect(onOutcome).not.toHaveBeenCalled();
  });
});
