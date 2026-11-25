// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  DEPLOY_COUNTDOWN_ALMOST_READY,
  DEPLOY_STATUS_MAX_AGE_MS,
  deployCountdownLabel,
  formatDeployCountdown,
  parseDeployStatus,
  syncDeployCountdownCopy
} from "./client-deploy-countdown.js";
import { DEPLOY_WAIT_DETAIL } from "../client-auth-deploy-wait/client-auth-deploy-wait.js";

const NOW = 1_800_000_000_000;

describe("parseDeployStatus", () => {
  it("accepts a fresh deploying file", () => {
    expect(parseDeployStatus({ state: "deploying", startedAt: NOW - 10_000, expectedSeconds: 90 }, NOW)).toEqual({
      startedAt: NOW - 10_000,
      expectedSeconds: 90
    });
  });

  it("treats a file older than 15 minutes as stale", () => {
    expect(parseDeployStatus({ state: "deploying", startedAt: NOW - DEPLOY_STATUS_MAX_AGE_MS, expectedSeconds: 90 }, NOW)).toBeNull();
    expect(parseDeployStatus({ state: "deploying", startedAt: NOW - DEPLOY_STATUS_MAX_AGE_MS + 1, expectedSeconds: 90 }, NOW)).not.toBeNull();
  });

  it("returns null for a missing file, garbage and other states", () => {
    expect(parseDeployStatus(null, NOW)).toBeNull();
    expect(parseDeployStatus("<html>502</html>", NOW)).toBeNull();
    expect(parseDeployStatus([], NOW)).toBeNull();
    expect(parseDeployStatus({ state: "degraded" }, NOW)).toBeNull();
    expect(parseDeployStatus({ state: "deploying" }, NOW)).toBeNull();
    expect(parseDeployStatus({ state: "deploying", startedAt: "soon", expectedSeconds: 90 }, NOW)).toBeNull();
    expect(parseDeployStatus({ state: "deploying", startedAt: Number.NaN, expectedSeconds: 90 }, NOW)).toBeNull();
    expect(parseDeployStatus({ state: "deploying", startedAt: NOW + 60 * 60_000, expectedSeconds: 90 }, NOW)).toBeNull();
  });

  it("falls back to 120s when the estimate is missing or bad", () => {
    expect(parseDeployStatus({ state: "deploying", startedAt: NOW, expectedSeconds: -4 }, NOW)?.expectedSeconds).toBe(120);
    expect(parseDeployStatus({ state: "deploying", startedAt: NOW }, NOW)?.expectedSeconds).toBe(120);
  });
});

describe("formatDeployCountdown", () => {
  const status = { startedAt: NOW, expectedSeconds: 120 };

  it("counts down m:ss from startedAt + expectedSeconds", () => {
    expect(formatDeployCountdown(status, NOW)).toBe("Server update · back in ~2:00");
    expect(formatDeployCountdown(status, NOW + 40_000)).toBe("Server update · back in ~1:20");
    expect(formatDeployCountdown(status, NOW + 115_500)).toBe("Server update · back in ~0:05");
    expect(formatDeployCountdown(status, NOW + 119_001)).toBe("Server update · back in ~0:01");
  });

  it("says Almost ready at zero and never shows a negative time", () => {
    expect(formatDeployCountdown(status, NOW + 120_000)).toBe(DEPLOY_COUNTDOWN_ALMOST_READY);
    expect(formatDeployCountdown(status, NOW + 600_000)).toBe(DEPLOY_COUNTDOWN_ALMOST_READY);
  });

  it("only shows while the realtime connection is down", () => {
    expect(deployCountdownLabel({ connection: "disconnected", deployStatus: status }, NOW)).toBe("Server update · back in ~2:00");
    expect(deployCountdownLabel({ connection: "connecting", deployStatus: status }, NOW)).not.toBeNull();
    expect(deployCountdownLabel({ connection: "connected", deployStatus: status }, NOW)).toBeNull();
    expect(deployCountdownLabel({ connection: "initialized", deployStatus: status }, NOW)).toBeNull();
    expect(deployCountdownLabel({ connection: "disconnected", deployStatus: null }, NOW)).toBeNull();
  });
});

describe("syncDeployCountdownCopy", () => {
  const setup = () => {
    const titleEl = document.createElement("h2");
    const copyEl = document.createElement("p");
    const statusEl = document.createElement("p");
    titleEl.textContent = "Server updating";
    copyEl.textContent = "Reconnecting… (12s elapsed)";
    const setAuthStatus = vi.fn((message: string) => {
      statusEl.textContent = message;
    });
    return { titleEl, copyEl, statusEl, setAuthStatus };
  };
  const base = { authError: "", authSessionReady: false };
  const status = { startedAt: NOW, expectedSeconds: 80 };

  it("puts the countdown on the waiting card, then leaves recovered copy alone", () => {
    const els = setup();
    syncDeployCountdownCopy({ ...base, connection: "disconnected", authBusy: true, deployStatus: status }, els, NOW);
    expect(els.titleEl.textContent).toBe("Server update · back in ~1:20");
    expect(els.copyEl.textContent).toBe(DEPLOY_WAIT_DETAIL);
    expect(els.titleEl.dataset.countdown).toBe("true");

    syncDeployCountdownCopy({ ...base, connection: "disconnected", authBusy: true, deployStatus: status }, els, NOW + 81_000);
    expect(els.titleEl.textContent).toBe(DEPLOY_COUNTDOWN_ALMOST_READY);

    // Reconnected: the overlay's own sync wrote the next phase; keep it.
    els.titleEl.textContent = "Securing session";
    syncDeployCountdownCopy({ ...base, connection: "connected", authBusy: true, deployStatus: status }, els, NOW + 82_000);
    expect(els.titleEl.textContent).toBe("Securing session");
    expect(els.titleEl.dataset.countdown).toBeUndefined();
  });

  it("shows on the sign-in panel status and clears it once the deploy is over", () => {
    const els = setup();
    syncDeployCountdownCopy({ ...base, connection: "disconnected", authBusy: false, deployStatus: status }, els, NOW);
    expect(els.statusEl.textContent).toBe("Server update · back in ~1:20");
    syncDeployCountdownCopy({ ...base, connection: "initialized", authBusy: false, deployStatus: null }, els, NOW + 5_000);
    expect(els.statusEl.textContent).toBe("");
  });

  it("does not clear an unrelated status line", () => {
    const els = setup();
    els.statusEl.textContent = "Check your inbox.";
    syncDeployCountdownCopy({ ...base, connection: "initialized", authBusy: false, deployStatus: null }, els, NOW);
    expect(els.statusEl.textContent).toBe("Check your inbox.");
    expect(els.setAuthStatus).not.toHaveBeenCalled();
  });
});
