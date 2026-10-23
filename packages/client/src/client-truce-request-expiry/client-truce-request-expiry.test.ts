import { afterEach, describe, expect, it, vi } from "vitest";

import type { TruceRequest } from "../client-types.js";
import { dropExpiredTruceRequests, startTruceRequestExpiryTicker } from "./client-truce-request-expiry.js";

const request = (id: string, expiresAt: number): TruceRequest => ({
  id,
  fromPlayerId: "ai-17",
  toPlayerId: "player-2",
  createdAt: expiresAt - 5 * 60_000,
  expiresAt,
  durationHours: 12
});

describe("dropExpiredTruceRequests", () => {
  it("removes incoming and outgoing offers past their expiry and keeps live ones", () => {
    const state = {
      incomingTruceRequests: [request("stale-in", 1_000), request("live-in", 5_000)],
      outgoingTruceRequests: [request("stale-out", 2_000)]
    };
    expect(dropExpiredTruceRequests(state, 2_000)).toBe(true);
    expect(state.incomingTruceRequests.map((entry) => entry.id)).toEqual(["live-in"]);
    expect(state.outgoingTruceRequests).toEqual([]);
  });

  it("leaves state untouched when nothing expired", () => {
    const incoming = [request("live", 5_000)];
    const state = { incomingTruceRequests: incoming, outgoingTruceRequests: [] };
    expect(dropExpiredTruceRequests(state, 1_000)).toBe(false);
    expect(state.incomingTruceRequests).toBe(incoming);
  });
});

describe("startTruceRequestExpiryTicker", () => {
  afterEach(() => vi.useRealTimers());

  it("re-renders the HUD once the offer expires, and not before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const state = { incomingTruceRequests: [request("offer", 11_500)], outgoingTruceRequests: [] };
    const renderHud = vi.fn();
    startTruceRequestExpiryTicker(state, renderHud);
    vi.advanceTimersByTime(1_000);
    expect(renderHud).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(renderHud).toHaveBeenCalledTimes(1);
    expect(state.incomingTruceRequests).toEqual([]);
    vi.advanceTimersByTime(3_000);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });
});
