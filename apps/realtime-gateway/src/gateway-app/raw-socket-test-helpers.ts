// Shared minimal raw-WebSocket test plumbing (the browser-style WebSocket
// itself, not the buffered wrapper in rewrite-stack-test-helpers.ts). This
// open/timeout boilerplate was duplicated verbatim across several
// *.integration.test.ts files; each file's own message-waiting logic (which
// does differ) stays local, only the identical open/timeout plumbing moved
// here.
export type TestWebSocket = {
  readonly readyState: number;
  readonly CLOSED: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: string }) => void, options?: { once?: boolean }): void;
  addEventListener(type: "close", listener: () => void, options?: { once?: boolean }): void;
};

const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => TestWebSocket }).WebSocket;

// Callers had different default timeouts (1_500ms vs 2_500ms) before this
// extraction; currying preserves each file's own default while sharing the
// race/cleanup logic itself.
export const createWithTimeout = (defaultTimeoutMs: number) =>
  async <T>(label: string, task: Promise<T>, timeoutMs: number = defaultTimeoutMs): Promise<T> => {
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

export const openRawSocket = async (
  url: string,
  withTimeout: ReturnType<typeof createWithTimeout>
): Promise<TestWebSocket> => {
  if (!WebSocketCtor) throw new Error("global WebSocket is unavailable in this runtime");
  const socket = new WebSocketCtor(url);
  await withTimeout(
    `socket open (${url})`,
    new Promise<void>((resolve) => {
      socket.addEventListener("open", () => resolve(), { once: true });
    })
  );
  return socket;
};
