import { describe, expect, it, vi } from "vitest";

import {
  createSectorTicketProvider,
  hostedInviteCodeFromPath,
  hostedSectorIdFromSearch,
  hostedSectorsEnabled,
  isAllowedHostedSectorWsUrl,
  readHostedSectorSession,
  stashHostedSectorSession
} from "./client-hosted-sector-session.js";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};

const SESSION = { sectorId: "s-abc", wsUrl: "wss://s-abc.sectors.borderempires.com/ws", ticket: "ticket-1", expiresAt: 1_000_000 };

describe("hosted sector session", () => {
  it("is off unless the build turns it on, and never on in the apps", () => {
    expect(hostedSectorsEnabled(false, undefined)).toBe(false);
    expect(hostedSectorsEnabled(false, "1")).toBe(true);
    expect(hostedSectorsEnabled(true, "1")).toBe(false);
  });

  it("reads a sector id and an invite code from the address, ignoring malformed ones", () => {
    expect(hostedSectorIdFromSearch("?sector=s-abc")).toBe("s-abc");
    expect(hostedSectorIdFromSearch("?sector=../etc")).toBeUndefined();
    expect(hostedSectorIdFromSearch("")).toBeUndefined();
    expect(hostedInviteCodeFromPath("/h/abc123")).toBe("abc123");
    expect(hostedInviteCodeFromPath("/h/abc123/")).toBe("abc123");
    expect(hostedInviteCodeFromPath("/h/ABC!")).toBeUndefined();
    expect(hostedInviteCodeFromPath("/r/abc123")).toBeUndefined();
  });

  it("only ever connects to a server under the hosted-sector domain", () => {
    expect(isAllowedHostedSectorWsUrl("wss://s-abc.sectors.borderempires.com/ws", false)).toBe(true);
    expect(isAllowedHostedSectorWsUrl("ws://s-abc.sectors.borderempires.com/ws", false)).toBe(false);
    expect(isAllowedHostedSectorWsUrl("wss://evil.example.com/ws", false)).toBe(false);
    expect(isAllowedHostedSectorWsUrl("wss://sectors.borderempires.com.evil.example/ws", false)).toBe(false);
    expect(isAllowedHostedSectorWsUrl("wss://s-abc.sectors.borderempires.com/other", false)).toBe(false);
    expect(isAllowedHostedSectorWsUrl("not a url", false)).toBe(false);
    // Local development against the fake providers.
    expect(isAllowedHostedSectorWsUrl("ws://127.0.0.1:3102/ws", true)).toBe(true);
    expect(isAllowedHostedSectorWsUrl("https://127.0.0.1/ws", true)).toBe(false);
  });

  it("reads back what Enter stashed, for that sector only, and rejects a tampered address", () => {
    const storage = memoryStorage();
    expect(readHostedSectorSession("s-abc", storage, false)).toBeUndefined();
    stashHostedSectorSession(SESSION, storage);
    expect(readHostedSectorSession("s-abc", storage, false)).toEqual(SESSION);
    expect(readHostedSectorSession("s-other", storage, false)).toBeUndefined();
    stashHostedSectorSession({ ...SESSION, wsUrl: "wss://evil.example.com/ws" }, storage);
    expect(readHostedSectorSession("s-abc", storage, false)).toBeUndefined();
    storage.setItem("be-hosted-sector", "{not json");
    expect(readHostedSectorSession("s-abc", storage, false)).toBeUndefined();
  });
});

describe("sector ticket provider", () => {
  it("uses the held ticket while it is fresh, and fetches a new one near expiry", async () => {
    let now = 0;
    const issueTicket = vi.fn(async () => ({ ok: true as const, ticket: "ticket-2", expiresAt: 2_000_000, wsUrl: SESSION.wsUrl }));
    const onTicket = vi.fn();
    const getTicket = createSectorTicketProvider({ session: SESSION, issueTicket, now: () => now, onTicket });

    expect(await getTicket(false)).toBe("ticket-1");
    expect(issueTicket).not.toHaveBeenCalled();

    now = 1_000_000 - 30_000;
    expect(await getTicket(false)).toBe("ticket-2");
    expect(issueTicket).toHaveBeenCalledWith("s-abc");
    expect(onTicket).toHaveBeenCalledTimes(1);
    expect(await getTicket(false)).toBe("ticket-2");
    expect(issueTicket).toHaveBeenCalledTimes(1);
  });

  it("fetches a new ticket when the server refused the last one, and gives none when the account is no longer a member", async () => {
    const issueTicket = vi.fn()
      .mockResolvedValueOnce({ ok: true, ticket: "ticket-2", expiresAt: 2_000_000, wsUrl: SESSION.wsUrl })
      .mockResolvedValueOnce({ ok: false, code: "NOT_MEMBER", message: "You are not a member of this sector." });
    const getTicket = createSectorTicketProvider({ session: SESSION, issueTicket, now: () => 0 });
    expect(await getTicket(true)).toBe("ticket-2");
    expect(await getTicket(true)).toBeUndefined();
  });
});
