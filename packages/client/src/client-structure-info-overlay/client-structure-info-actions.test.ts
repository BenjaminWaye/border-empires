// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { structureInfoForKey } from "../client-map-display.js";
import { renderStructureInfoOverlay } from "./client-structure-info-overlay.js";
import { bindStructureInfoActions } from "./client-structure-info-actions.js";

const catalog = [{ id: "frontier-concessions", name: "Frontier Export Charter" }];
const info = (type: Parameters<typeof structureInfoForKey>[0]) =>
  structureInfoForKey(type, { formatCooldownShort: () => "1m", prettyToken: value => value });

const fixture = () => {
  const root = document.createElement("div");
  root.innerHTML = renderStructureInfoOverlay("CULTIVATION_ESTATE", info, undefined, catalog);
  document.body.append(root);
  const state = createInitialState();
  state.structureInfoKey = "CULTIVATION_ESTATE";
  state.domainDetailOpen = true;
  const renderHud = vi.fn();
  return { root, state, renderHud };
};

describe("structure info navigation", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it.each([false, true])("dismisses structure details and selects their unlock, mobile=%s", mobile => {
    const f = fixture();
    bindStructureInfoActions(f.root, { state: f.state, renderHud: f.renderHud, isMobile: () => mobile });
    const link = f.root.querySelector<HTMLButtonElement>('[data-view-tech="frontier-concessions"]');
    expect(link?.textContent).toBe("Frontier Export Charter");
    link!.click();
    expect(f.state.structureInfoKey).toBe("");
    expect(f.state.crystalAbilityInfoKey).toBe("");
    expect(f.state.activePanel).toBe("tech");
    expect(f.state.techUiSelectedId).toBe("frontier-concessions");
    expect(f.state.techDetailOpen).toBe(true);
    expect(f.state.domainDetailOpen).toBe(false);
    if (mobile) expect(f.state.mobilePanel).toBe("tech");
    expect(f.renderHud).toHaveBeenCalledOnce();
  });

  it("retains close and structure-name actions after extracting the HUD bindings", () => {
    const f = fixture();
    const source = document.createElement("button");
    source.dataset.structureInfo = "RESIN_EXTRACTOR";
    f.root.append(source);
    bindStructureInfoActions(f.root, { state: f.state, renderHud: f.renderHud, isMobile: () => false });
    source.click();
    expect(f.state.structureInfoKey).toBe("RESIN_EXTRACTOR");
    f.root.querySelector<HTMLButtonElement>('[data-structure-info-close="button"]')!.click();
    expect(f.state.structureInfoKey).toBe("");
    expect(f.renderHud).toHaveBeenCalledTimes(2);
  });
});
