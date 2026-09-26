import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, attentionText, errorMessage, formatAge, formatDuration } from "./client-duke-format.js";
import { D, H, NOW } from "./client-duke-fixtures.js";
import type { DukeAttentionKind } from "./client-duke-types.js";

describe("formatDuration / formatAge", () => {
  it("reads as a person would say it", () => {
    expect(formatDuration(0)).toBe("any moment now");
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(3 * H + 30 * 60_000)).toBe("3h 30m");
    expect(formatDuration(2 * D)).toBe("2d");
    expect(formatDuration(2 * D + 5 * H)).toBe("2d 5h");
  });
  it("age says just now under an hour", () => {
    expect(formatAge(NOW - 10 * 60_000, NOW)).toBe("just now");
    expect(formatAge(NOW - 26 * H, NOW)).toBe("1d 2h ago");
  });
});

describe("attentionText", () => {
  const item = (kind: DukeAttentionKind, at: number | null = null) => ({ kind, severity: "URGENT" as const, seasonId: "s1", label: "Aurelia", at });
  it("says what is coming and whether anything will meet it", () => {
    expect(attentionText(item("INCURSION_UNDEFENDED", NOW + 22 * H), NOW)).toBe("Craft arriving at Aurelia in 22h 0m. No Fighter there.");
    expect(attentionText(item("INCURSION_DEFENDED", NOW + 2 * D), NOW)).toBe("Craft arriving at Aurelia in 2d. Your Fighter will meet it.");
  });
  it("every kind reads as a sentence, never a code", () => {
    const kinds: DukeAttentionKind[] = ["INCURSION_UNDEFENDED", "INCURSION_DEFENDED", "LOW_STABILITY", "SLOT_EMPTY", "FIGHTER_DAMAGED", "COURT_OFFER", "PETITION_READY"];
    for (const kind of kinds) {
      const text = attentionText(item(kind, NOW + H), NOW);
      expect(text).toMatch(/[.]$/);
      expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
  });
});

describe("errorMessage", () => {
  it("every server code has a plain-language message with no raw code in it", () => {
    for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      expect(errorMessage({ code }, NOW)).toBe(text);
    }
  });
  it("covers every code the gateway can return", () => {
    const codes = ["NOT_A_DUKE", "INVALID", "NO_SUCH_SYSTEM", "SLOT_BUSY", "FIGHTER_CAP", "PROBE_STOCK_CAP", "NOTHING_TO_REPAIR", "NO_SUCH_BODY", "BODY_ALREADY_DEVELOPED", "NO_PROBE", "NO_FIGHTER", "TOO_MANY_FLIGHTS", "OWN_SECTOR", "NOT_SURVEYED", "COURT_HAS_FALLEN", "INSUFFICIENT_INFLUENCE", "NO_PENDING_OFFER", "NOTHING_TO_CANCEL"];
    for (const code of codes) expect(ERROR_MESSAGES[code], code).toBeTruthy();
  });
  it("the Petition limit says when it opens again; the Court lock says how long remains", () => {
    expect(errorMessage({ code: "PETITION_ALREADY_MADE_THIS_CYCLE", availableAt: NOW + 26 * H }, NOW)).toMatch(/1d 2h/);
    expect(errorMessage({ code: "LOCKED_BY_COURT_OFFER" }, NOW, NOW + 2 * D)).toMatch(/2d/);
  });
  it("an unknown code never leaks to the player", () => {
    expect(errorMessage({ code: "SOME_NEW_INTERNAL_CODE" }, NOW)).toBe("That could not be done right now.");
  });
});
