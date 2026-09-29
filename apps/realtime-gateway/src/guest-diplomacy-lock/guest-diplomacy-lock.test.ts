import { describe, expect, it, vi } from "vitest";

import { GUEST_DIPLOMACY_LOCKED_RESULT, lockedForGuests } from "./guest-diplomacy-lock.js";
import type { SocialActionResult } from "../social-state/social-state-types.js";

const okResult: SocialActionResult = { ok: true, notifyPlayerIds: [], payloadsByPlayerId: new Map() };

describe("lockedForGuests", () => {
  it("rejects a guest without calling the action, and counts it", () => {
    const action = vi.fn((_playerId: string, _target: string) => okResult);
    const metrics = { incrementGuestDiplomacyBlockedTotal: vi.fn() };

    expect(lockedForGuests({ isGuest: true }, action, metrics)("guest-1", "Target")).toBe(GUEST_DIPLOMACY_LOCKED_RESULT);
    expect(action).not.toHaveBeenCalled();
    expect(metrics.incrementGuestDiplomacyBlockedTotal).toHaveBeenCalledTimes(1);
  });

  it("passes everyone else straight through", () => {
    const action = vi.fn((_playerId: string, _target: string) => okResult);
    const metrics = { incrementGuestDiplomacyBlockedTotal: vi.fn() };

    expect(lockedForGuests({}, action, metrics)("player-1", "Target")).toBe(okResult);
    expect(lockedForGuests({ isGuest: false }, action, metrics)("player-1", "Target")).toBe(okResult);
    expect(action).toHaveBeenCalledWith("player-1", "Target");
    expect(metrics.incrementGuestDiplomacyBlockedTotal).not.toHaveBeenCalled();
  });
});
