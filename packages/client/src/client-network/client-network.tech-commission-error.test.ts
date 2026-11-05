import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

const pendingState = () => {
  const state = Object.assign(createInitialState(), createState());
  state.pendingTechUnlockId = "industrial-tooling";
  state.pendingTechUnlockAt = Date.now();
  return state;
};

describe("server ERROR and a Manifest commission in flight", () => {
  it("frees Commission when the simulation refuses the commission", () => {
    const state = pendingState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);
    ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "TECH_INVALID", message: "tech is not available" }) });
    expect(state.pendingTechUnlockId).toBe("");
    expect(state.pendingTechUnlockAt).toBe(0);
  });

  it("keeps the commission pending through an error it can't tie to CHOOSE_TECH", () => {
    const state = pendingState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);
    ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "COMMAND_RATE_LIMITED", message: "command rate limit" }) });
    expect(state.pendingTechUnlockId).toBe("industrial-tooling");
  });
});
