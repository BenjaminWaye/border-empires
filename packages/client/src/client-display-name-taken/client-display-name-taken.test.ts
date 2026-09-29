import { describe, expect, it, vi } from "vitest";

import { applyNameTakenError } from "./client-display-name-taken.js";

const setup = (state: { pendingDisplayNameChange: string; pendingColorChange: string }) => {
  const deps = { state, setAuthStatus: vi.fn(), syncAuthOverlay: vi.fn(), pushFeed: vi.fn() };
  return deps;
};

describe("applyNameTakenError", () => {
  it("shows the server message with the suggested name on the sign-in card", () => {
    const deps = setup({ pendingDisplayNameChange: "", pendingColorChange: "" });

    applyNameTakenError(deps, { message: "That name is already taken by another empire.", suggestion: "House Ashgrove II" });

    expect(deps.setAuthStatus).toHaveBeenCalledWith("That name is already taken by another empire. Try: House Ashgrove II", "error");
    expect(deps.syncAuthOverlay).toHaveBeenCalledTimes(1);
    expect(deps.pushFeed).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the server sends none, and omits a missing suggestion", () => {
    const deps = setup({ pendingDisplayNameChange: "", pendingColorChange: "" });

    applyNameTakenError(deps, {});

    expect(deps.setAuthStatus).toHaveBeenCalledWith("That name is already taken.", "error");
  });

  it("clears a pending rename and colour change and reports both on the Settings feed", () => {
    const state = { pendingDisplayNameChange: "House Vex", pendingColorChange: "#ff0000" };
    const deps = setup(state);

    applyNameTakenError(deps, { message: "Taken.", suggestion: "House Vex II" });

    expect(state).toEqual({ pendingDisplayNameChange: "", pendingColorChange: "" });
    expect(deps.pushFeed).toHaveBeenCalledWith("Display name not updated: Taken. Try: House Vex II", "error", "error");
    expect(deps.pushFeed).toHaveBeenCalledWith("Empire colour not updated: Taken. Try: House Vex II", "error", "error");
  });
});
