import { describe, expect, it } from "vitest";

import { tickManpowerFullAlerts, type ManpowerFullAlertTickContext } from "./runtime-manpower-full-alert.js";
import type { RuntimePlayer } from "./runtime-types.js";

const makePlayer = (id: string, isAi = false): RuntimePlayer => ({
  id,
  isAi,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  strategicResources: {}
});

type Options = {
  cap?: number;
  regen?: number;
  current?: number;
  subscribed?: boolean;
};

const makeContext = (
  players: RuntimePlayer[],
  optionsByPlayerId: Record<string, Options>,
  overrides: Partial<ManpowerFullAlertTickContext> = {}
): ManpowerFullAlertTickContext & { emitted: unknown[] } => {
  const emitted: unknown[] = [];
  return {
    nowMs: 1_000_000,
    players: new Map(players.map((p) => [p.id, p])),
    playerManpowerCap: (player) => optionsByPlayerId[player.id]?.cap ?? 200,
    playerManpowerRegenPerMinute: (player) => optionsByPlayerId[player.id]?.regen ?? 1,
    effectiveManpowerAt: (player) => optionsByPlayerId[player.id]?.current ?? 0,
    isPlayerSubscribed: (playerId) => optionsByPlayerId[playerId]?.subscribed ?? false,
    emitEvent: (event) => { emitted.push(event); },
    alertedPlayerIds: new Set<string>(),
    emitted,
    ...overrides
  };
};

describe("tickManpowerFullAlerts", () => {
  it("alerts an offline player who has newly reached the manpower cap", () => {
    const ctx = makeContext([makePlayer("p1")], { p1: { cap: 200, current: 200, regen: 1, subscribed: false } });
    expect(tickManpowerFullAlerts(ctx)).toBe(1);
    expect(ctx.emitted).toEqual([
      expect.objectContaining({ eventType: "PLAYER_MESSAGE", playerId: "p1", messageType: "MANPOWER_FULL_ALERT" })
    ]);
    expect(ctx.alertedPlayerIds.has("p1")).toBe(true);
  });

  it("never alerts an online player, even at cap", () => {
    const ctx = makeContext([makePlayer("p1")], { p1: { cap: 200, current: 200, regen: 1, subscribed: true } });
    expect(tickManpowerFullAlerts(ctx)).toBe(0);
    expect(ctx.emitted).toEqual([]);
  });

  it("never alerts an AI or barbarian player", () => {
    const ai = makePlayer("ai-1", true);
    const barbarian = makePlayer("barbarian-1");
    const ctx = makeContext([ai, barbarian], {
      "ai-1": { cap: 200, current: 200, regen: 1 },
      "barbarian-1": { cap: 200, current: 200, regen: 1 }
    });
    expect(tickManpowerFullAlerts(ctx)).toBe(0);
  });

  it("does not alert again on the next tick for the same fill (at most once per absence)", () => {
    const ctx = makeContext([makePlayer("p1")], { p1: { cap: 200, current: 200, regen: 1, subscribed: false } });
    expect(tickManpowerFullAlerts(ctx)).toBe(1);
    expect(tickManpowerFullAlerts(ctx)).toBe(0);
  });

  it("re-arms once manpower drops back below the cap, so the next fill alerts again", () => {
    const player = makePlayer("p1");
    const options: Record<string, Options> = { p1: { cap: 200, current: 200, regen: 1, subscribed: false } };
    const ctx = makeContext([player], options);
    expect(tickManpowerFullAlerts(ctx)).toBe(1);

    options.p1!.current = 50; // spent below cap
    expect(tickManpowerFullAlerts(ctx)).toBe(0);
    expect(ctx.alertedPlayerIds.has("p1")).toBe(false);

    options.p1!.current = 200; // refilled to cap again
    expect(tickManpowerFullAlerts(ctx)).toBe(1);
  });

  it("does not alert while regen is paused (Titanium Levy freeze), but stays ready to alert once it resumes", () => {
    const player = makePlayer("p1");
    const options: Record<string, Options> = { p1: { cap: 200, current: 200, regen: 0, subscribed: false } };
    const ctx = makeContext([player], options);
    expect(tickManpowerFullAlerts(ctx)).toBe(0);
    expect(ctx.alertedPlayerIds.has("p1")).toBe(false);

    options.p1!.regen = 1; // freeze lifted, still sitting at cap
    expect(tickManpowerFullAlerts(ctx)).toBe(1);
  });

  it("skips a player with no manpower cap at all rather than treating 0/0 as full", () => {
    const ctx = makeContext([makePlayer("p1")], { p1: { cap: 0, current: 0, regen: 1, subscribed: false } });
    expect(tickManpowerFullAlerts(ctx)).toBe(0);
  });
});
