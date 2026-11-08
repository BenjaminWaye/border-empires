// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TechInfo } from "../client-types.js";
import { renderManifestDetailHtml } from "./client-manifest-detail-html.js";
import { updateManifestDetail } from "./client-manifest-detail-dom.js";

const tech: TechInfo = {
  id: "aether", tier: 1, name: "Aether Resonance Core", branch: "aether",
  description: "Crystal lattice", mods: {}, effects: { revealResource: "crystal" },
  requirements: { gold: 40, resources: {}, checklist: [{ label: "Coin 40", met: false }], canResearch: false }
};
const html = (coin = 10, selected = tech, owned = false): string =>
  renderManifestDetailHtml({
    tech: selected, coin, techCatalog: [selected], ownedTechIds: owned ? [selected.id] : [],
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
  it("keeps the scroll container mounted while coin changes", () => {
    const host = mount();
    updateManifestDetail(host, html());
    const body = host.querySelector<HTMLElement>(".manifest-detail__body")!;
    body.scrollTop = 180;
    const replaceBody = vi.spyOn(body, "replaceChildren");
    for (const coin of [10, 11, 12, 13]) {
      updateManifestDetail(host, html(coin));
      expect(host.querySelector(".manifest-detail__body")).toBe(body);
      expect(body.scrollTop).toBe(180);
      expect(host.textContent).toContain(`you have ${coin}`);
    }
    expect(replaceBody).not.toHaveBeenCalled();
    updateManifestDetail(host, html(13, tech, true));
    expect(host.textContent).toContain("You own this Manifest");
    expect(body.scrollTop).toBe(180);
  });

  it("refreshes changed body content without losing its scroll offset", () => {
    const host = mount();
    updateManifestDetail(host, html());
    const body = host.querySelector<HTMLElement>(".manifest-detail__body")!;
    body.scrollTop = 120;
    updateManifestDetail(host, html(11, { ...tech, description: "Updated crystal lattice" }));
    expect(host.querySelector(".manifest-detail__body")).toBe(body);
    expect(body.textContent).toContain("Updated crystal lattice");
    expect(body.scrollTop).toBe(120);
  });

});
