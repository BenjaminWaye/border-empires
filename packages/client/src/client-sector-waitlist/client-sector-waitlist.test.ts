import { describe, expect, it, vi } from "vitest";

import { createSectorWaitlistController, sectorWaitlistButtonLabel } from "./client-sector-waitlist.js";

const makeState = () => ({ authEmail: "duke@example.test", seasonFull: true, seasonFullNotifyAcknowledged: false, sectorWaitlistCount: -1, sectorWaitlistJoinFailed: false });

const jsonResponse = (body: unknown) => ({ json: async () => body }) as unknown as Response;

describe("sector waitlist controller", () => {
  it("joins the waitlist with the bearer token and records the queue size", async () => {
    const state = makeState();
    const sync = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, seasonId: "s1", waitingCount: 4, joined: true }));
    const controller = createSectorWaitlistController({ state, wsUrl: "wss://api.example.test/ws", getIdToken: async () => "tok", sync, fetchImpl });

    expect(await controller.join()).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringMatching(/\/sector\/waitlist$/), { method: "POST", headers: { authorization: "Bearer tok" } });
    expect(state).toMatchObject({ seasonFullNotifyAcknowledged: true, sectorWaitlistCount: 4 });
    expect(sync).toHaveBeenCalled();
  });

  it("does not mark the player as waitlisted when the server refuses", async () => {
    const state = makeState();
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false, error: "account_required" }));
    const controller = createSectorWaitlistController({ state, wsUrl: "wss://api.example.test/ws", getIdToken: async () => "tok", sync: vi.fn(), fetchImpl });

    expect(await controller.join()).toBe(false);
    expect(state.seasonFullNotifyAcknowledged).toBe(false);
    expect(state.sectorWaitlistJoinFailed).toBe(true);
    expect(sectorWaitlistButtonLabel(state)).toBe("Couldn't join the waitlist. Tap to try again");
  });

  it("reports a failed join when the request throws, and clears it after a later success", async () => {
    const state = makeState();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse({ ok: true, seasonId: "s1", waitingCount: 1, joined: true }));
    const controller = createSectorWaitlistController({ state, wsUrl: "wss://api.example.test/ws", getIdToken: async () => "tok", sync: vi.fn(), fetchImpl });

    expect(await controller.join()).toBe(false);
    expect(state.sectorWaitlistJoinFailed).toBe(true);
    expect(await controller.join()).toBe(true);
    expect(state.sectorWaitlistJoinFailed).toBe(false);
  });

  it("refreshes the count once, only after the season-full screen shows", async () => {
    const state = { ...makeState(), seasonFull: false };
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, seasonId: "s1", waitingCount: 7, joined: false }));
    const sync = vi.fn();
    const controller = createSectorWaitlistController({ state, wsUrl: "wss://api.example.test/ws", getIdToken: async () => undefined, sync, fetchImpl });

    controller.refreshIfNeeded();
    expect(fetchImpl).not.toHaveBeenCalled();
    state.seasonFull = true;
    controller.refreshIfNeeded();
    controller.refreshIfNeeded();
    await vi.waitFor(() => expect(state.sectorWaitlistCount).toBe(7));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), { method: "GET" });
  });
});

describe("sectorWaitlistButtonLabel", () => {
  it("invites joining, with the queue size once known", () => {
    expect(sectorWaitlistButtonLabel(makeState())).toBe("Join the waitlist for the next Sector");
    expect(sectorWaitlistButtonLabel({ ...makeState(), sectorWaitlistCount: 1 })).toBe("Join the waitlist for the next Sector (1 House waiting)");
  });

  it("confirms membership", () => {
    expect(sectorWaitlistButtonLabel({ ...makeState(), seasonFullNotifyAcknowledged: true, sectorWaitlistCount: 12 })).toBe(
      "On the waitlist for the next Sector · 12 Houses waiting"
    );
  });
});
