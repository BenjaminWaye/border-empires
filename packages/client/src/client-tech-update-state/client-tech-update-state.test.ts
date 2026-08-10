import { describe, expect, it, vi } from "vitest";
import { applyTechUpdateToState, TECH_AFFORDABILITY_PULSE_MS, updateTechAffordabilityPulses } from "./client-tech-update-state.js";

const tech = (id: string, gold: number) =>
  ({ id, tier: 1, name: id, description: "", mods: {}, effects: {}, requirements: { gold, resources: {}, checklist: [], canResearch: true } }) as any;

describe("applyTechUpdateToState", () => {
  it("closes the tech detail view and returns focus to the tech panel after a completed unlock", () => {
    const state = {
      pendingTechUnlockId: "coinage",
      techUiSelectedId: "coinage",
      techDetailOpen: true,
      activePanel: null,
      mobilePanel: "core",
      structureInfoKey: "CLEARING_HOUSE",
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
      activeRevealTargets: [],
      gold: 0,
      techAffordableByTechId: new Map(),
      techAffordablePulseUntilByTechId: new Map()
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
          { id: "coinage", tier: 3, name: "Coinage", description: "", mods: {}, effects: { unlockClearingHouse: true }, requirements: { gold: 6500, resources: { CRYSTAL: 90 }, checklist: [], canResearch: false } },
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

  it("clamps incoming tech catalog tiers to the 7-tier tree", () => {
    const state = {
      pendingTechUnlockId: "",
      techUiSelectedId: "",
      techDetailOpen: false,
      activePanel: null,
      mobilePanel: "core",
      structureInfoKey: "",
      crystalAbilityInfoKey: "",
      techChoices: [],
      techIds: [],
      techRootId: undefined,
      currentResearch: undefined,
      availableTechPicks: 1,
      developmentProcessLimit: 3,
      activeDevelopmentProcessCount: 0,
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      modBreakdown: { attack: [], defense: [], income: [], vision: [] },
      incomePerMinute: 0,
      missions: [],
      techCatalog: [],
      domainIds: [],
      domainChoices: [],
      domainCatalog: [],
      revealCapacity: 1,
      activeRevealTargets: [],
      gold: 0,
      techAffordableByTechId: new Map(),
      techAffordablePulseUntilByTechId: new Map()
    } as any;

    applyTechUpdateToState(
      state,
      {
        techCatalog: [
          { id: "a", tier: 8, name: "A", description: "", mods: {}, effects: {}, requirements: { gold: 0, resources: {}, checklist: [], canResearch: false } },
          { id: "b", tier: 9, name: "B", description: "", mods: {}, effects: {}, requirements: { gold: 0, resources: {}, checklist: [], canResearch: false } }
        ] as any
      },
      vi.fn()
    );

    expect(state.techCatalog.map((tech: any) => tech.tier)).toEqual([7, 7]);
  });
});

describe("updateTechAffordabilityPulses", () => {
  it("does not pulse a tech seen for the first time (no prior tracked value)", () => {
    const state = { techCatalog: [tech("agriculture", 10)], gold: 10, techAffordableByTechId: new Map(), techAffordablePulseUntilByTechId: new Map() } as any;
    updateTechAffordabilityPulses(state, 1_000);
    expect(state.techAffordablePulseUntilByTechId.has("agriculture")).toBe(false);
    expect(state.techAffordableByTechId.get("agriculture")).toBe(true);
  });

  it("pulses on a false -> true affordability crossing", () => {
    const state = {
      techCatalog: [tech("agriculture", 10)],
      gold: 5,
      techAffordableByTechId: new Map([["agriculture", false]]),
      techAffordablePulseUntilByTechId: new Map()
    } as any;
    state.gold = 10;
    updateTechAffordabilityPulses(state, 1_000);
    expect(state.techAffordablePulseUntilByTechId.get("agriculture")).toBe(1_000 + TECH_AFFORDABILITY_PULSE_MS);
  });

  it("does not re-pulse a tech that was already affordable", () => {
    const state = {
      techCatalog: [tech("agriculture", 10)],
      gold: 100,
      techAffordableByTechId: new Map([["agriculture", true]]),
      techAffordablePulseUntilByTechId: new Map()
    } as any;
    updateTechAffordabilityPulses(state, 1_000);
    expect(state.techAffordablePulseUntilByTechId.has("agriculture")).toBe(false);
  });

  it("does not pulse when a tech is still unaffordable", () => {
    const state = {
      techCatalog: [tech("agriculture", 10)],
      gold: 0,
      techAffordableByTechId: new Map([["agriculture", false]]),
      techAffordablePulseUntilByTechId: new Map()
    } as any;
    updateTechAffordabilityPulses(state, 1_000);
    expect(state.techAffordablePulseUntilByTechId.has("agriculture")).toBe(false);
    expect(state.techAffordableByTechId.get("agriculture")).toBe(false);
  });

  it("applyTechUpdateToState arms a pulse end-to-end when gold crosses a tech's cost", () => {
    const state = {
      pendingTechUnlockId: "",
      techUiSelectedId: "",
      techDetailOpen: false,
      activePanel: null,
      mobilePanel: "core",
      structureInfoKey: "",
      crystalAbilityInfoKey: "",
      techChoices: [],
      techIds: [],
      techRootId: undefined,
      currentResearch: undefined,
      availableTechPicks: 1,
      developmentProcessLimit: 3,
      activeDevelopmentProcessCount: 0,
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      modBreakdown: { attack: [], defense: [], income: [], vision: [] },
      incomePerMinute: 0,
      missions: [],
      techCatalog: [tech("agriculture", 10)],
      domainIds: [],
      domainChoices: [],
      domainCatalog: [],
      revealCapacity: 1,
      activeRevealTargets: [],
      gold: 5,
      techAffordableByTechId: new Map([["agriculture", false]]),
      techAffordablePulseUntilByTechId: new Map()
    } as any;

    applyTechUpdateToState(state, { gold: 10, techCatalog: [tech("agriculture", 10)] }, vi.fn());

    expect(state.techAffordablePulseUntilByTechId.has("agriculture")).toBe(true);
  });
});
