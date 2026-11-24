import { describe, expect, it, vi } from "vitest";

import {
  clearHostedSectorSession,
  createSectorTicketProvider,
  hostedInviteCodeFromPath,
  hostedSectorIdFromSearch,
  hostedSectorsEnabled,
  isAllowedHostedSectorWsUrl,
  leaveHostedSectorWhenRefused,
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
    expect(isAllowedHostedSectorWsUrl("wss://s-abc.sectors.borderempires.com/ws", false, "s-abc")).toBe(true);
    expect(isAllowedHostedSectorWsUrl("ws://s-abc.sectors.borderempires.com/ws", false, "s-abc")).toBe(false);
    expect(isAllowedHostedSectorWsUrl("wss://evil.example.com/ws", false, "s-abc")).toBe(false);
    expect(isAllowedHostedSectorWsUrl("wss://sectors.borderempires.com.evil.example/ws", false, "s-abc")).toBe(false);
    expect(isAllowedHostedSectorWsUrl("wss://s-abc.sectors.borderempires.com/other", false, "s-abc")).toBe(false);
    expect(isAllowedHostedSectorWsUrl("not a url", false, "s-abc")).toBe(false);
    // Only this sector's own host, on the default port, with no credentials in the address.
    expect(isAllowedHostedSectorWsUrl("wss://s-other.sectors.borderempires.com/ws", false, "s-abc")).toBe(false);
    expect(isAllowedHostedSectorWsUrl("wss://s-abc.sectors.borderempires.com:8443/ws", false, "s-abc")).toBe(false);
    expect(isAllowedHostedSectorWsUrl("wss://user:pass@s-abc.sectors.borderempires.com/ws", false, "s-abc")).toBe(false);
    // Local development against the fake providers.
    expect(isAllowedHostedSectorWsUrl("ws://127.0.0.1:3102/ws", true, "s-abc")).toBe(true);
    expect(isAllowedHostedSectorWsUrl("https://127.0.0.1/ws", true, "s-abc")).toBe(false);
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

  it("copes with a browser that blocks storage", () => {
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); }, removeItem: () => { throw new Error("SecurityError"); } };
    expect(stashHostedSectorSession(SESSION, blocked)).toBe(false);
    expect(stashHostedSectorSession(SESSION, undefined)).toBe(false);
    expect(readHostedSectorSession("s-abc", blocked, false)).toBeUndefined();
    expect(() => clearHostedSectorSession(blocked)).not.toThrow();
  });

  it("goes back to the public sector when the hosted sector refuses this account, and only then", () => {
    const storage = memoryStorage();
    stashHostedSectorSession(SESSION, storage);
    let listener: ((event: MessageEvent) => void) | undefined;
    const navigate = vi.fn();
    leaveHostedSectorWhenRefused({ ws: { addEventListener: (_type, l) => { listener = l; } }, storage, navigate });
    listener?.(new MessageEvent("message", { data: JSON.stringify({ type: "ERROR", code: "AUTH_FAIL" }) }));
    listener?.(new MessageEvent("message", { data: JSON.stringify({ type: "CHAT", text: "SECTOR_TICKET_REJECTED" }) }));
    expect(navigate).not.toHaveBeenCalled();
    listener?.(new MessageEvent("message", { data: JSON.stringify({ type: "ERROR", code: "SECTOR_TICKET_REJECTED" }) }));
    expect(navigate).toHaveBeenCalledWith("/");
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
