import { describe, expect, it } from "vitest";
import type { RealtimeSocket } from "../client-socket-types.js";
import { createSocketAuthenticator } from "./client-authenticate-socket.js";
import type { AuthSession } from "./client-auth-flow-types.js";

const fakeOpenSocket = (): RealtimeSocket & { sent: string[] } => {
  const sent: string[] = [];
  return {
    readyState: 1,
    OPEN: 1,
    send: (data: string) => { sent.push(data); },
    sent
  } as unknown as RealtimeSocket & { sent: string[] };
};

const freshSession = (): AuthSession => ({ token: "", uid: "", emailLinkSentTo: "", emailLinkPending: false });

describe("createSocketAuthenticator dev bypass", () => {
  it("sends the raw player id as the AUTH token when a devAuthPlayerId is configured, without touching Firebase", async () => {
    const ws = fakeOpenSocket();
    const authSession = freshSession();
    const { authenticateSocket } = createSocketAuthenticator(undefined, ws, authSession, "player-1");

    await authenticateSocket();

    expect(ws.sent).toEqual([JSON.stringify({ type: "AUTH", token: "player-1", initChunking: true })]);
    expect(authSession.token).toBe("player-1");
    expect(authSession.uid).toBe("player-1");
  });

  it("adds the hosted sector ticket to AUTH, asking for a fresh one when the last login was refused", async () => {
    const ws = fakeOpenSocket();
    const requested: boolean[] = [];
    const getSectorTicket = async (forceRefresh: boolean): Promise<string | undefined> => { requested.push(forceRefresh); return forceRefresh ? "ticket-new" : "ticket-old"; };
    const { authenticateSocket, clearAuthInFlight } = createSocketAuthenticator(undefined, ws, freshSession(), "player-1", getSectorTicket);

    await authenticateSocket();
    clearAuthInFlight();
    await authenticateSocket(true);

    expect(requested).toEqual([false, true]);
    expect(ws.sent.map((payload) => (JSON.parse(payload) as { sectorTicket?: string }).sectorTicket)).toEqual(["ticket-old", "ticket-new"]);
  });

  it("sends AUTH without a ticket when none could be fetched, leaving the refusal to the server", async () => {
    const ws = fakeOpenSocket();
    const { authenticateSocket } = createSocketAuthenticator(undefined, ws, freshSession(), "player-1", async () => undefined);
    await authenticateSocket();
    expect(ws.sent).toEqual([JSON.stringify({ type: "AUTH", token: "player-1", initChunking: true })]);
  });

  it("falls back to the normal Firebase-token path when no devAuthPlayerId is set", async () => {
    const ws = fakeOpenSocket();
    const authSession = freshSession();
    const { authenticateSocket } = createSocketAuthenticator(undefined, ws, authSession);

    await authenticateSocket();

    expect(ws.sent).toEqual([]);
  });

  it("does not permanently latch authInFlight when Firebase currentUser isn't ready yet", async () => {
    const ws = fakeOpenSocket();
    const authSession = freshSession();
    let currentUser: { uid: string; getIdToken: () => Promise<string> } | null = null;
    const firebaseAuth = {
      get currentUser() {
        return currentUser;
      }
    } as unknown as Parameters<typeof createSocketAuthenticator>[0];
    const { authenticateSocket } = createSocketAuthenticator(firebaseAuth, ws, authSession);

    // First call races Firebase auth state resolving — currentUser is still null.
    await authenticateSocket();
    expect(ws.sent).toEqual([]);

    // Firebase resolves afterward; a later retry (e.g. onAuthStateChanged) must still work.
    currentUser = { uid: "real-uid", getIdToken: async () => "real-token" };
    await authenticateSocket();

    expect(ws.sent).toEqual([JSON.stringify({ type: "AUTH", token: "real-token", initChunking: true })]);
    expect(authSession.token).toBe("real-token");
    expect(authSession.uid).toBe("real-uid");
  });
});
