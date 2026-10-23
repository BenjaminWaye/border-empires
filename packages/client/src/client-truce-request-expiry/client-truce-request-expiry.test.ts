import { afterEach, describe, expect, it, vi } from "vitest";

import type { TruceRequest } from "../client-types.js";
import { createTruceRequestExpiry, startTruceRequestExpiryTicker } from "./client-truce-request-expiry.js";

const TTL_MS = 5 * 60_000;

// Server timestamps: the offer was created at serverNow and lives TTL_MS.
const request = (id: string, serverNow = 1_000_000): TruceRequest => ({
  id,
  fromPlayerId: "ai-17",
  toPlayerId: "player-2",
  createdAt: serverNow,
  expiresAt: serverNow + TTL_MS,
  durationHours: 12
});

describe("createTruceRequestExpiry", () => {
  it("drops incoming and outgoing offers once their lifetime has passed since first seen", () => {
    const dropExpired = createTruceRequestExpiry();
    const state = { incomingTruceRequests: [request("in")], outgoingTruceRequests: [request("out")] };
    expect(dropExpired(state, 0)).toBe(false);
    expect(dropExpired(state, TTL_MS - 1)).toBe(false);
    expect(dropExpired(state, TTL_MS)).toBe(true);
    expect(state.incomingTruceRequests).toEqual([]);
    expect(state.outgoingTruceRequests).toEqual([]);
  });

  it("keeps a fresh offer on a device whose clock runs well ahead of the server", () => {
    const dropExpired = createTruceRequestExpiry();
    const fastDeviceNow = 1_000_000 + 10 * 60_000;
    const state = { incomingTruceRequests: [request("offer")], outgoingTruceRequests: [] };
    expect(dropExpired(state, fastDeviceNow)).toBe(false);
    expect(dropExpired(state, fastDeviceNow + TTL_MS - 1)).toBe(false);
    expect(state.incomingTruceRequests.map((entry) => entry.id)).toEqual(["offer"]);
  });

  it("times each offer from when it arrived, not from when the first one did", () => {
    const dropExpired = createTruceRequestExpiry();
    const state = { incomingTruceRequests: [request("early")], outgoingTruceRequests: [] };
    dropExpired(state, 0);
    state.incomingTruceRequests = [...state.incomingTruceRequests, request("late")];
    dropExpired(state, 60_000);
    expect(dropExpired(state, TTL_MS)).toBe(true);
    expect(state.incomingTruceRequests.map((entry) => entry.id)).toEqual(["late"]);
  });

  it("leaves an offer with missing timestamps for the server to judge", () => {
    const dropExpired = createTruceRequestExpiry();
    const malformed = { ...request("bad"), expiresAt: undefined } as unknown as TruceRequest;
    const state = { incomingTruceRequests: [malformed], outgoingTruceRequests: [] };
    expect(dropExpired(state, 0)).toBe(false);
    expect(dropExpired(state, 10 * TTL_MS)).toBe(false);
    expect(state.incomingTruceRequests).toHaveLength(1);
  });
});

describe("startTruceRequestExpiryTicker", () => {
  afterEach(() => vi.useRealTimers());

  it("re-renders the HUD and the counter-offer screen once, when the offer expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const state = { incomingTruceRequests: [request("offer")], outgoingTruceRequests: [] };
    const renderHud = vi.fn();
    const refreshTradeScreen = vi.fn();
    startTruceRequestExpiryTicker(state, renderHud, refreshTradeScreen);
    vi.advanceTimersByTime(TTL_MS);
    expect(renderHud).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(renderHud).toHaveBeenCalledTimes(1);
    expect(refreshTradeScreen).toHaveBeenCalledTimes(1);
    expect(state.incomingTruceRequests).toEqual([]);
    vi.advanceTimersByTime(5_000);
    expect(renderHud).toHaveBeenCalledTimes(1);
    vi.clearAllTimers();
  });
});
