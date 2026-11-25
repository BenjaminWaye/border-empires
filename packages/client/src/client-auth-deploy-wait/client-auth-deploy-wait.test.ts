import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEPLOY_WAIT_RETRY_AFTER_MS,
  applyDeployWait,
  clearAuthOffline,
  deployWaitRetryVisible,
  retryDeployWaitNow,
  syncDeployWaitRetryButton
} from "./client-auth-deploy-wait.js";
import { createInitialState } from "../client-state/client-state.js";

const fakeModal = () => {
  const card = { appendChild: vi.fn() };
  const created: Array<{ style: { display: string }; onclick: unknown; textContent: string }> = [];
  const modalEl = {
    querySelector: () => card,
    ownerDocument: {
      createElement: () => {
        const el = { style: { display: "" }, onclick: null as unknown, textContent: "", id: "", type: "", className: "" };
        created.push(el);
        return el;
      }
    }
  } as unknown as HTMLElement;
  return { modalEl, card, created };
};

describe("deploy wait on the login overlay", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("offers a manual Retry only after about a minute offline", () => {
    vi.useFakeTimers();
    const state = createInitialState();
    applyDeployWait(state, 1_000);
    const { modalEl, card, created } = fakeModal();
    const resync = vi.fn();

    syncDeployWaitRetryButton({ state, modalEl, onRetry: vi.fn(), resync, now: 1_000 });
    expect(deployWaitRetryVisible(state, 1_000)).toBe(false);
    expect(created).toHaveLength(0);

    // The quiet card wakes itself when the button is due.
    vi.advanceTimersByTime(DEPLOY_WAIT_RETRY_AFTER_MS + 100);
    expect(resync).toHaveBeenCalledTimes(1);

    const onRetry = vi.fn();
    syncDeployWaitRetryButton({ state, modalEl, onRetry, resync, now: 1_000 + DEPLOY_WAIT_RETRY_AFTER_MS });
    expect(card.appendChild).toHaveBeenCalledTimes(1);
    expect(created[0]?.textContent).toBe("Retry");
    expect(created[0]?.style.display).toBe("");
    expect(created[0]?.onclick).toBe(onRetry);

    state.connection = "initialized";
    clearAuthOffline(state);
    syncDeployWaitRetryButton({ state, modalEl, onRetry, resync, now: 1_000 + DEPLOY_WAIT_RETRY_AFTER_MS });
    expect(created[0]?.style.display).toBe("none");
  });

  it("Retry reopens a dead socket, or resends AUTH on an open one", () => {
    const state = createInitialState();
    const authenticateSocket = vi.fn(async () => {});
    const closed = { OPEN: 1 as const, readyState: 3, reconnect: vi.fn() };
    retryDeployWaitNow(state, closed, authenticateSocket, 5_000);
    expect(closed.reconnect).toHaveBeenCalledTimes(1);
    expect(state.authOfflineSince).toBe(5_000);

    const open = { OPEN: 1 as const, readyState: 1, reconnect: vi.fn() };
    retryDeployWaitNow(state, open, authenticateSocket, 6_000);
    expect(open.reconnect).not.toHaveBeenCalled();
    expect(authenticateSocket).toHaveBeenCalledWith(true);
  });
});
