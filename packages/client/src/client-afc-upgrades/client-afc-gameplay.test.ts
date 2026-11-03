// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AFC_SPECIALIZATIONS } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { readyAfcUpgradeCount } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import { renderAfcUpgradePanels } from "./client-afc-upgrades.js";
import { AFC_MAP_EFFECT_TTL_MS, applyAfcHijackMessage } from "./client-afc-state.js";
import { attackFloorForPlayer } from "../client-attack-commit/client-attack-floor.js";
import { requiredMusterForFort, FRONTIER_ATTACK_MUSTER_COST } from "@border-empires/shared";

const stateFor = () => {
  const state = createInitialState();
  state.me = "p"; state.afcUpgradeRuleset = "afc-v1"; state.afcUpgradeInstallAllowed = true;
  state.techIds = ["tier5"]; state.techCatalog = [{ id: "tier5", name: "Tier 5", tier: 5, description: "", mods: {}, requirements: { gold: 0, resources: {} } }];
  state.domainCatalog = AFC_SPECIALIZATIONS.map(upgrade => ({ ...upgrade, mods: {}, requirements: { gold: 0, resources: {} } }));
  state.domainChoices = state.domainCatalog.filter(upgrade => upgrade.tier === 1).map(upgrade => upgrade.id);
  return state;
};
describe("AFC gameplay controls and free progression", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="desktop"></div><div id="mobile"></div>'; });
  it("shows five banked free picks at zero Coin, but no install while the AFC is lost", () => {
    const state = stateFor(); state.gold = 0;
    expect(readyAfcUpgradeCount(state)).toBe(5);
    state.afcUpgradeInstallAllowed = false;
    expect(readyAfcUpgradeCount(state)).toBe(0);
    const root = document.getElementById("mobile")!;
    renderAfcUpgradePanels(state, document.getElementById("desktop")!, root, vi.fn());
    root.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="afc-vanguard-1"]')!.click();
    expect(root.querySelector<HTMLButtonElement>("[data-domain-unlock]")?.disabled).toBe(true);
    expect(root.textContent).toContain("An active owned AFC is required");
    expect(root.querySelectorAll("[data-afc-upgrade-card]")).toHaveLength(6);
  });
  it("keeps installed history above choices and exposes recruitment and Court controls on both layouts", () => {
    const state = stateFor(); state.gold = 10; state.domainIds = ["afc-exchequer-4", "afc-chancery-1"];
    const roots = [document.getElementById("desktop")!, document.getElementById("mobile")!];
    const send = vi.fn((_payload: unknown, _message?: string) => true);
    renderAfcUpgradePanels(state, roots[0]!, roots[1]!, vi.fn(), { send });
    for (const root of roots) {
      expect(root.querySelector(".afc-upgrades")?.children[1]).toBe(root.querySelector(".afc-upgrade-history"));
      const form = root.querySelector<HTMLFormElement>("[data-afc-recruit]")!;
      form.querySelector<HTMLInputElement>("input")!.value = "3";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toEqual({ type: "RECRUIT_ANCILLARIES", coin: 3 });
  });
  it("keeps the hijack list bounded and remembers outcomes and breakthroughs briefly", () => {
    const state = stateFor();
    applyAfcHijackMessage(state, { type: "AFC_HIJACKS", hijacks: [{ targetX: 7, targetY: 8, casterX: 1, casterY: 2, attackerId: "me", victimId: "enemy", startedAt: 1, endsAt: 600_001, secret: 1 }, { targetX: "bad" }] }, 10);
    expect(state.afcHijacks).toEqual([{ targetX: 7, targetY: 8, casterX: 1, casterY: 2, attackerId: "me", victimId: "enemy", startedAt: 1, endsAt: 600_001 }]);
    applyAfcHijackMessage(state, { type: "AFC_HIJACK_OUTCOME", targetX: 7, targetY: 8, attackerId: "me", victimId: "enemy", status: "succeeded" }, 20);
    expect(state.afcHijackOutcomes).toEqual([{ targetX: 7, targetY: 8, casterX: 1, casterY: 2, attackerId: "me", victimId: "enemy", status: "succeeded", at: 20 }]);
    applyAfcHijackMessage(state, { type: "AFC_BREAKTHROUGH", attackerId: "me", fromX: 1, fromY: 1, tiles: [{ x: 2, y: 1 }] }, 20 + AFC_MAP_EFFECT_TTL_MS);
    applyAfcHijackMessage(state, { type: "AFC_HIJACK_OUTCOME", targetX: 9, targetY: 9, casterX: 4, casterY: 5, attackerId: "me", victimId: "enemy", status: "failed" }, 20 + AFC_MAP_EFFECT_TTL_MS);
    expect(state.afcHijackOutcomes.map(outcome => outcome.targetX)).toEqual([9]);
    // A failed hijack's snap beam needs the caster, which the outcome itself carries.
    expect(state.afcHijackOutcomes[0]).toMatchObject({ casterX: 4, casterY: 5, status: "failed" });
    expect(state.afcBreakthroughs).toHaveLength(1);
  });
  it("uses the same fort floor for Sappers and Defensive Depth, and a frontier floor without fort defense", () => {
    const target = { x: 1, y: 1, terrain: "LAND" as const, fogged: false, ownershipState: "SETTLED" as const, fort: { ownerId: "enemy", status: "active" as const, variant: "FORT" as const, attackCommitmentMult: 2 } };
    expect(attackFloorForPlayer({ domainIds: ["afc-vanguard-4"] }, target)).toBe(requiredMusterForFort("FORT"));
    expect(attackFloorForPlayer({}, target)).toBe(requiredMusterForFort("FORT") * 2);
    expect(attackFloorForPlayer({}, { ...target, ownershipState: "FRONTIER" })).toBe(FRONTIER_ATTACK_MUSTER_COST);
  });
});

it("preserves the recruitment amount and keyboard focus during a live economy repaint", () => {
  document.body.innerHTML = '<div id="desktop"></div><div id="mobile"></div>';
  const state = stateFor(); state.gold = 20; state.domainIds = ["afc-exchequer-4"];
  const desktop = document.getElementById("desktop")!, mobile = document.getElementById("mobile")!;
  renderAfcUpgradePanels(state, desktop, mobile, vi.fn(), { send: () => true });
  const input = mobile.querySelector<HTMLInputElement>("[data-afc-recruit] input")!; input.value = "7"; input.focus();
  state.gold = 21;
  renderAfcUpgradePanels(state, desktop, mobile, vi.fn(), { send: () => true });
  const next = mobile.querySelector<HTMLInputElement>("[data-afc-recruit] input")!;
  expect(next.value).toBe("7"); expect(document.activeElement).toBe(next);
});
