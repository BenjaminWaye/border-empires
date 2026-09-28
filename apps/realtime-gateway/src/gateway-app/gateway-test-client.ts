// Shared WebSocket helpers for gateway integration tests. Every message is
// recorded from the moment the socket opens, so a reply that arrives before a
// waiter is attached is never missed.
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

export const firebaseToken = (claims: Record<string, unknown>): string =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
