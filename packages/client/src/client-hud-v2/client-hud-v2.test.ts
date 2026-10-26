import { describe, expect, it } from "vitest";
import type { ActiveTruceView, TileActionDef, TileMenuView } from "../client-types.js";
import { actionBarHtml, moreActions, selectBarButtons } from "./client-hud-v2-action-bar.js";
import { waystationFacts } from "./client-hud-v2-tile-facts.js";
import { HUD_V2_STORAGE_KEY, readHudV2Flag } from "./client-hud-v2-flag.js";
import { orbFill, orbHtml } from "./client-hud-v2-orb.js";
import { resourceBarHtml, slotChipState } from "./client-hud-v2-resource-bar.js";
import { RIVAL_STRIP_CAP, rivalTokens } from "./client-hud-v2-rivals.js";
import { TRACKER_GROUP_CAP, trackerHtml, trackerNeeds } from "./client-hud-v2-tracker.js";

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k)
  };
};

const truce = (otherPlayerId: string, endsAt: number): ActiveTruceView => ({ otherPlayerId, otherPlayerName: otherPlayerId, startedAt: 0, endsAt, createdByPlayerId: "me" });

const act = (id: TileActionDef["id"], extra: Partial<TileActionDef> = {}): TileActionDef => ({ id, label: id, ...extra });

describe("hud v2 flag", () => {
  it("is off by default, turned on by ?hud=v2 and off again by ?hud=legacy", () => {
    const storage = memoryStorage();
    expect(readHudV2Flag("", storage)).toBe(false);
    expect(readHudV2Flag("?hud=v2", storage)).toBe(true);
    expect(storage.getItem(HUD_V2_STORAGE_KEY)).toBe("1");
    expect(readHudV2Flag("", storage)).toBe(true);
    expect(readHudV2Flag("?hud=legacy", storage)).toBe(false);
  });
});

describe("resource bar", () => {
  it("warns only when a slot is over capacity, not when full", () => {
    expect(slotChipState(2, 2)).toBe("normal");
    expect(slotChipState(3, 2)).toBe("over");
  });

  it("renders the used count in amber only when over", () => {
    const slots = { FOOD: 2, TITANIUM: 2, CRYSTAL: 0, UMBRITE: 0 };
    const html = resourceBarHtml({ gold: 1200, incomePerMinute: 2, slotSupply: slots, slotDemand: { ...slots, TITANIUM: 3 }, shard: 1, integrityPct: 62 });
    expect(html).toContain('<b class="hud-v2-over">3</b><span class="hud-v2-chip-of">/2</span>');
    expect(html.match(/hud-v2-over/g)).toHaveLength(1);
    expect(html).toContain("+120/h");
    expect(html).toContain('data-hud-v2-open="settings"');
  });
});

describe("tracker", () => {
  const base = { buildSlots: { busy: 0, limit: 3 }, afcReady: 0, flags: [], flagCap: 100, building: [], nowMs: 0 };

  it("lists free build slots, AFC upgrades and stalled flags as needs", () => {
    const needs = trackerNeeds({
      ...base,
      afcReady: 1,
      flags: [
        { x: 4, y: 5, amount: 10, mode: "ADVANCE", insufficientManpower: true },
        { x: 6, y: 7, amount: 50, mode: "HOLD" }
      ]
    });
    expect(needs.map((n) => n.kind)).toEqual(["afc", "flag"]);
    expect(needs[1]).toMatchObject({ x: 4, y: 5, sub: "Needs manpower" });
  });

  it("caps each group and shows the overflow count", () => {
    const building = Array.from({ length: TRACKER_GROUP_CAP + 2 }, (_, i) => ({ tileKey: `${i},0`, x: i, y: 0, label: "Mine", remainingMs: 60_000, totalMs: 60_000 }));
    const html = trackerHtml({ ...base, building });
    expect(html.match(/hud-v2-tracker-timed/g)).toHaveLength(TRACKER_GROUP_CAP);
    expect(html).toContain("+2 more");
    expect(html).toContain('data-hud-v2-focus-x="0" data-hud-v2-focus-y="0"');
  });

  it("always shows development slots, calling out free ones", () => {
    const html = trackerHtml({ ...base, buildSlots: { busy: 2, limit: 3 } });
    expect(html.match(/hud-v2-slot-busy/g)).toHaveLength(2);
    expect(html).toContain("2/3 · 1 free");
    expect(trackerHtml({ ...base, buildSlots: { busy: 3, limit: 3 } })).toContain(">3/3<");
  });

  // Regression: a frontier expansion was listed as "Battle at".
  it("labels a frontier expansion as expanding, and only a battle opens the battle screen", () => {
    const expanding = trackerHtml({ ...base, capture: { x: 2, y: 3, resolvesAt: 60_000, battle: false } });
    expect(expanding).toContain("Expanding to (2, 3)");
    expect(expanding).not.toContain('data-hud-v2-open="battle"');
    const battle = trackerHtml({ ...base, capture: { x: 2, y: 3, resolvesAt: 60_000, battle: true } });
    expect(battle).toContain("Battle at (2, 3)");
    expect(battle).toContain('data-hud-v2-open="battle"');
  });
});

describe("rivals strip", () => {
  it("puts truces first (soonest first), then allies, then everyone else met", () => {
    const { shown, hidden } = rivalTokens({
      me: "me",
      metPlayerIds: new Set(["a", "b", "c", "d"]),
      allies: ["c"],
      activeTruces: [
        truce("b", 10 * 3_600_000),
        truce("a", 2 * 3_600_000)
      ],
      nameOf: (id) => `Empire ${id}`,
      colorOf: () => "#123456",
      nowMs: 0
    });
    expect(shown.map((t) => [t.id, t.stance])).toEqual([["a", "truce"], ["b", "truce"], ["c", "ally"], ["d", "met"]]);
    expect(shown[0]?.label).toBe("TRUCE 2h");
    expect(hidden).toBe(0);
  });

  // Regression: meeting one empire showed "+1" instead of its name and colour.
  it("shows a single met empire by name, not as an overflow count", () => {
    const { shown, hidden } = rivalTokens({ me: "me", metPlayerIds: new Set(["me", "p2"]), allies: [], activeTruces: [], nameOf: () => "Vasker", colorOf: () => "#c33", nowMs: 0 });
    expect(shown).toEqual([{ id: "p2", name: "Vasker", initial: "V", color: "#c33", stance: "met", label: "MET" }]);
    expect(hidden).toBe(0);
  });

  it("caps the strip", () => {
    const allies = Array.from({ length: RIVAL_STRIP_CAP + 3 }, (_, i) => `p${i}`);
    const { shown, hidden } = rivalTokens({ me: "me", metPlayerIds: new Set(allies), allies, activeTruces: [], nameOf: (id) => id, colorOf: () => undefined, nowMs: 0 });
    expect(shown).toHaveLength(RIVAL_STRIP_CAP);
    expect(hidden).toBe(3);
  });
});

describe("action bar", () => {
  const view = (over: Partial<TileMenuView>): TileMenuView => ({ title: "Sand (1, 1)", subtitle: "", tabs: ["actions"], overviewLines: [], actions: [], buildings: [], crystal: [], ...over });

  it("makes attack the main action with Raise flag next, and keeps Garrison off the main row", () => {
    const buttons = selectBarButtons(view({ actions: [act("settle_land", { label: "Garrison" }), act("launch_attack"), act("diplomacy"), act("muster_hold")] }));
    expect(buttons.map((b) => (b.kind === "action" ? b.action.id : b.panel))).toEqual(["launch_attack", "muster_hold", "diplomacy"]);
  });

  // The order asked for on your own tiles: Relay Beacon, Raise flag, Build, then Garrison (and Garrison many) below.
  it("orders your own tile Relay Beacon, Raise flag, Build, with Garrison in the minor row", () => {
    const v = view({
      actions: [act("settle_land", { label: "Garrison" }), act("settle_many", { label: "Garrison many…" }), act("muster_hold", { label: "Raise flag" })],
      buildings: [act("build_relay_beacon", { label: "Relay Beacon" }), act("build_fortification", { label: "Fort" })],
      tabs: ["actions", "buildings"]
    });
    const buttons = selectBarButtons(v);
    expect(buttons.map((b) => (b.kind === "action" ? b.action.id : b.panel))).toEqual(["build_relay_beacon", "muster_hold", "build"]);
    expect(moreActions(v, buttons).map((a) => a.id)).toEqual(["settle_land", "settle_many"]);
    const html = actionBarHtml(v);
    expect(html).toContain('class="hud-v2-minor-row"');
    expect(html).not.toContain("⋯");
  });

  it("makes garrison the main action only when the tile is worth it", () => {
    const plain = selectBarButtons(view({ actions: [act("settle_land", { label: "Garrison" })] }));
    expect(plain).toEqual([]);
    const worth = selectBarButtons(view({ actions: [act("settle_land", { label: "Garrison", recommended: true })] }));
    expect(worth[0]).toMatchObject({ primary: true, action: { id: "settle_land" } });
  });

  // Regression: a resource tile led with Relay Beacon; garrisoning the resource is what the player wants there.
  it("leads with Garrison over Relay Beacon on a resource, town or dock tile", () => {
    const v = view({
      actions: [act("settle_land", { label: "Garrison", recommended: true }), act("muster_hold", { label: "Raise flag" })],
      buildings: [act("build_relay_beacon", { label: "Relay Beacon" })],
      tabs: ["actions", "buildings"]
    });
    const buttons = selectBarButtons(v);
    expect(buttons[0]).toMatchObject({ primary: true, action: { id: "settle_land" } });
    expect(buttons.some((b) => b.kind === "panel" && b.panel === "build")).toBe(true);
  });

  it("makes Expand To (settle_land on neutral land) the main action", () => {
    const buttons = selectBarButtons(view({ actions: [act("settle_land", { label: "Expand To" })] }));
    expect(buttons[0]).toMatchObject({ primary: true, action: { label: "Expand To" } });
  });

  it("never puts the new-flag march on the main row and offers Build and Aether", () => {
    const buttons = selectBarButtons(view({ actions: [act("march_attack_new_flag")], buildings: [act("build_mine")], crystal: [act("aether_lance")], tabs: ["actions", "buildings", "crystal"] }));
    expect(buttons.some((b) => b.kind === "action" && b.action.id === "march_attack_new_flag")).toBe(false);
    expect(buttons.flatMap((b) => (b.kind === "panel" ? [b.panel] : []))).toEqual(["build", "aether"]);
  });

  it("shows what a waystation gives, straight away", () => {
    const lines = [
      { html: "Waystation", kind: "section" as const },
      { html: '<span class="tile-overview-effect-name">Status:</span><span class="tile-overview-effect-mod is-positive">Active</span>', kind: "effect" as const },
      { html: '<span class="tile-overview-effect-name">Granted:</span><span class="tile-overview-effect-mod is-positive">+2,000 Coin</span>', kind: "effect" as const }
    ];
    expect(waystationFacts({ overviewLines: lines })).toEqual([{ label: "Waystation", value: "Active" }, { label: "Granted", value: "+2,000 Coin" }]);
    expect(waystationFacts({ overviewLines: lines.slice(0, 2).map((l, i) => (i === 1 ? { ...l, html: l.html.replace("Active", "Dormant") } : l)) })).toEqual([{ label: "Waystation", value: "Dormant" }, { label: "When claimed", value: "One random bonus" }]);
  });
});

describe("manpower orb", () => {
  it("clamps the fill and shows the refill only while below cap", () => {
    expect(orbFill(150, 100)).toBe(1);
    expect(orbFill(-5, 100)).toBe(0);
    expect(orbHtml({ manpower: 40, manpowerCap: 100, nextRefillAt: 30 * 60_000, nowMs: 0 })).toContain("refill 30m");
    expect(orbHtml({ manpower: 100, manpowerCap: 100, nextRefillAt: 30 * 60_000, nowMs: 0 })).not.toContain("refill");
  });
});
