import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { manifestDetailHtml } from "../client-hud-v2/client-hud-v2-manifest.js";
import { chooseTechFromUi, type PlayerActionDeps } from "../client-player-actions.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo } from "../client-types.js";
import { clearTechCommissionOnError, expireStaleTechCommission, TECH_COMMISSION_PENDING_TIMEOUT_MS } from "./client-tech-commission.js";

const tooling: TechInfo = {
  id: "industrial-tooling",
  name: "Industrial Tooling Module",
  tier: 1,
  branch: "economy",
  prereqIds: [],
  description: "",
  mods: {},
  requirements: { gold: 40, resources: {}, canResearch: true }
};

const depsFor = (state: ReturnType<typeof createInitialState>, ws: Pick<RealtimeSocket, "readyState" | "send">): PlayerActionDeps => ({
  state,
  techPickEl: { value: "" } as HTMLSelectElement,
  mobileTechPickEl: { value: "" } as HTMLSelectElement,
  ws: ws as RealtimeSocket,
  wsUrl: "ws://example.test/game",
  setAuthStatus: vi.fn(),
  syncAuthOverlay: vi.fn(),
  pushFeed: vi.fn(),
  renderHud: vi.fn(),
  sendGameMessage: vi.fn()
});

const setup = (readyState = 1) => {
  const state = createInitialState();
  state.techCatalog = [tooling];
  state.techChoices = [tooling.id];
  state.authSessionReady = true;
  const send = vi.fn();
  const deps = depsFor(state, { readyState, send });
  const commission = (): void => chooseTechFromUi(tooling.id, deps);
  return { state, send, commission };
};

describe("Manifest commission in flight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Regression: a gateway refusal that isn't a TECH_* error left the commission pending for the
  // rest of the session, so every later Commission tap did nothing.
  it("lets the player commission again after the gateway refuses the command", () => {
    const { state, send, commission } = setup();
    commission();
    expect(send).toHaveBeenCalledTimes(1);
    clearTechCommissionOnError(state, "COMMAND_RATE_LIMITED");
    commission();
    expect(send).toHaveBeenCalledTimes(2);
  });

  // Regression: a reply lost with the connection blocked Commission until the next full reload.
  it("stops waiting for a reply that never comes", () => {
    const { state, send, commission } = setup();
    commission();
    vi.setSystemTime(1_000_000 + TECH_COMMISSION_PENDING_TIMEOUT_MS);
    commission();
    expect(send).toHaveBeenCalledTimes(2);
    expect(state.pendingTechUnlockId).toBe(tooling.id);
    expect(state.pendingTechUnlockAt).toBe(1_000_000 + TECH_COMMISSION_PENDING_TIMEOUT_MS);
  });

  it("refuses a second tap while waiting, with an alert the new HUD shows", () => {
    const { state, send, commission } = setup();
    commission();
    commission();
    expect(send).toHaveBeenCalledTimes(1);
    expect(state.captureAlert?.title).toBe("Manifest not commissioned");
  });

  it("alerts instead of failing silently while disconnected", () => {
    const { state, send, commission } = setup(3);
    commission();
    expect(send).not.toHaveBeenCalled();
    expect(state.captureAlert?.detail).toContain("disconnected");
  });

  it("keeps waiting through errors about other actions", () => {
    const { state, commission } = setup();
    commission();
    clearTechCommissionOnError(state, "LOCKED");
    expect(state.pendingTechUnlockId).toBe(tooling.id);
    clearTechCommissionOnError(state, "TECH_INVALID");
    expect(state.pendingTechUnlockId).toBe("");
  });

  it("clears a timed-out commission for the panels that read the flag directly", () => {
    const { state, commission } = setup();
    commission();
    expireStaleTechCommission(state, 1_000_000 + TECH_COMMISSION_PENDING_TIMEOUT_MS - 1);
    expect(state.pendingTechUnlockId).toBe(tooling.id);
    expireStaleTechCommission(state, 1_000_000 + TECH_COMMISSION_PENDING_TIMEOUT_MS);
    expect(state.pendingTechUnlockId).toBe("");
  });

  it("shows Commissioning… on the Manifest screen until the server confirms", () => {
    const input = { techs: [tooling], owned: new Set<string>(), selectedId: tooling.id, closedLanes: new Set<string>(), gold: 100, choices: new Set([tooling.id]), afcTier: 0 };
    expect(manifestDetailHtml({ ...input, pendingId: tooling.id })).toContain("Commissioning…");
    expect(manifestDetailHtml({ ...input, pendingId: tooling.id })).not.toContain("data-v2-manifest-commission");
    expect(manifestDetailHtml(input)).toContain(`data-v2-manifest-commission="${tooling.id}"`);
  });
});
