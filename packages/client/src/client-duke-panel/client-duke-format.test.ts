import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, choiceBanner, errorMessage, formatAge, formatDuration } from "./client-duke-format.js";
import { NOW, dukeStatus } from "./client-duke-fixtures.js";

const H = 60 * 60 * 1000;

describe("formatDuration / formatAge", () => {
  it("reads as a person would say it", () => {
    expect(formatDuration(0)).toBe("any moment now");
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(3 * H + 30 * 60_000)).toBe("3h 30m");
    expect(formatDuration(2 * 24 * H)).toBe("2d");
    expect(formatDuration(2 * 24 * H + 5 * H)).toBe("2d 5h");
  });
  it("age says just now under an hour", () => {
    expect(formatAge(NOW - 10 * 60_000, NOW)).toBe("just now");
    expect(formatAge(NOW - 26 * H, NOW)).toBe("1d 2h ago");
  });
});

describe("choiceBanner", () => {
  it("READY tells the player they get one choice", () => {
    const b = choiceBanner(dukeStatus(), NOW);
    expect(b.state).toBe("READY");
    expect(b.headline).toBe("Choose one action this Cycle");
    expect(b.detail).toMatch(/Invest, Petition the Senate, or Give an order/);
  });
  it("USED says when the next choice opens and that free actions still work", () => {
    const b = choiceBanner(dukeStatus({ gate: { available: false, availableAt: NOW + 4 * 24 * H, cycleMs: 1 } }), NOW);
    expect(b.state).toBe("USED");
    expect(b.headline).toBe("Your action is used");
    expect(b.detail).toMatch(/4d/);
    expect(b.detail).toMatch(/always free/);
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
  it("the weekly gate says when the next choice opens", () => {
    expect(errorMessage({ code: "ACTION_ALREADY_TAKEN_THIS_CYCLE", availableAt: NOW + 26 * H }, NOW)).toMatch(/1d 2h/);
    expect(errorMessage({ code: "ACTION_ALREADY_TAKEN_THIS_CYCLE" }, NOW)).toMatch(/used your action/);
  });
  it("the Court lock says how long remains", () => {
    expect(errorMessage({ code: "LOCKED_BY_COURT_OFFER" }, NOW, NOW + 2 * 24 * H)).toMatch(/2d/);
  });
  it("an unknown code never leaks to the player", () => {
    const text = errorMessage({ code: "SOME_NEW_INTERNAL_CODE" }, NOW);
    expect(text).toBe("That could not be done right now.");
  });
});
