// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TechInfo } from "../client-types.js";
import { renderManifestDetailHtml, type ManifestDetailMode } from "./client-manifest-detail-html.js";
import { renderMobileManifestOverlay, updateManifestDetail } from "./client-manifest-detail-dom.js";

const tech: TechInfo = {
  id: "aether", tier: 1, name: "Aether Resonance Core", branch: "aether",
  description: "Crystal lattice", mods: {}, effects: { revealResource: "crystal" },
  requirements: { gold: 40, resources: {}, checklist: [{ label: "Coin 40", met: false }], canResearch: false }
};
const html = (mode: ManifestDetailMode, coin = 10, selected = tech, owned = false): string =>
  renderManifestDetailHtml({
    tech: selected, mode, coin, techCatalog: [selected], ownedTechIds: owned ? [selected.id] : [],
    pendingTechUnlockId: "", isPendingTechUnlock: () => false,
    techPrereqIds: () => [], techNameList: (ids) => ids.join(", "), techTier: () => 1,
    structureInfoButtonHtml: (type) => `<button data-structure-info="${type}">${type}</button>`
  });
const mount = (): HTMLDivElement => {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
};
afterEach(() => document.body.replaceChildren());

describe("Manifest detail live updates", () => {
  it.each(["overlay", "inline"] as const)("keeps the %s scroll container mounted while coin changes", (mode) => {
    const host = mount();
    updateManifestDetail(host, html(mode));
    const body = host.querySelector<HTMLElement>(".manifest-detail__body")!;
    body.scrollTop = 180;
    const replaceBody = vi.spyOn(body, "replaceChildren");
    for (const coin of [10, 11, 12, 13]) {
      updateManifestDetail(host, html(mode, coin));
      expect(host.querySelector(".manifest-detail__body")).toBe(body);
      expect(body.scrollTop).toBe(180);
      expect(host.textContent).toContain(`you have ${coin}`);
    }
    expect(replaceBody).not.toHaveBeenCalled();
    updateManifestDetail(host, html(mode, 13, tech, true));
    expect(host.textContent).toContain("You own this Manifest");
    expect(body.scrollTop).toBe(180);
  });

  it("refreshes changed body content without losing its scroll offset", () => {
    const host = mount();
    updateManifestDetail(host, html("overlay"));
    const body = host.querySelector<HTMLElement>(".manifest-detail__body")!;
    body.scrollTop = 120;
    updateManifestDetail(host, html("overlay", 11, { ...tech, description: "Updated crystal lattice" }));
    expect(host.querySelector(".manifest-detail__body")).toBe(body);
    expect(body.textContent).toContain("Updated crystal lattice");
    expect(body.scrollTop).toBe(120);
  });

  it("starts at the top when switching Manifest or reopening the mobile menu", () => {
    const host = mount();
    const render = () => html("overlay");
    const state = { techDetailOpen: true, domainDetailOpen: false };
    renderMobileManifestOverlay(host, true, state, render, () => "");
    host.querySelector<HTMLElement>(".manifest-detail__body")!.scrollTop = 200;
    updateManifestDetail(host, html("overlay", 10, { ...tech, id: "other" }));
    expect(host.querySelector<HTMLElement>(".manifest-detail__body")!.scrollTop).toBe(0);
    renderMobileManifestOverlay(host, true, { ...state, techDetailOpen: false }, render, () => "");
    expect(host.innerHTML).toBe("");
    expect(host.style.display).toBe("none");
    renderMobileManifestOverlay(host, true, state, render, () => "");
    expect(host.style.display).toBe("grid");
    expect(host.querySelector<HTMLElement>(".manifest-detail__body")!.scrollTop).toBe(0);
  });
});
