// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { isMapUnobstructed } from "./client-map-unobstructed.js";

// The module keeps a once-per-session `shown` flag, so each test loads a fresh copy.
const freshModule = async () => {
  vi.resetModules();
  return import("../client-ruins-prompt.js");
};

const signedInState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.guide.open = false;
  return state;
};

describe("maybeShowRuinsPrompt", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("marks the map obstructed while the popup is up and clears it on dismiss", async () => {
    const { maybeShowRuinsPrompt } = await freshModule();
    const state = signedInState();
    expect(isMapUnobstructed(state)).toBe(true);
    maybeShowRuinsPrompt(state);
    expect(state.ruinsPromptOpen).toBe(true);
    expect(isMapUnobstructed(state)).toBe(false);
    document.querySelector<HTMLButtonElement>("#ruins-prompt-dismiss")?.click();
    expect(document.querySelector("#ruins-prompt-dismiss")).toBeNull();
    expect(state.ruinsPromptOpen).toBe(false);
    expect(isMapUnobstructed(state)).toBe(true);
  });

  it("clears the flag when dismissed with Escape, and does not re-open once shown", async () => {
    const { maybeShowRuinsPrompt } = await freshModule();
    const state = signedInState();
    maybeShowRuinsPrompt(state);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(state.ruinsPromptOpen).toBe(false);
    maybeShowRuinsPrompt(state);
    expect(state.ruinsPromptOpen).toBe(false);
    expect(document.querySelector("#ruins-prompt-title")).toBeNull();
  });
});
