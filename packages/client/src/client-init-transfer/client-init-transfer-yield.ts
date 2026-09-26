// Upper bound on how long INIT handling waits for a paint. requestAnimationFrame
// never fires in a hidden tab, so the timeout keeps login moving there.
const YIELD_TO_PAINT_MAX_WAIT_MS = 150;

/**
 * Runs `callback` once the browser has had a chance to paint (next animation
 * frame, then a macrotask), or after YIELD_TO_PAINT_MAX_WAIT_MS, whichever is
 * first. Used so the login overlay can show "Building your map" before the
 * main thread is blocked parsing and applying a large INIT.
 */
export const yieldToPaint = (callback: () => void): void => {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    callback();
  };
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => setTimeout(run, 0));
  }
  setTimeout(run, YIELD_TO_PAINT_MAX_WAIT_MS);
};
