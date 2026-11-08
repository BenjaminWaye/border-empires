import { applyDomainUpdateMessage } from "../client-domain-update-handler/client-domain-update-handler.js";
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { applyAfcStateMessage } from "../client-afc-upgrades/client-afc-state.js";
import { gateAfcConstructionActions } from "./client-afc-recovery-actions.js";
import { renderAfcRecovery } from "./client-afc-recovery.js";

const fixture = (gold = 500) => {
  const state = createInitialState();
  state.me = "me"; state.authSessionReady = true; state.needsSeasonJoin = false; state.gold = gold;
  state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
  const send = vi.fn().mockReturnValue(true);
  const placementOverlayEl = document.createElement("div");
  const placementLabelEl = document.createElement("div");
  const render = () => renderAfcRecovery({ state, send, rerender: render, placementOverlayEl, placementLabelEl });
  const update = (recovery: object) => { applyAfcStateMessage(state, { afcRecovery: recovery }); render(); };
  return { state, send, update, render, placementOverlayEl };
};
afterEach(() => { document.body.innerHTML = ""; document.body.className = ""; vi.restoreAllMocks(); vi.useRealTimers(); });

describe("AFC recovery popup", () => {
  it("opens on AFC loss with the global quote and arms a landing site", () => {
    const f = fixture(); f.update({ globalLosses: 5, requiredSince: 1000 });
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("Call down a new AFC to continue construction");
    expect(document.body.textContent).toContain("60 gold");
    document.querySelector<HTMLButtonElement>("[data-afc-choose]")!.click();
    expect(f.state.buildingPlacement).toMatchObject({ active: true, structureType: "AFC", x: 10, y: 10 });
    expect(f.placementOverlayEl.style.display).toBe("flex");
    expect(f.state.afcRecoveryPopupOpen).toBe(false);
  });

  it("disables an unaffordable delivery, allows continued fighting, and reopens on cancellation", () => {
    const f = fixture(10); f.update({ globalLosses: 5, requiredSince: 1000 });
    expect(document.querySelector<HTMLButtonElement>("[data-afc-choose]")?.disabled).toBe(true);
    document.querySelector<HTMLButtonElement>("[data-afc-fight]")!.click();
    f.update({ globalLosses: 6, requiredSince: 1000 });
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.querySelector(".afc-recovery-status")?.getAttribute("aria-label")).toContain("Construction suspended");
    f.update({ globalLosses: 6, requiredSince: 2000, cancellation: "Landing site lost" });
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    expect(document.body.textContent).toContain("Landing site lost");
  });

  it("uses the shared V2 action buttons when the V2 HUD is active", () => {
    document.body.classList.add("hud-v2");
    const f = fixture(); f.update({ globalLosses: 1, requiredSince: 1000 });
    expect(document.querySelector("[data-afc-choose]")?.classList.contains("v2s-btn-primary")).toBe(true);
    expect(document.querySelector("[data-afc-fight]")?.classList.contains("v2s-btn")).toBe(true);
    expect(document.querySelector("[data-afc-confirm]")?.classList.contains("v2s-btn-danger")).toBe(true);
  });

  it("keeps recovery at the edge after Continue fighting and updates affordability", () => {
    const f = fixture(10); f.update({ globalLosses: 1, requiredSince: 1000 });
    document.querySelector<HTMLButtonElement>("[data-afc-fight]")!.click();
    f.render();
    expect(document.querySelector(".afc-recovery-status")?.textContent).toContain("Requires 20 gold");
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.querySelector(".afc-recovery-status-minimized")).not.toBeNull();
    expect(document.querySelector(".afc-recovery-cost-unaffordable")).not.toBeNull();
    f.state.gold = 20;
    f.render();
    expect(document.querySelector(".afc-recovery-cost-unaffordable")).toBeNull();
    expect(document.querySelector(".afc-recovery-status")?.textContent).toContain("Requires 20 gold");
    document.querySelector<HTMLButtonElement>(".afc-recovery-status")!.click();
    f.render();
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
  });

  it("updates affordability when income reaches the exact replacement price", () => {
    const f = fixture(19.5); f.update({ globalLosses: 1, requiredSince: 1000 });
    expect(document.querySelector<HTMLButtonElement>("[data-afc-choose]")?.disabled).toBe(true);
    f.state.gold = 20;
    f.render();
    expect(document.querySelector<HTMLButtonElement>("[data-afc-choose]")?.disabled).toBe(false);
  });

  it("requires a second explicit action to withdraw and keeps confirmation through HUD updates", () => {
    const f = fixture(); f.update({ globalLosses: 1, requiredSince: 1000 });
    document.querySelector<HTMLButtonElement>("[data-afc-withdraw]")!.click();
    expect(f.send).not.toHaveBeenCalled();
    f.render();
    expect(document.querySelector<HTMLElement>("[data-afc-withdraw-confirm]")?.hidden).toBe(false);
    document.querySelector<HTMLButtonElement>("[data-afc-confirm]")!.click();
    expect(f.send).toHaveBeenCalledWith({ type: "WITHDRAW_AND_REDEPLOY" });
  });

  it("shows the pending landing countdown and clears recovery after touchdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const f = fixture(); f.update({ globalLosses: 1, requiredSince: 1000, pending: { x: 10, y: 10, cost: 20, arrivesAt: 61000, commandId: "order" } });
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.body.textContent).toContain("60s");
    vi.advanceTimersByTime(1000);
    expect(document.body.textContent).toContain("59s");
    f.update({ globalLosses: 1 });
    expect(document.getElementById("afc-recovery-ui")).toBeNull();
  });
});

it("disables fabrication actions while preserving fighting and AFC recovery", () => {
  const actions = gateAfcConstructionActions([
    { id: "build_palisade", label: "Build fort" }, { id: "build_afc", label: "Call down AFC" }, { id: "launch_attack", label: "Attack" }
  ], { globalLosses: 1, requiredSince: 1000 });
  expect(actions[0]).toMatchObject({ disabled: true, disabledReason: "Call down a new AFC to continue construction" });
  expect(actions[1]?.disabled).toBeUndefined();
  expect(actions[2]?.disabled).toBeUndefined();
});

it("does not clear an upgrade selection when the global AFC quote changes", () => {
  const state = createInitialState();
  state.pendingDomainUnlockId = "afc-exchequer-1";
  applyDomainUpdateMessage({ afcRecoveryOnly: true, gold: 80, afcRecovery: { globalLosses: 10 } }, state,
    { clearQueuedDevelopmentDispatchPending: vi.fn(), renderHud: vi.fn() });
  expect(state.pendingDomainUnlockId).toBe("afc-exchequer-1");
  expect(state.afcRecovery?.globalLosses).toBe(10);
  expect(state.gold).toBe(80);
});
