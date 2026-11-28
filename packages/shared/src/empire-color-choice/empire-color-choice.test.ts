import { describe, expect, test } from "vitest";
import { MIN_EMPIRE_COLOR_DELTA_E, ciede2000, isEmpireColorFarEnough, type EmpireColorEntry } from "../empire-color-distance/empire-color-distance.js";
import {
  EMPIRE_COLOR_TAKEN_REASON,
  allEmpireColorCandidates,
  empireColorChecker,
  empireColorRejection,
  freeEmpireColors,
  nearestFreeEmpireColor,
  type EmpireColorsInUse
} from "./empire-color-choice.js";

const rosa: EmpireColorEntry = { playerId: "rosa", name: "Rosa", color: "#fabebe" };

/** Greedy packing of every candidate: no candidate keeps the distance any more. */
const fullMap = (): EmpireColorsInUse => {
  const empires: EmpireColorEntry[] = [];
  for (const hex of allEmpireColorCandidates()) {
    if (isEmpireColorFarEnough(hex, empires.map((empire) => empire.color))) empires.push({ playerId: `p${empires.length}`, color: hex });
  }
  return { exact: [], empires };
};

describe("empireColorRejection (the one rule, gateway and client)", () => {
  test("refuses an exact hold and a too-close pick; accepts a far one", () => {
    const inUse = { exact: ["#ffffff"], empires: [rosa] };
    expect(empireColorRejection("#FFFFFF", inUse)?.message).toBe(EMPIRE_COLOR_TAKEN_REASON);
    expect(empireColorRejection("#fabebe", inUse)?.message).toBe(EMPIRE_COLOR_TAKEN_REASON);
    expect(empireColorRejection("#f7b6d2", inUse)).toMatchObject({ message: "Too close to Rosa's colour.", clash: rosa });
    expect(empireColorRejection("#1f77b4", inUse)).toBeUndefined();
  });
});

describe("suggestions always pass the rule", () => {
  test("the nearest free colour is accepted and keeps the distance", () => {
    const inUse = { exact: [], empires: [rosa] };
    const suggestion = nearestFreeEmpireColor("#f7b6d2", inUse)!;
    expect(empireColorRejection(suggestion, inUse)).toBeUndefined();
    expect(ciede2000(suggestion, rosa.color)).toBeGreaterThanOrEqual(MIN_EMPIRE_COLOR_DELTA_E);
  });

  test("swatches are free and in palette order on an empty map", () => {
    const swatches = freeEmpireColors(6, { exact: [], empires: [] });
    expect(swatches).toEqual(allEmpireColorCandidates().slice(0, 6));
  });

  // Playtest 2026-11-28: no free candidate left, so the gateway suggested no
  // swatches and an unchecked "#ff00ff" it then refused itself.
  test("a full map still offers six swatches and a suggestion, all accepted", () => {
    const inUse = fullMap();
    expect(empireColorChecker(inUse).isFull()).toBe(true);
    const swatches = freeEmpireColors(6, inUse);
    expect(swatches).toHaveLength(6);
    for (const hex of swatches) expect(empireColorRejection(hex, inUse)).toBeUndefined();
    const suggestion = nearestFreeEmpireColor("#ff00ff", inUse)!;
    expect(empireColorRejection(suggestion, inUse)).toBeUndefined();
    // An exact match is still refused on a full map.
    expect(empireColorRejection(inUse.empires[0]!.color, inUse)?.message).toBe(EMPIRE_COLOR_TAKEN_REASON);
  });
});
