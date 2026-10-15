import { describe, expect, it } from "vitest";
import { frontierAttackIsUndefended, isHoldingCapturedGround } from "./client-capture-hold.js";

const NOW = 1_000_000;

describe("frontierAttackIsUndefended", () => {
  it("is false for anything but FRONTIER", () => {
    expect(frontierAttackIsUndefended({ ownershipState: "SETTLED" }, undefined, NOW)).toBe(false);
    expect(frontierAttackIsUndefended(undefined, undefined, NOW)).toBe(false);
  });

  it("treats plain FRONTIER as undefended and a held FRONTIER tile as defended", () => {
    expect(frontierAttackIsUndefended({ ownershipState: "FRONTIER" }, undefined, NOW)).toBe(true);
    expect(frontierAttackIsUndefended({ ownershipState: "FRONTIER", captureHoldUntil: NOW + 1 }, undefined, NOW)).toBe(false);
    expect(frontierAttackIsUndefended({ ownershipState: "FRONTIER", captureHoldUntil: NOW - 1 }, undefined, NOW)).toBe(true);
  });

  // The fight was rolled at launch: once locked below 1 it stays a battle
  // even after the hold window has run out mid-attack.
  it("trusts the attack's locked win chance over the hold's live state", () => {
    expect(frontierAttackIsUndefended({ ownershipState: "FRONTIER", captureHoldUntil: NOW - 1 }, 0.5, NOW)).toBe(false);
    expect(frontierAttackIsUndefended({ ownershipState: "FRONTIER", captureHoldUntil: NOW + 1 }, 1, NOW)).toBe(true);
  });
});

describe("isHoldingCapturedGround", () => {
  it("shows troops only on visible held FRONTIER tiles", () => {
    expect(isHoldingCapturedGround({ ownershipState: "FRONTIER", captureHoldUntil: NOW + 1 }, NOW)).toBe(true);
    expect(isHoldingCapturedGround({ ownershipState: "FRONTIER", captureHoldUntil: NOW + 1, fogged: true }, NOW)).toBe(false);
    expect(isHoldingCapturedGround({ ownershipState: "SETTLED", captureHoldUntil: NOW + 1 }, NOW)).toBe(false);
    expect(isHoldingCapturedGround({ ownershipState: "FRONTIER", captureHoldUntil: NOW }, NOW)).toBe(false);
  });
});
