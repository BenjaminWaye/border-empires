import { isEmpireColorFarEnough, hueWheelCandidates, EMPIRE_COLOR_PALETTE, type EmpireColorEntry } from "@border-empires/shared";
import { describe, expect, test, vi } from "vitest";
import { colorPickRejection } from "../player-color-allocation/color-pick-rejection.js";
import { pickSuggestedPalette, suggestAlternative } from "../player-color-allocation/player-color-allocation.js";
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
