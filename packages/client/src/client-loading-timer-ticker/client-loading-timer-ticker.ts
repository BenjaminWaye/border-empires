// Extracted from client-runtime-loop.ts (over the repo's 500-line file-size gate).
// Refresh "loading for Xs" timers on tile-detail loader rows once per second
// without forcing a full menu re-render. Each loader row carries the start
// ms in data-loading-timer-since; we just rewrite the visible text.
export const startLoadingTimerTicker = (): void => {
  setInterval(() => {
    if (typeof document === "undefined") return;
    const elements = document.querySelectorAll<HTMLElement>("[data-loading-timer-since]");
    if (elements.length === 0) return;
    const now = Date.now();
    elements.forEach((element) => {
      const since = Number(element.dataset.loadingTimerSince);
      if (!Number.isFinite(since) || since <= 0) return;
      const elapsedSeconds = Math.max(0, Math.round((now - since) / 1000));
      const text =
        elapsedSeconds < 60
          ? `${elapsedSeconds}s`
          : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
      if (element.textContent !== text) element.textContent = text;
    });
  }, 1000);
};
