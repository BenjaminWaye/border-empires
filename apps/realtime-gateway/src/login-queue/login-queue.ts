// Login queue: instead of rejecting over-concurrency with SERVER_BUSY, hold
// the socket open and resume when a bootstrap slot becomes free. The client
// shows a "You are #N in queue" message while waiting.
export type LoginQueueDeps = {
  maxConcurrentBootstraps: number;
  // Estimated time per bootstrap slot (ms) — used to compute wait-time hints.
  bootstrapEstimateMs: number;
  bootstrapsInFlight: () => number;
  sendJson: (socket: import("ws").WebSocket, payload: unknown) => void;
};

type LoginQueueEntry = { socket: import("ws").WebSocket; resolve: (granted: boolean) => void; enqueuedAt: number };

export const createLoginQueue = (deps: LoginQueueDeps) => {
  const entries: LoginQueueEntry[] = [];

  const estimatedWaitMs = (positionFromEnd: number): number =>
    Math.round((positionFromEnd * deps.bootstrapEstimateMs) / deps.maxConcurrentBootstraps);

  // Notify remaining waiters of their updated positions.
  const notifyPositions = (): void => {
    entries.forEach((entry, i) => {
      try {
        deps.sendJson(entry.socket, {
          type: "LOGIN_QUEUE_PROGRESS",
          position: i + 1,
          estimatedWaitMs: estimatedWaitMs(i + 1)
        });
      } catch {
        /* socket may already be closed */
      }
    });
  };

  return {
    size: (): number => entries.length,
    estimatedWaitMs,
    drain: (): void => {
      if (entries.length === 0 || deps.bootstrapsInFlight() >= deps.maxConcurrentBootstraps) return;
      const next = entries.shift();
      if (!next) return;
      notifyPositions();
      next.resolve(true);
    },
    // Resolves true once a bootstrap slot is granted, or false if the socket
    // closes while still waiting.
    enqueueAndWait: (socket: import("ws").WebSocket): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const entry: LoginQueueEntry = { socket, resolve, enqueuedAt: Date.now() };
        entries.push(entry);
        socket.once("close", () => {
          const idx = entries.indexOf(entry);
          if (idx !== -1) {
            entries.splice(idx, 1);
            notifyPositions();
          }
          resolve(false);
        });
      })
  };
};
