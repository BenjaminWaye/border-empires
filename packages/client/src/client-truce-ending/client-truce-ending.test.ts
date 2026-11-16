import { describe, expect, it, vi } from "vitest";

import { isTruceEndingSoon, notifyTrucesEndingSoon, truceTimeLeftLabel, trucesEndingSoon } from "./client-truce-ending.js";

const H = 3_600_000;
const truce = (id: string, endsAt: number) => ({ otherPlayerId: id, otherPlayerName: id.toUpperCase(), startedAt: 0, endsAt });

describe("truce ending soon", () => {
  it("is the last two hours of a running truce", () => {
    expect(isTruceEndingSoon(truce("a", 2 * H + 1), 0)).toBe(false);
    expect(isTruceEndingSoon(truce("a", 2 * H), 0)).toBe(true);
    expect(isTruceEndingSoon(truce("a", 0), 0)).toBe(false);
    expect(trucesEndingSoon([truce("late", H), truce("soon", 60_000), truce("far", 9 * H)], 0).map((t) => t.otherPlayerId)).toEqual(["soon", "late"]);
  });

  it("labels the time left to the minute", () => {
    expect(truceTimeLeftLabel(H + 40 * 60_000, 0)).toBe("1h 40m");
    expect(truceTimeLeftLabel(2 * H, 0)).toBe("2h");
    expect(truceTimeLeftLabel(40 * 60_000 - 1, 0)).toBe("40m");
  });

  it("tells each truce end once", () => {
    const seen = new Set<string>();
    const deps = { markUnseen: (key: string) => !seen.has(key) && Boolean(seen.add(key)), pushFeed: vi.fn(), showAlert: vi.fn() };
    expect(notifyTrucesEndingSoon([truce("a", H)], 0, deps)).toBe(true);
    expect(notifyTrucesEndingSoon([truce("a", H)], 60_000, deps)).toBe(false);
    expect(deps.pushFeed).toHaveBeenCalledTimes(1);
    expect(deps.pushFeed).toHaveBeenCalledWith("Truce with A ends in 1h.");
    expect(deps.showAlert).toHaveBeenCalledWith("Truce ending", "Truce with A ends in 1h.");
  });
});
