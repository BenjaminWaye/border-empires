import { describe, expect, it } from "vitest";
import type { HouseChargeView } from "@border-empires/shared";
import { houseChargeCardRule } from "./client-house-charge-cards.js";
import { CORRECTION_OFFENCES, HOUSE_CHARGE_KIND_LABEL, houseChargeLetter, houseChargeObjective, houseChargeProgress } from "./client-house-charges-labels.js";

const base = { rarity: "RARE", renown: 2, kept: true, held: false, size: 0, searchCircle: { x: 0, y: 0, radius: 9 } } as const;
const writ: HouseChargeView = { ...base, id: "CORRECTION:abc", kind: "CORRECTION", title: "The Correction of House Varn", targets: [{ key: "house:p2", name: "Varn", x: 36, y: 27 }] };
const seats: HouseChargeView = { ...base, id: "METROPOLIS:def", kind: "METROPOLIS", title: "Three Metropolises of Aldmoor", targets: [{ key: "metropolis:i1", name: "Aldmoor", x: 16, y: 18 }], size: 2 };

describe("Writ of Correction text", () => {
  it("states the objective against any AFC the rival founded", () => {
    expect(HOUSE_CHARGE_KIND_LABEL.CORRECTION).toBe("Writ of Correction");
    expect(houseChargeObjective(writ)).toBe("Capture and garrison an AFC founded by House Varn, and hold it to the end of the contest.");
  });

  it("carries the House's letter with one fixed offence", () => {
    const letter = houseChargeLetter(writ);
    expect(letter).toContain("House Varn ");
    expect(CORRECTION_OFFENCES.some((offence) => letter.includes(offence))).toBe(true);
    expect(houseChargeLetter(writ)).toBe(letter);
  });

  it("tracks garrisoned, lost and not garrisoned", () => {
    expect(houseChargeProgress(writ)).toBe("House Varn's AFC: not garrisoned");
    expect(houseChargeProgress({ ...writ, held: true, size: 1 })).toBe("House Varn's AFC garrisoned");
    expect(houseChargeProgress({ ...writ, lostAt: 5 })).toBe("House Varn's AFC lost");
    expect(houseChargeCardRule({ kind: "CORRECTION", places: ["Varn"] })).toBe("Pressed a grievance against House Varn, took an AFC it founded and held it to the end of the contest.");
  });
});

describe("Three Metropolises text", () => {
  it("names the landmass, counts Metropolises held and has a letter", () => {
    expect(houseChargeObjective(seats)).toBe("Hold 3 towns on Aldmoor and grow each one to a Metropolis.");
    expect(houseChargeProgress(seats)).toBe("2 of 3 Metropolises held");
    expect(houseChargeLetter(seats)).toContain("Aldmoor");
    expect(houseChargeCardRule({ kind: "METROPOLIS", places: ["Aldmoor"] })).toBe("Raised three towns on Aldmoor to Metropolises and held them to the end of the contest.");
  });

  it("gives every charge kind the House's reason for entrusting it, naming its places", () => {
    for (const kind of ["CHARTER", "SEAT", "SURVEY", "DESERT", "TUNDRA", "RELIC"] as const) {
      expect(houseChargeLetter({ ...seats, kind }).length).toBeGreaterThan(40);
    }
    expect(houseChargeLetter({ ...seats, kind: "SURVEY" })).toContain("Aldmoor");
  });
});
