// techCurrentModsHtml and its private helpers, extracted from
// client-tech-html.ts (500-line source budget, see AGENTS.md) to make room
// for the Manifest tree naming/lore pass's Ancillary Depot/Reserve Lattice
// unlock-effect labels without growing that already-oversized file further.
// No logic changes here, just a code move.
import { BASE_COMBAT_POWER, PLAYER_BASE_VISION } from "@border-empires/shared";
import type { DomainInfo, TechInfo } from "../client-types.js";

type ModKey = "attack" | "defense" | "income" | "vision";
type ModBreakdown = Record<ModKey, Array<{ label: string; mult: number }>>;
type ActiveBonusContext = {
  techCatalog: TechInfo[];
  ownedTechIds: string[];
  domainCatalog: DomainInfo[];
  domainIds: string[];
};
type StatChipKey = ModKey;
type ActiveBonusBreakdownEntry =
  | { label: string; kind: "mult"; mult: number }
  | { label: string; kind: "radius"; amount: number };

// Attack/Defense are shown as the absolute effective-power number combat
// actually uses (BASE_COMBAT_POWER x every persistent multiplier), not a %
// delta, so players can read the same number the win-chance formula does.
const formatCombatPower = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

const formatMultiplierNumber = (mult: number): { text: string; tone: "positive" | "negative" | "neutral" } => {
  const rounded = Math.round(mult * 1000) / 1000;
  if (Math.abs(rounded - 1) < 0.0005) return { text: "×1.00", tone: "neutral" };
  return { text: `×${rounded.toFixed(2)}`, tone: rounded > 1 ? "positive" : "negative" };
};

export const techCurrentModsHtml = (
  mods: Record<ModKey, number>,
  expandedModKey: ModKey | null,
  modBreakdown: ModBreakdown,
  activeBonusContext?: ActiveBonusContext
): string => {
  const ownedTechs = activeBonusContext
    ? activeBonusContext.ownedTechIds
        .map((id) => activeBonusContext.techCatalog.find((tech) => tech.id === id))
        .filter((tech): tech is TechInfo => Boolean(tech))
    : [];
  const ownedDomains = activeBonusContext
    ? activeBonusContext.domainIds
        .map((id) => activeBonusContext.domainCatalog.find((domain) => domain.id === id))
        .filter((domain): domain is DomainInfo => Boolean(domain))
    : [];
  const ownedProgression = [...ownedTechs, ...ownedDomains];
  const radiusEntries = ownedProgression
    .map((entry) => {
      const amount = entry.effects?.visionRadiusBonus;
      return typeof amount === "number" && Number.isFinite(amount) && amount !== 0
        ? { label: entry.name, kind: "radius" as const, amount }
        : undefined;
    })
    .filter((entry): entry is Extract<ActiveBonusBreakdownEntry, { kind: "radius" }> => Boolean(entry));
  const visionRadiusBonus = radiusEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const effectiveVisionRadius = Math.max(1, Math.floor(PLAYER_BASE_VISION * (mods.vision ?? 1)) + visionRadiusBonus);

  // The tech tab's Attack/Defense chip is meant to read as the same base
  // power the win-chance formula starts from — BASE_COMBAT_POWER times every
  // persistent multiplier the player has, which is exactly what modBreakdown
  // already lists (tech/domain mods, plus the informational weapons-factory
  // rows appended by appendWeaponsFactoryBreakdownEntries).
  const combinedBreakdownMult = (key: ModKey): number => (modBreakdown[key] ?? []).reduce((acc, entry) => acc * entry.mult, 1);

  const statDefs = [
    {
      key: "attack",
      label: "Attack",
      short: "ATK",
      icon: "△",
      valueLabel: formatCombatPower(BASE_COMBAT_POWER * combinedBreakdownMult("attack")),
      tone: "attack",
      entries: undefined
    },
    {
      key: "defense",
      label: "Defense",
      short: "DEF",
      icon: "⬡",
      valueLabel: formatCombatPower(BASE_COMBAT_POWER * combinedBreakdownMult("defense")),
      tone: "defense",
      entries: undefined
    },
    {
      key: "vision",
      label: "Vision",
      short: "VIS",
      icon: "◉",
      valueLabel: `${effectiveVisionRadius} tiles`,
      tone: "vision",
      entries: [
        ...(mods.vision !== 1
          ? (modBreakdown.vision ?? [])
              .filter((entry) => entry.label.trim().toLowerCase() !== "base")
              .map((entry): ActiveBonusBreakdownEntry => ({ label: `${entry.label}: radius multiplier`, kind: "mult", mult: entry.mult }))
          : []),
        ...radiusEntries
      ]
    }
  ] as const;
  const effectiveExpandedModKey = statDefs.some((entry) => entry.key === expandedModKey) ? expandedModKey : null;
  const chips = statDefs
    .map(({ key, label, short, icon, valueLabel, tone, entries }) => {
      const sources = entries ?? (modBreakdown[key] ?? [])
        .filter((entry) => entry.label.trim().toLowerCase() !== "base")
        .map((entry): ActiveBonusBreakdownEntry => ({ label: entry.label, kind: "mult", mult: entry.mult }));
      const inspectable = sources.length > 0;
      const expanded = effectiveExpandedModKey === key;
      const chipClass = `panel-btn tech-mod-chip tech-mod-chip-${tone}${expanded ? " selected" : ""}${inspectable ? "" : " is-static"}`;
      const chipBody = `<div class="tech-mod-chip-main">
          <span class="tech-mod-chip-label"><span class="tech-mod-chip-icon" aria-hidden="true">${icon}</span><span>${label}</span></span>
          <strong>${valueLabel}</strong>
        </div>
        <div class="tech-mod-chip-meta"><span>${short}</span><span class="tech-mod-chip-expand">${inspectable ? (expanded ? "Hide details" : "Tap to inspect") : "No extra sources"}${inspectable ? " ▾" : ""}</span></div>`;
      if (!inspectable) {
        return `<div class="${chipClass}" aria-disabled="true">${chipBody}</div>`;
      }
      return `<button class="${chipClass}" data-mod-chip="${key}" aria-expanded="${expanded ? "true" : "false"}">
        <div class="tech-mod-chip-main">
          <span class="tech-mod-chip-label"><span class="tech-mod-chip-icon" aria-hidden="true">${icon}</span><span>${label}</span></span>
          <strong>${valueLabel}</strong>
        </div>
        <div class="tech-mod-chip-meta"><span>${short}</span><span class="tech-mod-chip-expand">${expanded ? "Hide details" : "Tap to inspect"} ▾</span></div>
      </button>`;
    })
    .join("");
  const formatTechModDelta = (mult: number): { text: string; tone: "positive" | "negative" | "neutral" } => {
    const delta = (mult - 1) * 100;
    const rounded = Math.round(delta * 10) / 10;
    if (Math.abs(rounded) < 0.05) return { text: "0%", tone: "neutral" };
    const prefix = rounded > 0 ? "+" : "";
    const hasFraction = Math.abs(rounded % 1) > 0.001;
    return {
      text: `${prefix}${hasFraction ? rounded.toFixed(1) : rounded.toFixed(0)}%`,
      tone: rounded > 0 ? "positive" : "negative"
    };
  };
  const formatBreakdownEntry = (entry: ActiveBonusBreakdownEntry): { text: string; tone: "positive" | "negative" | "neutral" } => {
    if (entry.kind === "radius") {
      return {
        text: `${entry.amount >= 0 ? "+" : ""}${entry.amount} radius`,
        tone: entry.amount > 0 ? "positive" : entry.amount < 0 ? "negative" : "neutral"
      };
    }
    return formatTechModDelta(entry.mult);
  };
  const breakdownEntriesForExpandedKey = (key: StatChipKey): ActiveBonusBreakdownEntry[] => {
    const statDef = statDefs.find((entry) => entry.key === key);
    if (statDef?.entries) return [...statDef.entries];
    return (modBreakdown[key] ?? [])
      .filter((entry) => entry.label.trim().toLowerCase() !== "base")
      .map((entry): ActiveBonusBreakdownEntry => ({ label: entry.label, kind: "mult", mult: entry.mult }));
  };
  const isNumericPowerKey = effectiveExpandedModKey === "attack" || effectiveExpandedModKey === "defense";
  const breakdown =
    effectiveExpandedModKey === null
      ? ""
      : `<div class="tech-mod-breakdown">${breakdownEntriesForExpandedKey(effectiveExpandedModKey)
          .map((entry) => {
            const delta = isNumericPowerKey && entry.kind === "mult" ? formatMultiplierNumber(entry.mult) : formatBreakdownEntry(entry);
            return `<div class="tech-mod-breakdown-row"><span>${entry.label}</span><strong class="tech-mod-delta ${delta.tone}">${delta.text}</strong></div>`;
          })
          .join("")}</div>`;
  return `
    <div class="card tech-mod-card">
      <div class="tech-mod-card-head">
        <div class="tech-mod-card-title">Active Bonuses</div>
        <div class="tech-mod-card-hint">${effectiveExpandedModKey === null ? "Tap a bonus to inspect its sources" : "Bonus source breakdown below"}</div>
      </div>
      <div class="tech-mod-strip">${chips}</div>
      ${breakdown}
    </div>
  `;
};
