// Worker-side helper that captures the main thread's JavaScript stack while
// the main thread is blocked. It is CommonJS source text (not a module) so it
// can be embedded into the event-loop watchdog's eval'd Worker, which defines
// `captureMainThreadStack(timeoutMs, maxFrames, done)` in its scope.
//
// How: `inspector.Session#connectToMainThread()` from the worker, then
// `Debugger.enable` + `Debugger.pause`. Inspector messages reach the main
// thread through V8 interrupts, so a pause lands even inside a busy JS loop;
// the paused event's call frames are the stack, and we resume at once. A
// signal-triggered diagnostic report does NOT work for this: it only runs once
// the main thread is free again and carries no JS stack.
//
// If the main thread is inside native code (e.g. a synchronous SQLite call),
// the interrupt is only serviced when it re-enters JS, so the capture reports
// `pause_timeout` -- itself a useful signal. The paused listener stays
// attached, so a late pause is still resumed immediately.
export const MAIN_THREAD_STACK_CAPTURE_SOURCE = `
const captureMainThreadStack = (() => {
  const { Session } = require("node:inspector");
  let inFlight = false;
  return (timeoutMs, maxFrames, done) => {
    if (inFlight) { done({ ok: false, reason: "capture_in_flight", captureMs: 0 }); return; }
    inFlight = true;
    const startedAt = Date.now();
    let finished = false;
    let timer;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done(Object.assign({ captureMs: Date.now() - startedAt }, result));
    };
    let session;
    const release = () => {
      try {
        session.post("Debugger.disable", () => {
          try { session.disconnect(); } catch (err) { /* already gone */ }
          inFlight = false;
        });
      } catch (err) {
        inFlight = false;
      }
    };
    try {
      session = new Session();
      session.connectToMainThread();
    } catch (err) {
      inFlight = false;
      finish({ ok: false, reason: "connect_failed", error: String((err && err.message) || err) });
      return;
    }
    session.on("Debugger.paused", (message) => {
      const callFrames = (message && message.params && message.params.callFrames) || [];
      const frames = callFrames.slice(0, maxFrames).map((frame) => ({
        functionName: frame.functionName || "(anonymous)",
        url: frame.url || "",
        line: frame.location.lineNumber + 1,
        column: frame.location.columnNumber + 1
      }));
      session.post("Debugger.resume", () => release());
      finish({ ok: true, frames });
    });
    timer = setTimeout(() => finish({ ok: false, reason: "pause_timeout" }), timeoutMs);
    session.post("Debugger.enable", (enableErr) => {
      if (enableErr) {
        finish({ ok: false, reason: "enable_failed", error: String(enableErr.message || enableErr) });
        release();
        return;
      }
      session.post("Debugger.pause", (pauseErr) => {
        if (!pauseErr) return;
        finish({ ok: false, reason: "pause_failed", error: String(pauseErr.message || pauseErr) });
        release();
      });
    });
  };
})();
`;
