import { describe, expect, it } from "vitest";
import { resourceBarHtml } from "../client-hud-v2/client-hud-v2-resource-bar.js";
import { isAwaitingFreshPlayer, markAwaitingFreshPlayer, notePlayerUpdateFreshness, PLAYER_FRESH_WAIT_MS } from "./client-player-freshness.js";

const slots = { FOOD: 7, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };

// Playtest 2026-11-27: after every load the header showed old food and Integrity for ~5 s. INIT carries no
// integrityPct, so the client kept its default (100%) until the first full PLAYER_UPDATE.
describe("player freshness after INIT", () => {
  it("holds the food and Integrity chips until a full update arrives", () => {
    const state = { awaitingFreshPlayerUntil: 0 };
    markAwaitingFreshPlayer(state, 1_000);
    expect(isAwaitingFreshPlayer(state, 1_001)).toBe(true);
    const held = resourceBarHtml({ gold: 10, netPerMinute: 0, slotSupply: slots, slotDemand: { ...slots, FOOD: 3 }, integrityPct: 100, pending: isAwaitingFreshPlayer(state, 1_001) });
    expect(held).not.toContain("100%");
    expect(held).not.toContain(">4<");
    expect(held).toContain("hud-v2-chip-pending");

    notePlayerUpdateFreshness(state, { gold: 1 } as { integrityPct?: unknown });
    expect(isAwaitingFreshPlayer(state, 1_001)).toBe(true); // a partial update is not fresh integrity
    notePlayerUpdateFreshness(state, { integrityPct: 77 });
    expect(isAwaitingFreshPlayer(state, 1_001)).toBe(false);
    const fresh = resourceBarHtml({ gold: 10, netPerMinute: 0, slotSupply: slots, slotDemand: { ...slots, FOOD: 3 }, integrityPct: 77, pending: false });
    expect(fresh).toContain("77%");
    expect(fresh).toContain('4<span class="hud-v2-chip-unit"> free</span>');
  });

  it("never holds the chips longer than the wait", () => {
    const state = { awaitingFreshPlayerUntil: 0 };
    markAwaitingFreshPlayer(state, 0);
    expect(isAwaitingFreshPlayer(state, PLAYER_FRESH_WAIT_MS)).toBe(false);
  });
});
