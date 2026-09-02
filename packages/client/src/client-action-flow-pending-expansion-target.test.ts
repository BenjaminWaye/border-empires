import { describe, expect, it } from "vitest";
import { isPendingExpansionTarget } from "./client-action-flow-pending-expansion-target.js";
import type { ClientState } from "./client-state/client-state.js";

const stateWithCapture = (capture: ClientState["capture"]): Pick<ClientState, "capture"> => ({ capture });

describe("isPendingExpansionTarget", () => {
  it("is true for the tile an in-flight EXPAND capture targets", () => {
    const state = stateWithCapture({ actionType: "EXPAND", target: { x: 5, y: 7 } } as ClientState["capture"]);
    expect(isPendingExpansionTarget(state, 5, 7)).toBe(true);
  });

  it("is false for an ATTACK capture — the target is already enemy-owned, not a pending acquisition", () => {
    const state = stateWithCapture({ actionType: "ATTACK", target: { x: 5, y: 7 } } as ClientState["capture"]);
    expect(isPendingExpansionTarget(state, 5, 7)).toBe(false);
  });

  it("is false for a different tile than the capture's target", () => {
    const state = stateWithCapture({ actionType: "EXPAND", target: { x: 5, y: 7 } } as ClientState["capture"]);
    expect(isPendingExpansionTarget(state, 1, 1)).toBe(false);
  });

  it("is false with no capture in flight", () => {
    expect(isPendingExpansionTarget(stateWithCapture(undefined), 5, 7)).toBe(false);
  });
});
