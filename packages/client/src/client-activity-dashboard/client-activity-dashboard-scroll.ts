export type ActivityDashboardView = "YOURS" | "WORLD_PULSE" | "UPDATES";

type ScrollMemory = {
  activeView: ActivityDashboardView;
  scrollTopByView: Partial<Record<ActivityDashboardView, number>>;
};

const SCROLL_SELECTOR = ".activity-dashboard-modal-scroll";

// renderHud() runs on network updates and several tickers while the dashboard
// is open. Reassigning innerHTML each time replaced the scroll container and
// snapped the list back to the top, so remember what was last painted per
// overlay element and only rebuild when the markup actually changed.
const lastPaintedHtml = new WeakMap<HTMLElement, string>();

export const paintActivityDashboard = (overlayEl: HTMLElement, html: string): void => {
  if (overlayEl.firstElementChild && lastPaintedHtml.get(overlayEl) === html) return;
  overlayEl.innerHTML = html;
  lastPaintedHtml.set(overlayEl, html);
};

export const clearActivityDashboard = (overlayEl: HTMLElement): void => {
  lastPaintedHtml.delete(overlayEl);
  if (overlayEl.innerHTML) overlayEl.innerHTML = "";
};

/** Restores the active view's scroll position after a (re)paint and tracks further scrolling. */
export const syncActivityDashboardScroll = (overlayEl: HTMLElement, memory: ScrollMemory): void => {
  const scrollEl = overlayEl.querySelector(SCROLL_SELECTOR) as HTMLElement | null;
  if (!scrollEl) return;
  const view = memory.activeView;
  const remembered = memory.scrollTopByView[view] ?? 0;
  if (Math.abs(scrollEl.scrollTop - remembered) > 1) scrollEl.scrollTop = remembered;
  scrollEl.onscroll = () => {
    memory.scrollTopByView[view] = scrollEl.scrollTop;
  };
};

export const resetActivityDashboardScroll = (memory: Pick<ScrollMemory, "scrollTopByView">): void => {
  memory.scrollTopByView = {};
};
