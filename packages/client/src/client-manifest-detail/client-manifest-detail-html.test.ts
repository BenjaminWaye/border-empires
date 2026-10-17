import { describe, expect, it } from "vitest";
import type { TechInfo } from "../client-types.js";
import { renderManifestDetailHtml, type ManifestDetailContext } from "./client-manifest-detail-html.js";

const titaniumForge: TechInfo = {
  id: "masonry",
  tier: 1,
  name: "Titanium Forge Module",
  branch: "war",
  manifestCategory: "AFC_MODULE",
  description: "AFC module: a heavy plate-forging system delivered from offworld. Reveals Titanium and unlocks Fort and the Titanium Weapons Factory.",
  mods: {},
  effects: { unlockForts: true, unlockTitaniumWeaponsFactory: true, revealResource: "titanium" },
  requirements: { gold: 40, resources: {}, checklist: [{ label: "Coin 40", met: true }], canResearch: true }
};

const bastion: TechInfo = {
  id: "bastion",
  tier: 2,
  name: "Bastion Master-Die Module",
  branch: "war",
  manifestCategory: "AFC_MODULE",
  description: "AFC module: dies for bastion plating.",
  mods: {},
  prereqIds: ["masonry", "mining"],
  effects: { unlockTitaniumBastion: true },
  requirements: { gold: 200, resources: {}, checklist: [], canResearch: false }
};

const thunder: TechInfo = { ...bastion, id: "thunder", tier: 3, name: "Thunderplate Induction Module", prereqIds: ["bastion"], effects: { unlockThunderBastion: true } };
const mining: TechInfo = { ...bastion, id: "mining", tier: 1, name: "Prospector Crew", manifestCategory: "CREW_OFFICE_CONSIGNMENT", branch: "economy", prereqIds: [], effects: { unlockMine: true } };

const catalog = [titaniumForge, bastion, thunder, mining];

const context = (overrides: Partial<ManifestDetailContext> = {}): ManifestDetailContext => ({
  tech: titaniumForge,
  mode: "inline",
  techCatalog: catalog,
  ownedTechIds: [],
  pendingTechUnlockId: "",
  isPendingTechUnlock: () => false,
  techPrereqIds: (tech) => tech.prereqIds ?? [],
  techNameList: (ids) => ids.join(", "),
  techTier: (id, byId) => byId.get(id)?.tier ?? 1,
  structureInfoButtonHtml: (type) => `<button data-structure-info="${type}">${type}</button>`,
  ...overrides
});

const emptySlots = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };

describe("renderManifestDetailHtml", () => {
  it("names the Manifest type and branch instead of 'Technology'", () => {
    const html = renderManifestDetailHtml(context());
    expect(html).toContain("AFC Module · War · Tier 1");
    expect(html).not.toContain(">Technology<");
  });

  it("shows only the lore sentence as flavor, leaving the mechanics to the gains list", () => {
    const html = renderManifestDetailHtml(context());
    expect(html).toContain("AFC module: a heavy plate-forging system delivered from offworld.");
    expect(html).not.toContain("unlocks Fort and the Titanium Weapons Factory");
  });

  it("lists each unlock exactly once", () => {
    const html = renderManifestDetailHtml(context());
    expect(html.match(/data-structure-info="FORT"/g)).toHaveLength(1);
    expect(html.match(/data-structure-info="TITANIUM_WEAPONS_FACTORY"/g)).toHaveLength(1);
    expect(html).toContain("Reveals Titanium deposits on the map");
    expect(html).not.toContain("Unlocks forts");
  });

  it("gives each unlock row its own icon: building art, the ability's icon, the resource icon", () => {
    const html = renderManifestDetailHtml(context());
    expect(html).toContain('<span class="manifest-gain__art"><img src="/overlays/fort-ring-overlay-closed.svg"');
    expect(html).toContain('<img src="/overlays/titanium-weapons-factory-overlay.svg"');
    expect(html).toMatch(/<span class="manifest-gain__icon" aria-hidden="true"><img class="resource-icon-img" [^>]*alt="Titanium"/);
    const augury: TechInfo = { ...bastion, id: "beacon-towers", prereqIds: [], effects: { unlockSurveySweep: true, unlockRevealEmpire: true } };
    const abilities = renderManifestDetailHtml(context({ tech: augury }));
    // Each ability shows its own drawn icon, not one shared marker or a text symbol.
    expect(abilities).toContain('src="/icons/abilities/reveal-empire.svg"');
    expect(abilities).toContain('src="/icons/abilities/survey-sweep.svg"');
  });

  it("puts the cost on the unlock button for a ready Manifest", () => {
    const html = renderManifestDetailHtml(context());
    expect(html).toContain('data-tech-unlock="masonry"');
    expect(html).toContain("Unlock · 40 coin");
    expect(html).toContain("Ready to unlock");
  });

  it("switches an owned Manifest to 'What it gave you' with no unlock button", () => {
    const html = renderManifestDetailHtml(context({ ownedTechIds: ["masonry"] }));
    expect(html).toContain("What it gave you");
    expect(html).toContain("You own this Manifest");
    expect(html).not.toContain("data-tech-unlock=");
  });

  it("lists what it leads to, what else each needs, and how far the branch goes", () => {
    const html = renderManifestDetailHtml(context());
    expect(html).toContain('data-tech-card="bastion"');
    expect(html).toContain("also needs Prospector Crew");
    expect(html).toContain("and 1 more Manifest further down this branch");
  });

  it("explains why a locked Manifest is locked in the footer", () => {
    const html = renderManifestDetailHtml(context({ tech: bastion }));
    expect(html).toContain("Requires masonry, mining");
    expect(html).toMatch(/data-tech-unlock="bastion"\s+disabled/);
  });

  it("shows a Good pick badge with its reason when Titanium clues border your land", () => {
    const html = renderManifestDetailHtml(
      context({
        fit: {
          manpower: 0, hasBuildSite: () => false, ownsFish: false,
          resourceSlots: { supply: emptySlots, demand: emptySlots },
          clueNearTerritory: (signature) => signature === "FERROUS_DUST",
          surveyReportFor: () => undefined
        }
      })
    );
    expect(html).toContain("Good pick");
    expect(html).toContain("Signs of Titanium near your land");
    expect(html).not.toContain("Not useful yet");
    expect(html).not.toContain("Heads-up");
  });

  it("calls it 'Not useful yet' when nothing argues for it", () => {
    const html = renderManifestDetailHtml(
      context({ tech: mining, fit: { manpower: 0, hasBuildSite: () => false, ownsFish: false, resourceSlots: { supply: emptySlots, demand: emptySlots }, clueNearTerritory: () => false, surveyReportFor: () => undefined } })
    );
    expect(html).not.toContain("Good pick");
    expect(html).toContain("Not useful yet: Mine needs Food slots");
  });

  it("shows no badge without live player state", () => {
    expect(renderManifestDetailHtml(context())).not.toContain("Good pick");
  });

  it("wraps the same view in a backdrop for the mobile overlay", () => {
    const inline = renderManifestDetailHtml(context());
    const overlay = renderManifestDetailHtml(context({ mode: "overlay" }));
    expect(inline).not.toContain("tech-detail-backdrop");
    expect(overlay).toContain('data-tech-detail-close="backdrop"');
    expect(overlay).toContain("manifest-detail--overlay");
  });
});
