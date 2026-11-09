import { describe, expect, it } from "vitest";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

describe("client network SEASON_FULL handling", () => {
  it("keeps the auth overlay up with the season-full flag set instead of reconnecting, on SEASON_FULL", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ERROR",
        code: "SEASON_FULL",
        message: "This Sector Contest is full. Join the waitlist for the next Sector."
      })
    });

    expect(state.seasonFull).toBe(true);
    expect(state.authSessionReady).toBe(false);
    expect(state.authBusy).toBe(true);
    expect(state.authBusyTitle).toBe("This Sector Contest is full");
  });
});
