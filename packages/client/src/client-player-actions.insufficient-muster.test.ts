import { describe, expect, it } from "vitest";
import { explainActionFailureFromServer } from "./client-player-actions.js";

// 2026-11-12 playtest (pt-predator): a region attack was refused with "stage
// manpower on this tile first", though any flag within 10 tiles funds an
// attack and the real gap was the chosen effort.
describe("INSUFFICIENT_MUSTER explanation", () => {
  it("names the amount the server asked for and where it can come from", () => {
    expect(explainActionFailureFromServer("INSUFFICIENT_MUSTER", "need 120 mustered manpower to launch attack"))
      .toBe("Attack blocked: needs 120 manpower mustered on a flag within 10 tiles.");
  });

  it("still explains without an amount", () => {
    expect(explainActionFailureFromServer("INSUFFICIENT_MUSTER", "")).toBe("Attack blocked: not enough manpower mustered on a flag within 10 tiles.");
  });
});

it("explains muster limits using the actual flag cap", () => {
  expect(explainActionFailureFromServer("MUSTER_LIMIT", "max 2 muster tiles per player"))
    .toContain("up to 2 muster flags");
});

it("explains the truce lockout in player terms", () => {
  expect(explainActionFailureFromServer("TRUCE_LOCKED_OUT", ""))
    .toContain("24 hours after a break");
});

// Playtest 2026-11-16 (Lena): a failed accept read "Error DIPLOMACY_SETTLEMENT_FAILED: The deal fell through: ...".
it("explains a failed diplomacy settlement without the raw code", () => {
  const text = explainActionFailureFromServer("DIPLOMACY_SETTLEMENT_FAILED", "The deal fell through: Lena doesn't have 2 spare Biota supply slots for this deal.");
  expect(text).toBe("Couldn't accept the offer. The deal fell through: Lena doesn't have 2 spare Biota supply slots for this deal.");
  expect(text).not.toContain("DIPLOMACY_SETTLEMENT_FAILED");
});
