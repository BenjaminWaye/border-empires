import { describe, expect, test } from "vitest";
import { MIN_EMPIRE_COLOR_DELTA_E, ciede2000 } from "@border-empires/shared";
import { ACTIVE_EMPIRE_WINDOW_MS, buildTakenColorSet, contestPlayerIdsFrom, createContestPlayerIdsSource } from "./build-taken-color-set.js";
import { colorPickRejection } from "./color-pick-rejection.js";
import { assignUniqueColor, pickSuggestedPalette, suggestAlternative } from "./player-color-allocation.js";
import { TakenColorSet } from "./taken-color-set.js";

const NOW = 1_800_000_000_000;

const takenWith = (empires: Array<{ playerId: string; name?: string; color: string }>): TakenColorSet =>
  new TakenColorSet(empires.map((empire) => empire.color), empires);

describe("buildTakenColorSet", () => {
  const deps = {
    now: () => NOW,
    profileStore: {
      listAllNamed: async () => [
        { playerId: "me", name: "Me", tileColor: "#00ff00", updatedAt: NOW },
        { playerId: "rosa", name: "Rosa", tileColor: "#FABEBE", updatedAt: NOW - 1000 },
        { playerId: "old", name: "Old", tileColor: "#1f77b4", updatedAt: NOW - ACTIVE_EMPIRE_WINDOW_MS - 1 }
      ]
    },
    profileOverrides: { entries: () => new Map([["ai-1", { tileColor: "#3f51b5" }]]).entries() }
  };

  test("active empires: recent profiles and live overrides, never the player themself", async () => {
    const taken = await buildTakenColorSet("me", deps);
    const active = taken.activeEmpires.map((empire) => `${empire.playerId}:${empire.name}:${empire.color}`).sort();
    expect(active).toEqual(["ai-1:House Brassmoor:#3f51b5", "rosa:Rosa:#fabebe"]);
  });

  test("an inactive profile still blocks its exact colour", async () => {
    const taken = await buildTakenColorSet("me", deps);
    expect(taken.has("#1f77b4")).toBe(true);
    expect(taken.has("#00ff00")).toBe(false);
  });
});

// First-15 round 1 (2026-11-28): every profile of the last 14 days (abandoned
// "Play now" guests, players of other contests) held a colour, so a new
// player was offered one swatch. Only the current contest's empires count now.
describe("buildTakenColorSet scoped to the current contest", () => {
  const crowd = Array.from({ length: 60 }, (_, index) => ({
    playerId: `guest-${index}`,
    name: `House Guest ${index}`,
    tileColor: `#${(index * 4).toString(16).padStart(2, "0")}${(255 - index * 4).toString(16).padStart(2, "0")}80`,
    updatedAt: NOW - 1000
  }));
  const deps = (contest: ReadonlySet<string> | undefined) => ({
    now: () => NOW,
    profileStore: { listAllNamed: async () => [...crowd, { playerId: "rosa", name: "Rosa", tileColor: "#fabebe", updatedAt: NOW - ACTIVE_EMPIRE_WINDOW_MS - 1 }] },
    profileOverrides: { entries: () => new Map([["guest-live", { name: "House Idle", tileColor: "#3f51b5" }], ["ai-1", { tileColor: "#e6194b" }]]).entries() },
    contestPlayerIds: async () => contest
  });

  test("only contest empires hold a colour, even one whose player has been away", async () => {
    const taken = await buildTakenColorSet("me", deps(new Set(["rosa", "ai-1"])));
    expect(taken.activeEmpires.map((empire) => empire.playerId).sort()).toEqual(["ai-1", "rosa"]);
    expect(taken.has(crowd[0]!.tileColor)).toBe(false);
    expect(taken.has("#3f51b5")).toBe(false);
    expect(taken.has("#fabebe")).toBe(true);
    expect(pickSuggestedPalette(6, taken)).toHaveLength(6);
  });

  test("falls back to the 14-day rule while the contest is unknown", async () => {
    const taken = await buildTakenColorSet("me", deps(undefined));
    expect(taken.has(crowd[0]!.tileColor)).toBe(true);
    expect(taken.activeEmpires.some((empire) => empire.playerId === "rosa")).toBe(false);
    expect(taken.activeEmpires.some((empire) => empire.playerId === "guest-live")).toBe(true);
  });
});

describe("contestPlayerIdsFrom", () => {
  test("lists the active contest's leaderboard empires", async () => {
    const ids = await contestPlayerIdsFrom(async () => ({ status: "active", overall: [{ id: "a" }, { id: "ai-2" }] }));
    expect([...(ids ?? [])]).toEqual(["a", "ai-2"]);
  });

  test("unknown when no contest is running, or the simulation fails or is slow", async () => {
    await expect(contestPlayerIdsFrom(async () => ({ status: "pending", overall: [] }))).resolves.toBeUndefined();
    await expect(contestPlayerIdsFrom(async () => { throw new Error("down"); })).resolves.toBeUndefined();
    await expect(contestPlayerIdsFrom(() => new Promise(() => undefined), 5)).resolves.toBeUndefined();
  });
});

// The lookup runs on the login path; after the first answer a login must never wait on the simulation.
describe("createContestPlayerIdsSource", () => {
  test("serves the last answer at once and refreshes it in the background, one lookup at a time", async () => {
    let clock = 0;
    let calls = 0;
    let release: (() => void) | undefined;
    const source = createContestPlayerIdsSource(
      async () => {
        calls += 1;
        if (calls > 1) await new Promise<void>((resolve) => (release = resolve));
        return { status: "active", overall: [{ id: `p${calls}` }] };
      },
      { now: () => clock, refreshMs: 1_000 }
    );
    expect([...((await source()) ?? [])]).toEqual(["p1"]);
    clock = 500;
    expect([...((await source()) ?? [])]).toEqual(["p1"]);
    expect(calls).toBe(1);
    clock = 2_000;
    expect([...((await source()) ?? [])]).toEqual(["p1"]); // stale answer served while the refresh waits
    expect([...((await source()) ?? [])]).toEqual(["p1"]);
    expect(calls).toBe(2);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...((await source()) ?? [])]).toEqual(["p2"]);
  });
});

describe("colorPickRejection", () => {
  const taken = takenWith([{ playerId: "rosa", name: "Rosa", color: "#fabebe" }]);

  test("rejects a pale pink next to a rival's pale pink (playtest 2026-11-27) with a terse reason", () => {
    // #f7b6d2 is 9.4 from #fabebe: the pair the playtester mixed up.
    const rejection = colorPickRejection("#f7b6d2", taken);
    expect(rejection?.message).toBe("Too close to Rosa's colour.");
    expect(ciede2000(rejection!.suggestion, "#fabebe")).toBeGreaterThanOrEqual(MIN_EMPIRE_COLOR_DELTA_E);
  });

  test("an exact match is still 'already taken'", () => {
    expect(colorPickRejection("#fabebe", taken)?.message).toBe("That colour is already taken by another empire.");
  });

  test("accepts a colour far enough from every active empire", () => {
    expect(colorPickRejection("#1f77b4", taken)).toBeUndefined();
  });

  test("a plain Set only checks exact colours", () => {
    expect(colorPickRejection("#f7b6d2", new Set(["#fabebe"]))).toBeUndefined();
  });

  test("names ending in s take a bare apostrophe", () => {
    const rejection = colorPickRejection("#f7b6d2", takenWith([{ playerId: "silas", name: "Silas", color: "#fabebe" }]));
    expect(rejection?.message).toBe("Too close to Silas' colour.");
  });
});

describe("allocation keeps the minimum distance", () => {
  const taken = takenWith([
    { playerId: "a", color: "#fabebe" },
    { playerId: "b", color: "#1f77b4" },
    { playerId: "c", color: "#f3c300" },
    { playerId: "d", color: "#00ffff" }
  ]);
  const farFromAll = (hex: string): boolean => taken.activeEmpires.every((empire) => ciede2000(hex, empire.color) >= MIN_EMPIRE_COLOR_DELTA_E);

  test("suggested swatches are all far enough", () => {
    const suggestions = pickSuggestedPalette(6, taken);
    expect(suggestions).toHaveLength(6);
    for (const hex of suggestions) expect(farFromAll(hex)).toBe(true);
  });

  test("a suggested alternative is far enough", () => {
    expect(farFromAll(suggestAlternative("#f7b6d2", taken))).toBe(true);
  });

  test("an auto-assigned guest colour is far enough", () => {
    for (const seed of ["guest-1", "guest-2", "guest-3"]) expect(farFromAll(assignUniqueColor(seed, taken))).toBe(true);
  });

  test("a full map still hands a guest a colour nobody holds exactly", () => {
    const crowded = takenWith(Array.from({ length: 400 }, (_, i) => ({ playerId: `p${i}`, color: `#${(i * 40_000 + 0x101010).toString(16).slice(-6).padStart(6, "0")}` })));
    const color = assignUniqueColor("guest-9", crowded);
    expect(crowded.has(color)).toBe(false);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
