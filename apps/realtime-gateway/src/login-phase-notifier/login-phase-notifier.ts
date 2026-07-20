// Login-phase progress notifier.
//
// The AUTH handler in gateway-app.ts used to be silent between the client
// sending AUTH and the gateway sending back INIT/ERROR — the only progress
// text came from the client's own optimistic "Sending your Google session..."
// message, which never updated again. On a slow/retrying backend (or a large
// empire, where resolve_initial_state/build_init/stringify_init all take real
// time) the busy-modal froze for the entire login with no indication anything
// was still happening. See docs/agents/topics/staging-login-cpu-contention.md
// and the login latency investigation this shipped alongside.
//
// This module gives every stage of the AUTH handler a one-line way to push a
// LOGIN_PHASE update, plus a reusable 1Hz heartbeat for stages that can run
// long (RPC retries, large-empire snapshot/stringify work) so the elapsed
// time shown to the user keeps moving even with no other event to hang a
// repaint on.
export type LoginPhaseSocket = { readonly readyState: number; readonly OPEN: number };

export type LoginPhaseNotifier<TSocket extends LoginPhaseSocket> = {
  /** Send a single LOGIN_PHASE update immediately. */
  notify: (socket: TSocket, title: string, detail: string) => void;
  /**
   * Start a 1Hz LOGIN_PHASE heartbeat computed from elapsed time since this
   * call. Caller owns the returned timer and must clearInterval it (typically
   * in a finally block) once the covered stage completes or fails.
   */
  startHeartbeat: (
    socket: TSocket,
    computeMessage: (elapsedMs: number) => { title: string; detail: string },
    intervalMs?: number
  ) => ReturnType<typeof setInterval>;
};

export const createLoginPhaseNotifier = <TSocket extends LoginPhaseSocket>(
  sendJson: (socket: TSocket, payload: unknown) => void
): LoginPhaseNotifier<TSocket> => {
  const notify: LoginPhaseNotifier<TSocket>["notify"] = (socket, title, detail) => {
    sendJson(socket, { type: "LOGIN_PHASE", title, detail });
  };

  const startHeartbeat: LoginPhaseNotifier<TSocket>["startHeartbeat"] = (socket, computeMessage, intervalMs = 1_000) => {
    const startedAt = Date.now();
    return setInterval(() => {
      if (socket.readyState !== socket.OPEN) return;
      const { title, detail } = computeMessage(Date.now() - startedAt);
      notify(socket, title, detail);
    }, intervalMs);
  };

  return { notify, startHeartbeat };
};
