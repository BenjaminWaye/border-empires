/**
 * Debounce + single-flight scheduler for the global-status (leaderboard /
 * season-victory) broadcast.
 *
 * The broadcast's `perform` does a full ~202k-tile world export on the single
 * sim worker (~10s on shared-cpu-1x). Two failure modes this guards against:
 *
 *  - Overlap: without single-flight, a request arriving mid-export starts a
 *    second concurrent export. Stacked exports pin the worker (login bootstraps
 *    starve and time out) and multiply peak memory (OOM). So while one broadcast
 *    is in flight we coalesce further requests into a single pending re-run.
 *  - Back-to-back: the coalesced re-run waits out the full debounce again, so
 *    the worker gets a clear window between exports for login bootstraps to
 *    complete rather than running exports continuously.
 *
 * `commandId` tags the emitted events; the latest requested id wins.
 */
export type GlobalStatusBroadcastScheduler = {
  schedule: (commandId: string) => void;
  dispose: () => void;
};

export type GlobalStatusBroadcastSchedulerDeps = {
  debounceMs: number;
  /** Runs one broadcast. Receives the latest requested commandId (or undefined). */
  perform: (commandId: string | undefined) => Promise<void>;
  /** Called when a request arrives while a broadcast is already in flight. */
  onCoalesced: () => void;
  /** Called if `perform` rejects. */
  onError: (error: unknown) => void;
};

export const createGlobalStatusBroadcastScheduler = (
  deps: GlobalStatusBroadcastSchedulerDeps
): GlobalStatusBroadcastScheduler => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let pending = false;
  let pendingCommandId: string | undefined;

  const flush = (): void => {
    timer = undefined;
    if (inFlight) {
      // Defensive: schedule() never arms a timer while a broadcast is in flight,
      // so this should be unreachable — coalesce rather than overlap if it isn't.
      pending = true;
      return;
    }
    inFlight = true;
    const commandId = pendingCommandId;
    pendingCommandId = undefined;
    void (async () => {
      try {
        await deps.perform(commandId);
      } catch (error) {
        deps.onError(error);
      } finally {
        inFlight = false;
        if (pending) {
          pending = false;
          timer = setTimeout(flush, deps.debounceMs);
        }
      }
    })();
  };

  return {
    schedule: (commandId: string): void => {
      pendingCommandId = commandId;
      if (inFlight) {
        // A broadcast is already running; coalesce this request into a single
        // pending re-run instead of stacking another full-world export.
        deps.onCoalesced();
        pending = true;
        return;
      }
      if (timer) return;
      timer = setTimeout(flush, deps.debounceMs);
    },
    dispose: (): void => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }
  };
};
