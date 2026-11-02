import { describe, expect, it } from "vitest";
import { WAR_SCAR_DURATION_MS, WAR_SCAR_FRESH_MS, WAR_SCAR_MAX_LEVEL, isWarScarFresh, liveWarScarLevel, warScarFieldsAfterBattle } from "./war-scars.js";

const NOW = 1_000_000;

describe("war scars", () => {
  it("scar the ground when a garrisoned tile is captured", () => {
    expect(warScarFieldsAfterBattle(undefined, { capturedGarrison: true, battle: true }, NOW)).toEqual({ warScarLevel: 1, warScarUntil: NOW + WAR_SCAR_DURATION_MS });
  });

  it("don't appear from a battle that captured no garrison", () => {
    expect(warScarFieldsAfterBattle(undefined, { capturedGarrison: false, battle: true }, NOW)).toEqual({});
  });

  it("deepen with every later battle, won or lost, and restart the 24h fade", () => {
    const scarred = { warScarLevel: 2, warScarUntil: NOW + 1_000 };
    expect(warScarFieldsAfterBattle(scarred, { capturedGarrison: false, battle: true }, NOW)).toEqual({ warScarLevel: 3, warScarUntil: NOW + WAR_SCAR_DURATION_MS });
    expect(warScarFieldsAfterBattle(scarred, { capturedGarrison: false, battle: false }, NOW)).toEqual(scarred);
  });

  it("cap at the max level", () => {
    const worst = { warScarLevel: WAR_SCAR_MAX_LEVEL, warScarUntil: NOW + 1 };
    expect(warScarFieldsAfterBattle(worst, { capturedGarrison: true, battle: true }, NOW).warScarLevel).toBe(WAR_SCAR_MAX_LEVEL);
  });

  it("fade completely after 24h, and start over from 1", () => {
    const faded = { warScarLevel: 4, warScarUntil: NOW };
    expect(liveWarScarLevel(faded, NOW)).toBe(0);
    expect(warScarFieldsAfterBattle(faded, { capturedGarrison: false, battle: true }, NOW)).toEqual({});
    expect(warScarFieldsAfterBattle(faded, { capturedGarrison: true, battle: true }, NOW).warScarLevel).toBe(1);
  });
});

describe("fresh war scars", () => {
  it("smoke for the first hours after the latest battle, then go cold", () => {
    const scars = warScarFieldsAfterBattle(undefined, { capturedGarrison: true, battle: true }, NOW);
    expect(isWarScarFresh(scars, NOW)).toBe(true);
    expect(isWarScarFresh(scars, NOW + WAR_SCAR_FRESH_MS - 1)).toBe(true);
    expect(isWarScarFresh(scars, NOW + WAR_SCAR_FRESH_MS)).toBe(false);
    expect(liveWarScarLevel(scars, NOW + WAR_SCAR_FRESH_MS)).toBe(1);
    // Another battle starts them smoking again.
    const again = warScarFieldsAfterBattle(scars, { capturedGarrison: false, battle: true }, NOW + WAR_SCAR_FRESH_MS * 3);
    expect(isWarScarFresh(again, NOW + WAR_SCAR_FRESH_MS * 3)).toBe(true);
  });
});
