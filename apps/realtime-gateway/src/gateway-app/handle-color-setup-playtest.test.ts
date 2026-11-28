import { isEmpireColorFarEnough, hueWheelCandidates, EMPIRE_COLOR_PALETTE, type EmpireColorEntry } from "@border-empires/shared";
import { describe, expect, test, vi } from "vitest";
import { colorPickRejection } from "../player-color-allocation/color-pick-rejection.js";
import { pickSuggestedPalette, suggestAlternative } from "../player-color-allocation/player-color-allocation.js";
import { buildTakenColorSet } from "../player-color-allocation/build-taken-color-set.js";
import { TakenColorSet, colorsInUseOf } from "../player-color-allocation/taken-color-set.js";
import { handleSetProfileMessage, type SetProfileMessageDeps } from "./handle-set-profile-message.js";

// First-15-minutes playtest 2026-11-28, "Found your first standard": with
// 20 AI empires plus every guest active in the last 14 days, the swatch and
// suggestion candidates were all too close to someone. The gateway then
// suggested no swatches and an unchecked "#ff00ff", which it refused itself
// ("Too close to Edvin's colour").

/** Active empires packed greedily over the old candidates (palette + hue wheel): none of those is free any more. */
const crowdedEmpires = (): EmpireColorEntry[] => {
  const empires: EmpireColorEntry[] = [];
  for (const hex of [...EMPIRE_COLOR_PALETTE, ...hueWheelCandidates(0)]) {
    if (isEmpireColorFarEnough(hex, empires.map((empire) => empire.color))) empires.push({ playerId: `p${empires.length}`, name: `House Noname ${empires.length}`, color: hex });
  }
  return empires;
};
const crowdedTaken = (): TakenColorSet => {
  const empires = crowdedEmpires();
  return new TakenColorSet(empires.map((empire) => empire.color), empires);
};

describe("crowded sector colour setup", () => {
  test("the suggestion is always a colour the gateway accepts", () => {
    const taken = crowdedTaken();
    expect(taken.activeEmpires.length).toBeGreaterThan(30);
    for (const desired of ["#ff8c00", "#38b000", "#ffffff", "#909090", "#600030"]) {
      const suggestion = suggestAlternative(desired, taken);
      expect(colorPickRejection(suggestion, taken)).toBeUndefined();
    }
  });

  test("six swatches are offered and every one is accepted", () => {
    const taken = crowdedTaken();
    const swatches = pickSuggestedPalette(6, taken);
    expect(swatches).toHaveLength(6);
    for (const hex of swatches) expect(colorPickRejection(hex, taken)).toBeUndefined();
  });

  test("a refused SET_PROFILE writes nothing and sends the set it was checked against", async () => {
    const taken = crowdedTaken();
    const sent: Record<string, unknown>[] = [];
    const setProfile = vi.fn();
    const upsert = vi.fn();
    const runExclusive = vi.fn();
    const deps = {
      playerId: "new-player",
      displayName: "Kalmar Union",
      color: taken.activeEmpires[0]!.color,
      canToggleFog: false,
      buildTakenColorSet: async () => taken,
      incrementColorCollisionRejectedTotal: () => {},
      buildTakenNameSet: async () => new Set<string>(),
      incrementDisplayNameCollisionRejectedTotal: () => {},
      runExclusive,
      profileStore: { get: async () => undefined, setProfile },
      invalidateProfileCache: () => {},
      profileOverrides: { upsert },
      getCurrentSeasonId: async () => "s1",
      renamePlayer: () => {},
      sendJson: (payload: unknown) => sent.push(payload as Record<string, unknown>),
      allSockets: () => [],
      socketsForPlayer: () => [],
      queueOrSendSessionPayload: () => {},
      preSerializeBroadcast: (payload: Record<string, unknown>) => payload
    } as unknown as SetProfileMessageDeps;
    await handleSetProfileMessage(deps);
    // No House, name or colour is created or reserved by a refusal.
    expect(setProfile).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(runExclusive).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    const error = sent[0]!;
    expect(error).toMatchObject({ type: "ERROR", code: "COLOR_TAKEN" });
    expect(error.colorsInUse).toEqual(colorsInUseOf(taken));
    expect(colorPickRejection(error.suggestion as string, taken)).toBeUndefined();
  });
});

// r1 newcomer: "Too close to Meadowbrook's colour" while her own House was
// called Meadowbrook. The Meadowbrook that blocked her was an earlier
// playtest account (run 5, 2026-11-25, pink), still inside the 14-day active
// window; pt-snacker hit it before she played. This pins down that a refused
// pick persists nothing and that a player is never checked against herself.
describe("a refused pick never blocks the player who made it", () => {
  test("refuse, then retry: no House is written and the player's own colour never counts", async () => {
    const stored = new Map<string, { playerId: string; name?: string; tileColor?: string; updatedAt?: number }>([
      ["old-meadowbrook", { playerId: "old-meadowbrook", name: "Meadowbrook", tileColor: "#f7b6d2", updatedAt: Date.now() }],
      // The new player's provisional colour from login, before setup.
      ["me", { playerId: "me", tileColor: "#de3565", updatedAt: Date.now() }]
    ]);
    const overrides = new Map<string, { name?: string; tileColor?: string }>([["me", { tileColor: "#de3565" }]]);
    const takenFor = (excludePlayerId: string) =>
      buildTakenColorSet(excludePlayerId, {
        profileStore: { listAllNamed: async () => [...stored.values()] },
        profileOverrides: { entries: () => overrides.entries() }
      });
    const sent: Record<string, unknown>[] = [];
    const setProfile = vi.fn(async (playerId: string, name: string, tileColor: string) => {
      stored.set(playerId, { playerId, name, tileColor, updatedAt: Date.now() });
      return { name, tileColor, profileComplete: true };
    });
    const deps = (color: string): SetProfileMessageDeps => ({
      playerId: "me",
      displayName: "Meadowbrook",
      color,
      canToggleFog: false,
      buildTakenColorSet: takenFor,
      incrementColorCollisionRejectedTotal: () => {},
      buildTakenNameSet: async () => new Set<string>(),
      incrementDisplayNameCollisionRejectedTotal: () => {},
      runExclusive: (task) => task(),
      profileStore: { get: async (id) => stored.get(id), setProfile },
      invalidateProfileCache: () => {},
      profileOverrides: { upsert: (id, patch) => { overrides.set(id, { ...overrides.get(id), ...patch }); return overrides.get(id)!; } },
      getCurrentSeasonId: async () => "s1",
      renamePlayer: () => {},
      sendJson: (payload) => sent.push(payload as Record<string, unknown>),
      allSockets: () => [],
      socketsForPlayer: () => [],
      queueOrSendSessionPayload: () => {},
      preSerializeBroadcast: (payload) => payload
    });

    // Pastel pink beside the other Meadowbrook's pink: refused, nothing written.
    await handleSetProfileMessage(deps("#fbb4d0"));
    expect(sent.at(-1)).toMatchObject({ code: "COLOR_TAKEN", message: "Too close to Meadowbrook's colour." });
    expect(setProfile).not.toHaveBeenCalled();
    expect(stored.get("me")).toEqual({ playerId: "me", tileColor: "#de3565", updatedAt: expect.any(Number) });
    expect(overrides.get("me")).toEqual({ tileColor: "#de3565" });

    // Her own provisional colour (and anything near it) never blocks her.
    const ownSet = await takenFor("me");
    expect(colorsInUseOf(ownSet).empires.map((empire) => empire.playerId)).not.toContain("me");
    expect(colorsInUseOf(ownSet).exact).not.toContain("#de3565");
    expect(colorPickRejection("#de3565", ownSet)).toBeUndefined();

    // The suggestion she was given goes through on the next try.
    const suggestion = sent.at(-1)!.suggestion as string;
    await handleSetProfileMessage(deps(suggestion));
    expect(setProfile).toHaveBeenCalledWith("me", "Meadowbrook", suggestion, undefined, undefined);
    expect(sent.filter((payload) => payload.type === "ERROR")).toHaveLength(1);
  });
});
