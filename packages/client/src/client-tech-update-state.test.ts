import { describe, expect, it, vi } from "vitest";
import { applyTechUpdateToState } from "./client-tech-update-state.js";

describe("applyTechUpdateToState", () => {
  it("closes the tech detail view and returns focus to the tech panel after a completed unlock", () => {
    const state = {
      pendingTechUnlockId: "coinage",
      techUiSelectedId: "coinage",
      techDetailOpen: true,
      activePanel: null,
      mobilePanel: "core",
      structureInfoKey: "BANK",
      crystalAbilityInfoKey: "reveal_empire",
      techChoices: ["coinage"],
      techIds: ["trade"],
      techRootId: undefined,
      currentResearch: undefined,
      availableTechPicks: 1,
      developmentProcessLimit: 3,
      activeDevelopmentProcessCount: 2,
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      modBreakdown: { attack: [], defense: [], income: [], vision: [] },
      incomePerMinute: 0,
      missions: [],
      techCatalog: [],
      domainIds: [],
      domainChoices: [],
      domainCatalog: [],
      revealCapacity: 1,
      activeRevealTargets: []
    } as any;

    const pushFeed = vi.fn();

    applyTechUpdateToState(
      state,
      {
        status: "completed",
        techIds: ["trade", "coinage"],
        nextChoices: ["ledger-keeping"],
        developmentProcessLimit: 4,
        activeDevelopmentProcessCount: 3,
        techCatalog: [
          { id: "trade", tier: 2, name: "Trade", description: "", mods: {}, effects: {}, requirements: { gold: 0, resources: {}, checklist: [], canResearch: false } },
          { id: "coinage", tier: 3, name: "Coinage", description: "", mods: {}, effects: { unlockBank: true }, requirements: { gold: 6500, resources: { CRYSTAL: 90 }, checklist: [], canResearch: false } },
          { id: "ledger-keeping", tier: 3, name: "Ledger Keeping", description: "", mods: {}, effects: {}, requirements: { gold: 7000, resources: {}, checklist: [], canResearch: true } }
        ] as any
      },
      pushFeed
    );

    expect(state.pendingTechUnlockId).toBe("");
    expect(state.techDetailOpen).toBe(false);
    expect(state.activePanel).toBe("tech");
    expect(state.mobilePanel).toBe("tech");
    expect(state.developmentProcessLimit).toBe(4);
    expect(state.activeDevelopmentProcessCount).toBe(3);
    expect(state.structureInfoKey).toBe("");
    expect(state.crystalAbilityInfoKey).toBe("");
    expect(state.techUiSelectedId).toBe("ledger-keeping");
    expect(pushFeed).toHaveBeenCalledWith("Research completed: Coinage.", "tech", "success");
  });
});
