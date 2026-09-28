import { describe, expect, it } from "vitest";

import { bind, createState, FakeWebSocket } from "./client-network-test-harness.js";

const sendInit = (ws: FakeWebSocket, player: Record<string, unknown>): void => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: "player-1", name: "Player", points: 5, level: 1, stamina: 0, homeTile: { x: 40, y: 40 }, ...player },
      config: {},
      recovery: { nextClientSeq: 1, pendingCommands: [] }
    })
  });
};

const sendError = (ws: FakeWebSocket, code: string, extra: Record<string, unknown> = {}): void => {
  ws.emit("message", { data: JSON.stringify({ type: "ERROR", code, message: `${code} happened`, ...extra }) });
};

describe("INIT profile name suggestion", () => {
  it("pre-fills the profile step with the server's free name instead of the placeholder name", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);

    sendInit(ws, { profileNeedsSetup: true, suggestedName: "House Ashgrove" });

    expect(mocks.seedProfileSetupFields).toHaveBeenCalledWith("House Ashgrove", expect.anything());
  });

  it("still seeds from the player's own name when the server sends no suggestion (a returning player)", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);

    sendInit(ws, { name: "Ada Lovelace" });

    expect(mocks.seedProfileSetupFields).toHaveBeenCalledWith("Ada Lovelace", expect.anything());
  });
});

describe("NAME_TAKEN error", () => {
  it("shows the message with the suggested name and leaves the colour the player picked alone", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);
    mocks.authProfileColorEl.value = "#abcdef";

    sendError(ws, "NAME_TAKEN", { suggestion: "House Ashgrove II" });

    expect(mocks.setAuthStatus).toHaveBeenCalledWith("NAME_TAKEN happened Try: House Ashgrove II", "error");
    expect(mocks.authProfileColorEl.value).toBe("#abcdef");
  });

  it("reports a rejected rename on the Settings feed and clears the pending change", () => {
    const state = createState();
    state.pendingDisplayNameChange = "House Vex";
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);

    sendError(ws, "NAME_TAKEN", { suggestion: "House Vex II" });

    expect(state.pendingDisplayNameChange).toBe("");
    expect(mocks.pushFeed).toHaveBeenCalledWith("Display name not updated: NAME_TAKEN happened Try: House Vex II", "error", "error");
  });
});
