import { describe, expect, it } from "vitest";
import { HOUSE_CHARGE_KINDS, type HouseChargeKind, type HouseChargeView } from "@border-empires/shared";
import { houseChargeLetter } from "./client-house-charges-letters.js";

const charge = (kind: HouseChargeKind, id: string): Pick<HouseChargeView, "id" | "kind" | "targets"> => ({
  id,
  kind,
  targets: kind === "RELIC" ? [] : [{ key: "a", name: "Vell", x: 1, y: 1 }, { key: "b", name: "Harrowmere", x: 2, y: 2 }]
});

// Owner 2026-11-19: each card's quote is the House's reason, with enough variance that each card feels unique.
describe("House Charge letters", () => {
  it("varies the House's reason between charges of the same kind", () => {
    for (const kind of HOUSE_CHARGE_KINDS) {
      const letters = new Set(Array.from({ length: 40 }, (_, index) => houseChargeLetter(charge(kind, `${kind}:${index}`))));
      expect(letters.size, kind).toBeGreaterThanOrEqual(3);
    }
  });

  it("asks to find a Reawakening's beacon only until it is found", () => {
    for (let index = 0; index < 20; index += 1) {
      const id = `RELIC:${index}`;
      expect(houseChargeLetter({ id, kind: "RELIC", targets: [{ key: "r", name: "Relic", x: 1, y: 1 }] })).not.toMatch(/\bfind\b/i);
    }
  });

  it("always gives the same charge the same reason", () => {
    for (const kind of HOUSE_CHARGE_KINDS) expect(houseChargeLetter(charge(kind, "x"))).toBe(houseChargeLetter(charge(kind, "x")));
  });

  it("names the charge's places, both towns for a Charter", () => {
    for (let index = 0; index < 20; index += 1) {
      const road = houseChargeLetter(charge("CHARTER", `c${index}`));
      expect(road).toContain("Vell");
      expect(road).toContain("Harrowmere");
      expect(houseChargeLetter(charge("SURVEY", `s${index}`))).toContain("Vell");
    }
  });
});
