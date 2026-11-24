import { describe, expect, it, vi } from "vitest";
import type { WaypointPlan } from "@border-empires/shared";

import { createInitialState } from "../client-state/client-state.js";
import { confirmWaypointAttacks, waypointAttackedOwners } from "./client-waypoint-attack-confirm.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const step = (x: number, action: "EXPAND" | "ATTACK") =>
  ({ origin: { x: x - 1, y: 0 }, target: { x, y: 0 }, action, durationMs: 1, goldCost: 0, manpowerCost: 10, manpowerMin: 10 });
const planWith = (steps: ReturnType<typeof step>[]): WaypointPlan =>
  ({ steps, attackCount: steps.filter((s) => s.action === "ATTACK").length, totalManpower: 40, reachable: true } as unknown as WaypointPlan);

const stateWithOwners = () => {
  const state = createInitialState();
  state.me = "me";
  state.tiles.set("1,0", { x: 1, y: 0, terrain: "LAND", ownerId: "barbarian-1" } as never);
  state.tiles.set("2,0", { x: 2, y: 0, terrain: "LAND", ownerId: "ai-3" } as never);
  state.tiles.set("3,0", { x: 3, y: 0, terrain: "LAND", ownerId: "ai-3" } as never);
  state.playerNames.set("ai-3", "Rasmus");
  return state;
};

describe("Expand To asks before it fights", () => {
  it("names everyone the route attacks, once each", () => {
    const plan = planWith([step(1, "ATTACK"), step(2, "ATTACK"), step(3, "ATTACK"), step(4, "EXPAND")]);
    expect(waypointAttackedOwners(plan, stateWithOwners(), keyFor)).toEqual(["barbarians", "Rasmus"]);
  });

  // Regression: a route through barbarian or rival land attacked with no question asked.
  it("asks before a route with attacks and only proceeds on confirm", () => {
    const proceed = vi.fn();
    const show = vi.fn().mockReturnValue(true);
    confirmWaypointAttacks(planWith([step(1, "ATTACK"), step(2, "ATTACK"), step(3, "EXPAND")]), stateWithOwners(), keyFor, proceed, show);
    expect(proceed).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(expect.objectContaining({
      title: "Attack on the way?",
      subtitle: "The way there goes through land held by barbarians and Rasmus.",
      consequences: ["2 attacks on the way, up to 40 manpower in all.", "A muster flag is raised to fund them if none is near.", "Attacks can fail."]
    }));
    show.mock.calls[0]![0].onConfirm();
    expect(proceed).toHaveBeenCalledOnce();
  });

  it("goes straight ahead when the route only expands", () => {
    const proceed = vi.fn();
    const show = vi.fn();
    confirmWaypointAttacks(planWith([step(1, "EXPAND")]), stateWithOwners(), keyFor, proceed, show);
    expect(show).not.toHaveBeenCalled();
    expect(proceed).toHaveBeenCalledOnce();
  });
});
