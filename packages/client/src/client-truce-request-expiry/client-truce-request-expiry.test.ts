import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClientState } from "../client-state/client-state.js";
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

const noTruces = () => ({ activeTruces: [], me: "", notifiedIncomingDiplomacyRequestIds: new Set<string>(), notifiedDiplomacyIdsLoadedFor: "" });

describe("startTruceRequestExpiryTicker", () => {
  afterEach(() => vi.useRealTimers());

  it("re-renders the HUD and the counter-offer screen once, when the offer expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const state = { incomingTruceRequests: [request("offer")], outgoingTruceRequests: [], captureAlert: undefined, ...noTruces() };
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

// Playtest 2026-11-12: an offer you sent that ran out just vanished, with no word to you.
describe("your own truce offer expiring", () => {
  afterEach(() => vi.useRealTimers());

  it("tells you, in the feed and a popup; an incoming offer expiring does not", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const state = {
      incomingTruceRequests: [request("in")],
      outgoingTruceRequests: [{ ...request("out"), toName: "Tom" }],
      captureAlert: undefined as ClientState["captureAlert"],
      ...noTruces()
    };
    const pushFeed = vi.fn();
    startTruceRequestExpiryTicker(state, vi.fn(), vi.fn(), pushFeed);
    vi.advanceTimersByTime(TTL_MS + 1_000);
    expect(pushFeed).toHaveBeenCalledTimes(1);
    expect(pushFeed).toHaveBeenCalledWith("Your 12h truce offer to Tom expired unanswered.");
    expect(state.captureAlert).toEqual(expect.objectContaining({ title: "Truce offer expired", detail: "Your 12h truce offer to Tom expired unanswered." }));
    vi.clearAllTimers();
  });
});

it.each(["paying", "refunding"] as const)("keeps %s treaty offers available after their normal expiry", settlementPhase => {
  const dropExpired = createTruceRequestExpiry();
  const state = { incomingTruceRequests: [{ ...request("in"), settlementPhase }], outgoingTruceRequests: [{ ...request("out"), settlementPhase }] };
  expect(dropExpired(state, 0)).toBe(false);
  expect(dropExpired(state, TTL_MS * 100)).toBe(false);
  expect(state.incomingTruceRequests).toHaveLength(1);
  expect(state.outgoingTruceRequests).toHaveLength(1);
});

// Playtest run 2: truces ran out with no warning.
describe("a running truce entering its last two hours", () => {
  afterEach(() => vi.useRealTimers());

  it("warns once in the feed and a popup, and again only after an extension moves the end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const truce = { otherPlayerId: "ai-3", otherPlayerName: "Milo", startedAt: 0, endsAt: 3 * 3_600_000, createdByPlayerId: "me" };
    const state = { incomingTruceRequests: [], outgoingTruceRequests: [], captureAlert: undefined as ClientState["captureAlert"], ...noTruces(), activeTruces: [truce] };
    const pushFeed = vi.fn();
    const renderHud = vi.fn();
    startTruceRequestExpiryTicker(state, renderHud, vi.fn(), pushFeed);
    vi.advanceTimersByTime(3_600_000 - 1_000);
    expect(pushFeed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(pushFeed).toHaveBeenCalledWith("Truce with Milo ends in 2h.");
    expect(state.captureAlert).toEqual(expect.objectContaining({ title: "Truce ending" }));
    expect(renderHud).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30 * 60_000);
    expect(pushFeed).toHaveBeenCalledTimes(1);
    state.activeTruces = [{ ...truce, endsAt: truce.endsAt + 12 * 3_600_000 }];
    vi.advanceTimersByTime(12 * 3_600_000);
    expect(pushFeed).toHaveBeenCalledTimes(2);
    vi.clearAllTimers();
  });
});
