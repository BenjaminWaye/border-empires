import { describe, expect, it, vi } from "vitest";
import { applyAttackAlertMessage, type AttackAlertMessageDeps } from "./client-attack-alert-message.js";

// ATTACK_ALERT handling, moved out of client-network.ts unchanged.
const makeDeps = () => {
  const state = { incomingAttacksByTile: new Map(), unreadAttackAlerts: 0 } as unknown as AttackAlertMessageDeps["state"];
  const appendFeedEntry = vi.fn();
  return { state, appendFeedEntry, keyFor: (x: number, y: number) => `${x},${y}` };
};

describe("applyAttackAlertMessage", () => {
  it("records the incoming attack with its march and odds, and posts the feed line", () => {
    const deps = makeDeps();
    applyAttackAlertMessage({
      type: "ATTACK_ALERT", attackerId: "barbarian-1", attackerName: "Insurgents", x: 74, y: 70, fromX: 73, fromY: 70,
      resolvesAt: 31_000, transitEndsAt: 16_000, winChance: 0.4
    }, deps);
    expect(deps.state.incomingAttacksByTile.get("74,70")).toEqual({
      attackerName: "Insurgents", resolvesAt: 31_000, attackerId: "barbarian-1", fromX: 73, fromY: 70, transitEndsAt: 16_000, winChance: 0.4
    });
    expect(deps.state.unreadAttackAlerts).toBe(1);
    expect(deps.appendFeedEntry).toHaveBeenCalledWith(expect.objectContaining({ text: "Under attack: Insurgents is striking (74, 70) from (73, 70).", focusX: 74, focusY: 70 }));
  });

  it("still counts and posts an alert without a usable tile, but records nothing", () => {
    const deps = makeDeps();
    applyAttackAlertMessage({ type: "ATTACK_ALERT", attackerId: "p2" }, deps);
    expect(deps.state.incomingAttacksByTile.size).toBe(0);
    expect(deps.state.unreadAttackAlerts).toBe(1);
    expect(deps.appendFeedEntry).toHaveBeenCalledWith(expect.objectContaining({ text: "Under attack: p2 is striking (-1, -1)." }));
  });
});
