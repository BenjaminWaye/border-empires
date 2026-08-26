import type { StructureInfoKey, StructureInfoView } from "./client-map-display.js";

// Extracted out of client-map-display.ts's structureInfoForKey (500-line
// budget, AGENTS.md) — the six converter build-menu info-panel blocks
// (Umbrite Works / Titanium Works / Aether Condenser and their Advanced tiers).
// converter-mode-flip plan §Phase 6 item 3: same both-directions treatment
// as the one-line description, plus a mention of the flip cooldown.
//
// `structure`/`imageFor`/`costBitsFor`/`buildTimeLabelFor` are the same
// per-call closures structureInfoForKey builds for every other structure
// type — passed in here rather than duplicated so this module can never
// disagree with the rest of the info panel on cost/upkeep/branch/image.
export const converterStructureInfoView = (
  type: StructureInfoKey,
  structure: (base: Omit<StructureInfoView, "image" | "effects" | "modifiers" | "upkeepBits" | "branch">, image?: string) => StructureInfoView,
  imageFor: (key: StructureInfoKey) => string | undefined,
  costBitsFor: (key: StructureInfoKey) => string[],
  buildTimeLabelFor: (key: StructureInfoKey) => string
): StructureInfoView | undefined => {
  if (type === "UMBRITE_SYNTHESIZER") {
    return structure({
      title: "Umbrite Works",
      detail: "Umbrite Works can point either way: Refine (30 gold/day upkeep) supplies +1 UMBRITE slot; Sell off instead occupies 1 UMBRITE slot for 8 gold per day. A 60-minute cooldown gates flipping direction.",
      glyph: "📦",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_UMBRITE_SYNTHESIZER") {
    return structure({
      title: "Advanced Umbrite Works",
      detail: "Advanced Umbrite Works upgrade an existing Umbrite Works: Refine (45 gold/day upkeep) supplies +1 UMBRITE slot; Sell off instead occupies 1 UMBRITE slot for 12 gold per day. Same 60-minute flip cooldown.",
      glyph: "🧵",
      placement: "Upgrade an existing Umbrite Works on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "TITANIUM_WORKS") {
    return structure({
      title: "Titanium Works",
      detail: "Titanium Works can point either way: Refine (30 gold/day upkeep) supplies +1 TITANIUM slot; Sell off instead occupies 1 TITANIUM slot for 8 gold per day. A 60-minute cooldown gates flipping direction.",
      glyph: "⚙",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_TITANIUM_WORKS") {
    return structure({
      title: "Advanced Titanium Works",
      detail: "Advanced Titanium Works upgrade an existing Titanium Works: Refine (45 gold/day upkeep) supplies +1 TITANIUM slot; Sell off instead occupies 1 TITANIUM slot for 12 gold per day. Same 60-minute flip cooldown.",
      glyph: "⚙",
      placement: "Upgrade an existing Titanium Works on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CRYSTAL_SYNTHESIZER") {
    return structure({
      title: "Aether Condenser",
      detail: "Aether Condensers can point either way: Refine (40 gold/day upkeep) supplies +1 CRYSTAL slot; Sell off instead occupies 1 CRYSTAL slot for 10 gold per day. A 60-minute cooldown gates flipping direction.",
      glyph: "💎",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") {
    return structure({
      title: "Advanced Aether Condenser",
      detail: "Advanced Aether Condensers upgrade an existing Aether Condenser: Refine (60 gold/day upkeep) supplies +1 CRYSTAL slot; Sell off instead occupies 1 CRYSTAL slot for 15 gold per day. Same 60-minute flip cooldown.",
      glyph: "💠",
      placement: "Upgrade an existing Aether Condenser on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  return undefined;
};
