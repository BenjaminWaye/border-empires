import { formatDomainCost } from "./client-domain-cost.js";
export { formatDomainCost } from "./client-domain-cost.js";
import { BASE_COMBAT_POWER, PLAYER_BASE_VISION, TRICKLE_RESOURCE_KEYS, type ChosenTrickleResource } from "@border-empires/shared";
import type { DomainInfo, TechInfo } from "../client-types.js";
import { effectSummaryLabel } from "./client-effect-summary-label.js";
export { effectSummaryLabel } from "./client-effect-summary-label.js";
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

// Mirrors the server's hasRevealedResourceForPlayer (apps/simulation/src/
// tech-domain-bridge/tech-domain-bridge.ts) so the ribbon/economy detail
// screen don't show a resource category the player hasn't earned yet. FOOD
// is always visible, no tech required; the rest are revealed by whichever
// tech in techCatalog has effects.revealResource matching the category.
export const hasRevealedResourceCategory = (
  category: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE",
  techIds: readonly string[],
  techCatalog: readonly TechInfo[]
): boolean => {
  if (category === "FOOD") return true;
  const target = category.toLowerCase();
  return techCatalog.some((tech) => tech.effects?.revealResource === target && techIds.includes(tech.id));
};


const observatoryRangeSummaryLabel = (effects: TechInfo["effects"] | DomainInfo["effects"] | undefined): string | null => {
  if (!effects) return null;
  const unified = effects.observatoryRangeBonus;
  if (typeof unified === "number") return `Aether Tower range +${unified}`;
  const protection = effects.observatoryProtectionRadiusBonus;
  const cast = effects.observatoryCastRadiusBonus;
  if (typeof protection === "number" && typeof cast === "number" && protection === cast) {
    return `Aether Tower range +${cast}`;
  }
  return null;
};

const formatEffectSummaryLines = (effects: TechInfo["effects"] | DomainInfo["effects"] | undefined): string[] => {
  if (!effects) return [];
  const lines: string[] = [];
  const combinedObservatoryRange = observatoryRangeSummaryLabel(effects);
  let observatoryRangeInserted = false;
  for (const [key, value] of Object.entries(effects)) {
    if (combinedObservatoryRange && (key === "observatoryRangeBonus" || key === "observatoryProtectionRadiusBonus") && !observatoryRangeInserted) {
      lines.push(combinedObservatoryRange);
      observatoryRangeInserted = true;
      continue;
    }
    if (combinedObservatoryRange && key === "observatoryCastRadiusBonus") continue;
    const label = effectSummaryLabel(key, value);
    if (label) lines.push(label);
  }
  return lines;
};

// Tech-tree redesign: every tech unlocks a real building/ability, never a
// flat stat multiplier — mods (attack/defense/income/vision) are legacy
// pre-redesign data still present on some tech-tree.json rows and must not
// be surfaced to players as if they were the tech's payoff. Only effect
// (unlock) summary lines and powerup grants are shown.
export const formatTechBenefitSummary = (tech: TechInfo): string => {
  const lines = formatEffectSummaryLines(tech.effects);
  if (tech.grantsPowerup) lines.push(`Powerup: ${tech.grantsPowerup.id} +${tech.grantsPowerup.charges}`);
  return lines.length > 0 ? lines.join(" | ") : "Passive unlock";
};

export const formatDomainBenefitSummary = (domain: DomainInfo): string => {
  if (domain.mechanicalSummary) return domain.mechanicalSummary;
  const lines = formatEffectSummaryLines(domain.effects);
  return lines.length > 0 ? lines.join(" | ") : "Passive unlock";
};

// Returns the set of valid resource keys offered by this domain's
// chosenResourceSlotGrant effect, or null if the effect is absent.
// The TRICKLE_RESOURCE_KEYS list is the shared contract with the sim's
// domainHasResourceSubChoice — any change to the offered resource set
// must flip a single constant in shared.
const domainResourceSlotKeys = (
  domain: DomainInfo | undefined
): ReadonlySet<ChosenTrickleResource> | null => {
  const grant = domain?.effects?.chosenResourceSlotGrant;
  if (typeof grant !== "number" || !Number.isFinite(grant) || grant <= 0) return null;
  return new Set(TRICKLE_RESOURCE_KEYS);
};

export const domainOwnedHtml = (
  domainCatalog: DomainInfo[],
  domainIds: string[],
  chosenTrickleResource?: ChosenTrickleResource
): string => {
  if (domainIds.length === 0) return `<article class="card"><p>No domains selected yet.</p></article>`;
  const catalogById = new Map(domainCatalog.map((domain) => [domain.id, domain]));
  return domainIds
    .map((id) => {
      const domain = catalogById.get(id);
      // Surface the player's locked resource on the owned card ONLY when this
      // specific domain offered that resource. This prevents a future domain
      // with a narrower table (e.g. only TITANIUM) from misleadingly displaying
      // "(UMBRITE slot)" because the player happens to have locked UMBRITE on
      // a different domain.
      const offeredKeys = domainResourceSlotKeys(domain);
      const slotSuffix =
        offeredKeys && chosenTrickleResource && offeredKeys.has(chosenTrickleResource)
          ? ` <em>(${chosenTrickleResource} slot)</em>`
          : "";
      return `<article class="card"><strong>${domain?.name ?? id}${slotSuffix}</strong><p>${domain?.description ?? id}</p><p>${domain ? formatDomainBenefitSummary(domain) : id}</p></article>`;
    })
    .join("");
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

// Tech-tree redesign: a small colored label showing which of the 4
// player-facing branches (war, economy, manpower, aether) a tech belongs
// to. Deliberately a plain text/color tag, not a redesign of the tech card.
const TECH_BRANCH_LABELS: Record<string, string> = {
  war: "War",
  economy: "Economy",
  manpower: "Manpower",
  aether: "Aether"
};
export const techBranchTagHtml = (branch: string | undefined): string => {
  if (!branch) return "";
  const label = TECH_BRANCH_LABELS[branch] ?? branch;
  return ` <span class="tech-branch-tag tech-branch-tag-${branch}">${label}</span>`;
};

const checklistHtml = (items: Array<{ label: string; met: boolean }>, className = "tech-req-list"): string =>
  items.length > 0
    ? `<ul class="${className}">${items
        .map((item) => `<li class="${item.met ? "ok" : "bad"}">${item.met ? "✓" : "✗"} ${item.label}</li>`)
        .join("")}</ul>`
    : `<ul class="${className}"><li>None</li></ul>`;

const fallbackRequirementChecklist = (requirements: {
  gold?: number;
  resources?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
}): Array<{ label: string; met: boolean }> => {
  const out: Array<{ label: string; met: boolean }> = [];
  const goldCost = requirements.gold ?? 0;
  if (goldCost > 0) {
    out.push({ label: `Coin ${goldCost.toLocaleString()}`, met: false });
  }
  for (const resourceKey of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = requirements.resources?.[resourceKey] ?? 0;
    if (amount > 0) {
      out.push({ label: `${resourceKey} ${amount.toLocaleString()}`, met: false });
    }
  }
  return out;
};

const effectiveRequirementChecklist = (requirements: {
  gold?: number;
  resources?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
  checklist?: Array<{ label: string; met: boolean }>;
}): Array<{ label: string; met: boolean }> => {
  const checklist = requirements.checklist ?? [];
  return checklist.length > 0 ? checklist : fallbackRequirementChecklist(requirements);
};

export const ownedDomainByTier = (domainCatalog: DomainInfo[], domainIds: string[]): Map<number, DomainInfo> => {
  const catalogById = new Map(domainCatalog.map((domain) => [domain.id, domain]));
  const out = new Map<number, DomainInfo>();
  for (const id of domainIds) {
    const domain = catalogById.get(id);
    if (domain) out.set(domain.tier, domain);
  }
  return out;
};

export const currentDomainChoiceTier = (domainCatalog: DomainInfo[], domainChoices: string[]): number | undefined => {
  const byId = new Map(domainCatalog.map((domain) => [domain.id, domain]));
  const first = domainChoices.map((id) => byId.get(id)).find((domain): domain is DomainInfo => Boolean(domain));
  return first?.tier;
};

const domainTierStatus = (
  tier: number,
  ownedByTier: Map<number, DomainInfo>,
  currentTier?: number
): {
  tone: "chosen" | "current" | "locked";
  badge: string;
  detail: string;
} => {
  const owned = ownedByTier.get(tier);
  if (owned) {
    return {
      tone: "chosen",
      badge: "Chosen",
      detail: `Tier ${tier} is already committed to ${owned.name}. You cannot choose another domain at this tier.`
    };
  }
  if (currentTier === tier) {
    return {
      tone: "current",
      badge: "Choose 1",
      detail: `Pick exactly one domain for Tier ${tier}. Once chosen, the other domains in this tier are closed.`
    };
  }
  return {
    tone: "locked",
    badge: "Locked",
    detail: tier < (currentTier ?? 0) ? `This tier is no longer available because your choice is already set.` : `Unlock Tier ${Math.max(1, tier - 1)} first to reach this tier.`
  };
};

const domainCardBlockedReason = (
  domain: DomainInfo,
  ownedByTier: Map<number, DomainInfo>,
  currentTier?: number
): string | undefined => {
  const owned = ownedByTier.get(domain.tier);
  if (owned && owned.id !== domain.id) return `Tier ${domain.tier} already committed to ${owned.name}`;
  if (currentTier !== undefined && domain.tier > currentTier) return `Locked until Tier ${domain.tier - 1} is chosen`;
  if (currentTier !== undefined && domain.tier < currentTier && !owned) return "Tier no longer available";
  const unmet = (domain.requirements.checklist ?? []).find((check) => !check.met);
  return unmet?.label;
};

export const renderDomainChoiceGridHtml = (args: {
  domainCatalog: DomainInfo[];
  domainIds: string[];
  domainUiSelectedId: string;
  ownedByTier: Map<number, DomainInfo>;
  currentTier: number | undefined;
  requiresTechNames: Record<string, string>;
}): string => {
  const { domainCatalog, domainIds, domainUiSelectedId, ownedByTier, currentTier } = args;
  if (domainCatalog.length === 0) return `<article class="card"><p>No domains available right now.</p></article>`;
  const grouped = new Map<number, DomainInfo[]>();
  for (const domain of domainCatalog) {
    const arr = grouped.get(domain.tier) ?? [];
    arr.push(domain);
    grouped.set(domain.tier, arr);
  }
  const tiers = [...grouped.keys()].sort((a, b) => a - b);
  const summary =
    currentTier !== undefined
      ? `<article class="card domain-summary-card">
          <div class="domain-summary-kicker">Domains</div>
          <strong>Choose one domain for Tier ${currentTier}</strong>
          <p>Each tier allows exactly one doctrine. Explore for shard caches and catch shard rain to fund the next machine-doctrine pick.</p>
        </article>`
      : `<article class="card domain-summary-card">
          <div class="domain-summary-kicker">Domains</div>
          <strong>All current domain tiers are committed</strong>
          <p>You can only choose one doctrine per tier. Review the path you locked in below and keep feeding it with shards from exploration and shardfalls.</p>
        </article>`;
  const sections = tiers
    .map((tier) => {
      const status = domainTierStatus(tier, ownedByTier, currentTier);
      const cards = (grouped.get(tier) ?? [])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((domain) => {
          const selected = domainUiSelectedId === domain.id ? " selected" : "";
          const owned = domainIds.includes(domain.id) ? " owned" : "";
          const blockedReason = domainCardBlockedReason(domain, ownedByTier, currentTier);
          const blocked = blockedReason && !owned ? " blocked" : "";
          const cardBadge = owned ? "Chosen" : currentTier === tier ? "Candidate" : "Unavailable";
          const canUnlock = Boolean(domain.requirements.canResearch) && !domainIds.includes(domain.id);
          const unmetChecklist = owned ? [] : (domain.requirements.checklist ?? []).filter((item) => !item.met);
          const unmetRequirementsHtml = unmetChecklist
            .slice(0, 2)
            .map((item) => `<p class="tech-card-requirement tech-card-requirement-bad">✗ ${item.label}</p>`)
            .join("");
          return `<button type="button" class="tech-card domain-card domain-card-${status.tone}${selected}${owned}${blocked}" data-domain-card="${domain.id}" data-domain-can-unlock="${canUnlock ? "true" : "false"}">
            <div class="tech-card-top">
              <strong>${domain.name}</strong>
              <span class="domain-card-badge">${cardBadge}</span>
            </div>
            <p>${formatDomainBenefitSummary(domain)}</p>
            ${unmetRequirementsHtml}
            <p class="tech-card-cost">${
              owned
                ? "Tier locked in"
                : unmetChecklist.length > 0
                  ? blockedReason || "Requirements not met"
                  : blockedReason || formatDomainCost(domain)
            }</p>
          </button>`;
        })
        .join("");
      return `<section class="tech-tier-block domain-tier-block domain-tier-block-${status.tone}">
        <div class="domain-tier-head">
          <div>
            <h4>Tier ${tier}</h4>
            <p>${status.detail}</p>
          </div>
          <span class="domain-tier-badge domain-tier-badge-${status.tone}">${status.badge}</span>
        </div>
        <div class="tech-card-grid">${cards}</div>
      </section>`;
    })
    .join("");
  return `${summary}${sections}`;
};

export const renderDomainDetailCardHtml = (args: {
  domain: DomainInfo | undefined;
  domainIds: string[];
  chosenInTier: DomainInfo | undefined;
  currentTier: number | undefined;
  requiresTechName: string;
  pendingDomainUnlockId?: string;
  chosenTrickleResource?: ChosenTrickleResource;
  showInlineClose?: boolean;
}): string => {
  const { domain, domainIds, chosenInTier, currentTier, requiresTechName, pendingDomainUnlockId = "", chosenTrickleResource, showInlineClose = true } = args;
  if (!domain) return `<article class="card"><p>Select a domain card to inspect details.</p></article>`;
  const checklist = effectiveRequirementChecklist(domain.requirements);
  const owned = domainIds.includes(domain.id);
  const pendingUnlock = pendingDomainUnlockId === domain.id;
  const blockedByPending = Boolean(pendingDomainUnlockId && pendingDomainUnlockId !== domain.id);
  const canUnlock = domain.requirements.canResearch && !owned && !pendingDomainUnlockId;
  // Surface the locked resource on the detail card only when this specific
  // domain offered it — same gate as the owned-summary card, so a
  // future narrower-table domain doesn't claim credit for a pick made on
  // another domain.
  const detailOfferedKeys = domainResourceSlotKeys(domain);
  const detailSlotGrant =
    owned && chosenTrickleResource && detailOfferedKeys?.has(chosenTrickleResource)
      ? (domain.effects?.chosenResourceSlotGrant as number | undefined)
      : undefined;
  const slotSection =
    detailSlotGrant !== undefined && detailSlotGrant > 0
      ? `<section class="structure-info-section">
        <span class="structure-info-section-label">Your pick</span>
        <strong>${chosenTrickleResource} (+${detailSlotGrant} slot${detailSlotGrant === 1 ? "" : "s"}, locked)</strong>
      </section>`
      : "";
  const tierRuleText =
    chosenInTier && chosenInTier.id !== domain.id
      ? `Tier ${domain.tier} is already filled by ${chosenInTier.name}.`
      : currentTier === domain.tier
        ? `This is one of the current Tier ${domain.tier} choices. You may choose exactly one.`
        : chosenInTier?.id === domain.id
          ? `You already chose this for Tier ${domain.tier}.`
          : `This domain will only become choosable when Tier ${domain.tier} opens.`;
  const buttonLabel = owned ? "Chosen" : pendingUnlock ? `Choosing Tier ${domain.tier}...` : canUnlock ? `Choose Tier ${domain.tier}` : "Locked";
  const statusText = pendingUnlock
    ? "Sending your domain choice to the server..."
    : blockedByPending
      ? "Waiting for the current domain choice to resolve..."
      : "";
  return `<article class="card tech-detail-card tech-detail-card-shell" id="domain-detail-card" data-domain-detail-card>
    <div class="tech-detail-inline-head">
      <div class="tech-detail-inline-copy">
        <div class="tech-detail-kicker">Domain</div>
        <strong>${domain.name}</strong>
        <p class="muted">Tier ${domain.tier} · Requires ${requiresTechName}</p>
      </div>
      ${
        showInlineClose
          ? '<button class="panel-btn tech-detail-close-inline" type="button" aria-label="Close domain details" data-domain-detail-close="button">Close</button>'
          : ""
      }
    </div>
    <div class="tech-detail-inline-scroll">
      <p class="domain-detail-tier-rule">${tierRuleText}</p>
      ${statusText ? `<p class="muted">${statusText}</p>` : ""}
      <p>${domain.description}</p>
      ${slotSection}
      <section class="structure-info-section">
        <span class="structure-info-section-label">Benefits</span>
        <strong>${formatDomainBenefitSummary(domain)}</strong>
      </section>
      <section class="structure-info-section">
        <span class="structure-info-section-label">Cost</span>
        <strong>${formatDomainCost(domain)}</strong>
      </section>
      <section class="structure-info-section">
        <span class="structure-info-section-label">Requirements</span>
        ${checklistHtml(checklist)}
      </section>
    </div>
    <div class="tech-detail-actions">
      <button class="panel-btn tech-unlock-btn tech-unlock-btn-modal domain-unlock-btn" data-domain-unlock="${domain.id}" ${
        canUnlock || pendingUnlock ? "" : "disabled"
      }>${buttonLabel}</button>
    </div>
  </article>`;
};
