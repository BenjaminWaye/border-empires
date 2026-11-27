import { afterEach, describe, expect, it } from "vitest";
import { awaitProfileEditOutcome, settleProfileEditOutcome, type ProfileEditOutcome } from "../client-profile-edit-outcome/client-profile-edit-outcome.js";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

afterEach(() => settleProfileEditOutcome({ ok: false, reason: "test over" }));

const waitForOutcome = (): ProfileEditOutcome[] => {
  const seen: ProfileEditOutcome[] = [];
  awaitProfileEditOutcome((outcome) => seen.push(outcome));
  return seen;
};

// Playtest 2026-11 (staging): Edit Name & Colour closed on send, so the server's answer never
// reached the player. The open dialog now waits for it through the network handler.
describe("SET_PROFILE answers reach the waiting Edit Name & Colour dialog", () => {
  it("a refusal carries the server's reason", () => {
    const state = createState();
    state.pendingDisplayNameChange = "New Name";
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);
    const seen = waitForOutcome();
    ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "DISPLAY_NAME_LIMIT", message: "Once per Sector Contest." }) });
    expect(seen).toEqual([{ ok: false, reason: "Once per Sector Contest." }]);
  });

  it("a COLOR_LIMIT on a combined rename + recolour clears the pending name too", () => {
    const state = createState();
    state.pendingDisplayNameChange = "New Name";
    state.pendingColorChange = "#f59e0b";
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);
    ws.emit("message", { data: JSON.stringify({ type: "ERROR", code: "COLOR_LIMIT", message: "Colour once per Sector Contest." }) });
    expect(state.pendingColorChange).toBe("");
    expect(state.pendingDisplayNameChange).toBe("");
  });

  it("the confirming PLAYER_UPDATE resolves it", () => {
    const state = createState();
    state.pendingDisplayNameChange = "New Name";
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);
    const seen = waitForOutcome();
    ws.emit("message", { data: JSON.stringify({ type: "PLAYER_UPDATE", name: "New Name" }) });
    expect(seen).toEqual([{ ok: true }]);
  });
});
