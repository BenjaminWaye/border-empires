import { describe, expect, it } from "vitest";
import { MUSTER_FLAG_BASE_CAP_FLOOR } from "@border-empires/shared";
import type { Tile, TileMenuView } from "../client-types.js";
import { actionBarHtml } from "./client-hud-v2-action-bar.js";
import { musterFactsFor } from "./client-hud-v2-muster-facts.js";

// 2026-11-16 playtest: tapping a muster flag showed no staged/cap anywhere on a
// phone, and the "Reports ▸" link opened the legacy Attack commitment tab.
const view = (over: Partial<TileMenuView> = {}): TileMenuView => ({
  title: "Tundra (23, 14)", subtitle: "Your frontier", tabs: ["actions", "commit", "overview", "reports"],
  overviewLines: [], actions: [], buildings: [], crystal: [], ...over
});

const state = { me: "me", manpowerCap: 1_000, manpower: 1_000, musterAmountRateByTile: new Map() };
const flagTile = (mode: "HOLD" | "ADVANCE" | "MARCH", extra: Partial<NonNullable<Tile["muster"]>> = {}): Tile => ({
  x: 23, y: 14, terrain: "LAND", ownerId: "me", muster: { ownerId: "me", amount: 40, mode, updatedAt: 0, ...extra }
});

describe("muster flag in the new tile panel", () => {
  it("names each tile-view link for what it opens", () => {
    const html = actionBarHtml(view());
    expect(html).toContain('data-hud-v2-panel="commit" aria-expanded="false">Attack commitment ▸</button>');
    expect(html).toContain('data-hud-v2-panel="reports" aria-expanded="false">Combat reports ▸</button>');
    expect(html).not.toContain(">Reports ▸");
    expect(html).not.toContain("data-hud-v2-tab");
  });

  it("shows the flag's staged manpower and cap as a fact", () => {
    const facts = musterFactsFor(flagTile("HOLD"), state);
    expect(facts).toEqual([
      { label: "Muster", value: `40 / ${MUSTER_FLAG_BASE_CAP_FLOOR} manpower` },
      { label: "Order", value: "Hold" }
    ]);
    expect(actionBarHtml(view(), undefined, facts)).toContain(`Muster</span>40 / ${MUSTER_FLAG_BASE_CAP_FLOOR} manpower`);
  });

  it("says which order the flag is on", () => {
    expect(musterFactsFor(flagTile("ADVANCE", { hunt: true }), state)[1]).toEqual({ label: "Order", value: "Hunt" });
    expect(musterFactsFor(flagTile("ADVANCE"), state)[1]).toEqual({ label: "Order", value: "Advance" });
    expect(musterFactsFor(flagTile("MARCH"), state)[1]).toEqual({ label: "Order", value: "March" });
  });

  it("adds nothing without your own flag", () => {
    expect(musterFactsFor({ x: 1, y: 1, terrain: "LAND", ownerId: "me" }, state)).toEqual([]);
    expect(musterFactsFor({ ...flagTile("HOLD"), ownerId: "rival" }, state)).toEqual([]);
  });
});
