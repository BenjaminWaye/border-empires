// Shared WebSocket helpers for gateway integration tests. Every message is
// recorded from the moment the socket opens, so a reply that arrives before a
// waiter is attached is never missed.
import { SignJWT, generateKeyPair } from "jose";

import { createFirebaseTokenVerifier, type FirebaseTokenVerifier } from "../auth-identity/firebase-token-verifier.js";

export type TestWebSocket = {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: string }) => void, options?: { once?: boolean }): void;
};

const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => TestWebSocket }).WebSocket;

const withTimeout = async <T>(label: string, task: Promise<T>, timeoutMs = 3_000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export type Message = Record<string, unknown>;

// Every message is recorded from the moment the socket opens, so a reply that
// arrives before a waiter is attached is never missed.
export type Client = { socket: TestWebSocket; messages: Message[]; waitFor: (label: string, predicate: (message: Message) => boolean) => Promise<Message> };

export const connect = async (url: string): Promise<Client> => {
  if (!WebSocketCtor) throw new Error("global WebSocket is unavailable in this runtime");
  const socket = new WebSocketCtor(url);
  const messages: Message[] = [];
  const waiters: Array<{ predicate: (message: Message) => boolean; resolve: (message: Message) => void }> = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as Message;
    messages.push(message);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i]!.predicate(message)) waiters.splice(i, 1)[0]!.resolve(message);
    }
  });
  await withTimeout("socket open", new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true })));
  return {
    socket,
    messages,
    waitFor: (label, predicate) => {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return withTimeout(label, new Promise<Message>((resolve) => waiters.push({ predicate, resolve })));
    }
  };
};

export const TEST_FIREBASE_PROJECT = "border-empires";

// Real signature verification is on by default (see
// gateway-auth-verification.integration.test.ts), so a login test needs an
// actually-signed token, not a base64-decoded stand-in. Generates one
// throwaway RS256 key pair and hands back both a verifier that trusts it
// (pass as firebaseTokenVerifier to createRealtimeGatewayApp) and a signer
// for building tokens that verifier accepts. claims uses sub, not user_id --
// the verifier only reads sub.
export const createTestFirebaseTokens = async (): Promise<{
  verifier: FirebaseTokenVerifier;
  sign: (claims: Record<string, unknown> & { sub: string }) => Promise<string>;
}> => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const issuer = `https://securetoken.google.com/${TEST_FIREBASE_PROJECT}`;
  return {
    verifier: createFirebaseTokenVerifier({ projectId: TEST_FIREBASE_PROJECT, keySet: async () => publicKey, onReject: () => undefined }),
    sign: (claims) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(issuer)
        .setAudience(TEST_FIREBASE_PROJECT)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(privateKey)
  };
};
