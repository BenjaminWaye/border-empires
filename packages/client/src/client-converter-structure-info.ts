import type { StructureInfoKey, StructureInfoView } from "./client-map-display.js";

// Extracted out of client-map-display.ts's structureInfoForKey (500-line
// budget, AGENTS.md) — the six converter build-menu info-panel blocks
// (Fur Works / Iron Works / Aether Condenser and their Advanced tiers).
// converter-mode-flip plan §Phase 6 item 3: same both-directions treatment
// as the one-line description, plus a mention of the flip cooldown.
//
// `structure`/`imageFor`/`costBitsFor`/`buildTimeLabelFor` are the same
// per-call closures structureInfoForKey builds for every other structure
// type — passed in here rather than duplicated so this module can never
// disagree with the rest of the info panel on cost/upkeep/branch/image.
export const converterStructureInfoView = (
  type: StructureInfoKey,
  structure: (base: Omit<StructureInfoView, "image" | "effects" | "upkeepBits" | "branch">, image?: string) => StructureInfoView,
  imageFor: (key: StructureInfoKey) => string | undefined,
  costBitsFor: (key: StructureInfoKey) => string[],
  buildTimeLabelFor: (key: StructureInfoKey) => string
): StructureInfoView | undefined => {
  if (type === "FUR_SYNTHESIZER") {
    return structure({
      title: "Fur Works",
      detail: "Fur Works occupy 1 supply slot and can point either way: Refine turns gold upkeep into 18 supply per day; Sell off consumes the slot for 8 gold per day instead. A 60-minute cooldown gates flipping direction.",
      glyph: "📦",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_FUR_SYNTHESIZER") {
    return structure({
      title: "Advanced Fur Works",
      detail: "Advanced Fur Works upgrade an existing Fur Works: Refine rises from 18 to 21.6 supply per day (45 gold upkeep); Sell off pays 12 gold per day instead. Same 60-minute flip cooldown.",
      glyph: "🧵",
      placement: "Upgrade an existing Fur Works on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "IRONWORKS") {
    return structure({
      title: "Iron Works",
      detail: "Iron Works occupy 1 iron slot and can point either way: Refine turns gold upkeep into 18 iron per day; Sell off consumes the slot for 8 gold per day instead. A 60-minute cooldown gates flipping direction.",
      glyph: "⚙",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_IRONWORKS") {
    return structure({
      title: "Advanced Iron Works",
      detail: "Advanced Iron Works upgrade an existing Iron Works: Refine rises from 18 to 21.6 iron per day (45 gold upkeep); Sell off pays 12 gold per day instead. Same 60-minute flip cooldown.",
      glyph: "⚙",
      placement: "Upgrade an existing Iron Works on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CRYSTAL_SYNTHESIZER") {
    return structure({
      title: "Aether Condenser",
      detail: "Aether Condensers occupy 1 crystal slot and can point either way: Refine turns gold upkeep into 12 crystal per day; Sell off consumes the slot for 10 gold per day instead. A 60-minute cooldown gates flipping direction.",
      glyph: "💎",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") {
    return structure({
      title: "Advanced Aether Condenser",
      detail: "Advanced Aether Condensers upgrade an existing Aether Condenser: Refine rises from 12 to 14.4 crystal per day (60 gold upkeep); Sell off pays 15 gold per day instead. Same 60-minute flip cooldown.",
      glyph: "💠",
      placement: "Upgrade an existing Aether Condenser on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  return undefined;
};
