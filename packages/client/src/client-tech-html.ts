import type { DomainInfo, TechInfo } from "./client-types.js";

type ModKey = "attack" | "defense" | "income" | "vision";
type ModBreakdown = Record<ModKey, Array<{ label: string; mult: number }>>;

const effectSummaryLabel = (key: string, value: unknown): string | null => {
  if (key === "unlockFarmstead" && value === true) return "Unlocks farmsteads";
  if (key === "unlockCamp" && value === true) return "Unlocks camps";
  if (key === "unlockMine" && value === true) return "Unlocks mines";
  if (key === "unlockMarket" && value === true) return "Unlocks markets";
  if (key === "unlockForts" && value === true) return "Unlocks forts";
  if (key === "unlockObservatory" && value === true) return "Unlocks observatories";
  if (key === "unlockSiegeOutposts" && value === true) return "Unlocks siege outposts";
  if (key === "unlockGranary" && value === true) return "Unlocks granaries";
  if (key === "unlockBank" && value === true) return "Unlocks banks";
  if (key === "unlockCaravanary" && value === true) return "Unlocks caravanaries";
  if (key === "unlockFurSynthesizer" && value === true) return "Unlocks fur synthesizers";
  if (key === "unlockIronworks" && value === true) return "Unlocks ironworks";
  if (key === "unlockCrystalSynthesizer" && value === true) return "Unlocks crystal synthesizers";
  if (key === "unlockSynthOverload" && value === true) return "Unlocks synthesizer overload";
  if (key === "unlockAdvancedSynthesizers" && value === true) return "Unlocks advanced synthesizer upgrades";
  if (key === "unlockFuelPlant" && value === true) return "Unlocks fuel plants";
  if (key === "unlockFoundry" && value === true) return "Unlocks foundries";
  if (key === "unlockCustomsHouse" && value === true) return "Unlocks customs houses";
  if (key === "unlockGovernorsOffice" && value === true) return "Unlocks governor's offices";
  if (key === "unlockGarrisonHall" && value === true) return "Unlocks garrison halls";
  if (key === "unlockAirport" && value === true) return "Unlocks airports";
  if (key === "unlockRadarSystem" && value === true) return "Unlocks radar systems";
  if (key === "unlockRevealRegion" && value === true) return "Unlocks reveal region";
  if (key === "unlockRevealEmpire" && value === true) return "Unlocks empire reveal";
  if (key === "unlockRevealEmpireStats" && value === true) return "Unlocks Reveal Empire Stats";
  if (key === "unlockAetherWall" && value === true) return "Unlocks Aether Wall";
  if (key === "unlockDeepStrike" && value === true) return "Unlocks deep strike";
  if (key === "unlockNavalInfiltration" && value === true) return "Unlocks Aether Bridge";
  if (key === "unlockSabotage" && value === true) return "Unlocks sabotage";
  if (key === "unlockMountainPass" && value === true) return "Unlocks mountain pass";
  if (key === "unlockTerrainShaping" && value === true) return "Unlocks terrain shaping";
  if (key === "unlockBreachAttack" && value === true) return "Unlocks breach attack";
  if (key === "dockGoldOutputMult" && typeof value === "number") return `Dock income +${Math.round((value - 1) * 100)}%`;
  if (key === "dockGoldCapMult" && typeof value === "number") return `Dock cap +${Math.round((value - 1) * 100)}%`;
  if (key === "dockConnectionBonusPerLink" && typeof value === "number") return `Dock route bonus ${Math.round(value * 100)}% per link`;
  if (key === "dockRoutesVisible" && value === true) return "Shows dock routes";
  if (key === "supportEconomicFoodUpkeepMult" && typeof value === "number") return `Town support food upkeep -${Math.round((1 - value) * 100)}%`;
  if (key === "resourceOutputMult" && value && typeof value === "object") {
    const resourceOutput = value as Record<string, unknown>;
    const labels: string[] = [];
    if (typeof resourceOutput.farm === "number" && resourceOutput.farm !== 1) {
      labels.push(`Farm output +${((resourceOutput.farm - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.fish === "number" && resourceOutput.fish !== 1) {
      labels.push(`Fish output +${((resourceOutput.fish - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.iron === "number" && resourceOutput.iron !== 1) {
      labels.push(`Iron output +${((resourceOutput.iron - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.crystal === "number" && resourceOutput.crystal !== 1) {
      labels.push(`Crystal output +${((resourceOutput.crystal - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.supply === "number" && resourceOutput.supply !== 1) {
      labels.push(`Supply output +${((resourceOutput.supply - 1) * 100).toFixed(0)}%`);
    }
    if (typeof resourceOutput.shard === "number" && resourceOutput.shard !== 1) {
      labels.push(`Shard output +${((resourceOutput.shard - 1) * 100).toFixed(0)}%`);
    }
    return labels.length > 0 ? labels.join(" | ") : null;
  }
  if (key === "settlementSpeedMult" && typeof value === "number") return `Settlement speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "developmentProcessCapacityAdd" && typeof value === "number") return `Development slots +${value}`;
  if (key === "abilityCooldownMult" && typeof value === "number")
    return `All ability cooldowns ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "sabotageCooldownMult" && typeof value === "number")
    return `Sabotage cooldown ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "newSettlementDefenseMult" && typeof value === "number")
    return `New settlement defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "settledFoodUpkeepMult" && typeof value === "number") return `Settled food upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "settledGoldUpkeepMult" && typeof value === "number") return `Settled gold upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "townFoodUpkeepMult" && typeof value === "number") return `Town food upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "townGoldOutputMult" && typeof value === "number") return `Town gold output ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "firstThreeTownsGoldOutputMult" && typeof value === "number")
    return `First 3 towns gold ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "townGoldCapMult" && typeof value === "number") return `Town cap ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "firstThreeTownsPopulationGrowthMult" && typeof value === "number")
    return `First 3 towns growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "marketIncomeBonusAdd" && typeof value === "number") return `Market income +${Math.round(value * 100)} pts`;
  if (key === "marketCapBonusAdd" && typeof value === "number") return `Market cap +${Math.round(value * 100)} pts`;
  if (key === "marketBonusMult" && typeof value === "number") return `Market bonus ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "granaryBonusMult" && typeof value === "number") return `Granary growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "granaryCapBonusAddPctPoints" && typeof value === "number") return `Granary growth +${Math.round(value * 100)} pts`;
  if (key === "populationGrowthMult" && typeof value === "number") return `Population growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "populationIncomeMult" && typeof value === "number") return `Population income ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "connectedTownStepBonusAdd" && typeof value === "number") return `Connected-city bonus +${Math.round(value * 100)} pts/step`;
  if (key === "growthPauseDurationMult" && typeof value === "number") return `War growth pause ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "buildCapacityAdd" && typeof value === "number") return `Build capacity ${value >= 0 ? "+" : ""}${value}`;
  if (key === "operationalTempoMult" && typeof value === "number") return `Operational tempo ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "harvestCapMult" && typeof value === "number") return `Harvest cap ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "fortDefenseMult" && typeof value === "number") return `Fort defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "fortBuildGoldCostMult" && typeof value === "number") return `Fort cost ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "fortIronUpkeepMult" && typeof value === "number") return `Fort iron upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "fortGoldUpkeepMult" && typeof value === "number") return `Fort gold upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "settledDefenseNearFortMult" && typeof value === "number")
    return `Settled defense near forts ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "outpostAttackMult" && typeof value === "number") return `Outpost attack ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "outpostSupplyUpkeepMult" && typeof value === "number") return `Outpost supply upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "outpostGoldUpkeepMult" && typeof value === "number") return `Outpost gold upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "revealUpkeepMult" && typeof value === "number") return `Reveal upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "revealCapacityBonus" && typeof value === "number") return `Reveal capacity +${value}`;
  if (key === "visionRadiusBonus" && typeof value === "number") return `Vision radius +${value}`;
  if (key === "observatoryProtectionRadiusBonus" && typeof value === "number") return `Observatory protection radius +${value}`;
  if (key === "observatoryCastRadiusBonus" && typeof value === "number") return `Observatory cast radius +${value}`;
  if (key === "frontierDefenseAdd" && typeof value === "number") return `Frontier defense +${value}`;
  if (key === "settledDefenseMult" && typeof value === "number") return `Settled defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsSettledMult" && typeof value === "number") return `Attack vs settled ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsFortsMult" && typeof value === "number") return `Attack vs forts ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  return null;
};

const formatTechModifiers = (mods: TechInfo["mods"]): string[] => {
  const lines: string[] = [];
  if (typeof mods.attack === "number" && mods.attack !== 1) lines.push(`Attack ${mods.attack > 1 ? "+" : ""}${((mods.attack - 1) * 100).toFixed(0)}%`);
  if (typeof mods.defense === "number" && mods.defense !== 1) lines.push(`Defense ${mods.defense > 1 ? "+" : ""}${((mods.defense - 1) * 100).toFixed(0)}%`);
  if (typeof mods.income === "number" && mods.income !== 1) lines.push(`Income ${mods.income > 1 ? "+" : ""}${((mods.income - 1) * 100).toFixed(0)}%`);
  if (typeof mods.vision === "number" && mods.vision !== 1) lines.push(`Vision ${mods.vision > 1 ? "+" : ""}${((mods.vision - 1) * 100).toFixed(0)}%`);
  return lines;
};

const formatDomainModifiers = (mods: DomainInfo["mods"]): string[] => {
  const lines: string[] = [];
  if (typeof mods.attack === "number" && mods.attack !== 1) lines.push(`Attack ${mods.attack > 1 ? "+" : ""}${((mods.attack - 1) * 100).toFixed(0)}%`);
  if (typeof mods.defense === "number" && mods.defense !== 1) lines.push(`Defense ${mods.defense > 1 ? "+" : ""}${((mods.defense - 1) * 100).toFixed(0)}%`);
  if (typeof mods.income === "number" && mods.income !== 1) lines.push(`Income ${mods.income > 1 ? "+" : ""}${((mods.income - 1) * 100).toFixed(0)}%`);
  if (typeof mods.vision === "number" && mods.vision !== 1) lines.push(`Vision ${mods.vision > 1 ? "+" : ""}${((mods.vision - 1) * 100).toFixed(0)}%`);
  return lines;
};

export const formatTechBenefitSummary = (tech: TechInfo): string => {
  const lines = formatTechModifiers(tech.mods);
  if (tech.effects) {
    for (const [key, value] of Object.entries(tech.effects)) {
      const label = effectSummaryLabel(key, value);
      if (label) lines.push(label);
    }
  }
  if (tech.grantsPowerup) lines.push(`Powerup: ${tech.grantsPowerup.id} +${tech.grantsPowerup.charges}`);
  return lines.length > 0 ? lines.join(" | ") : "Passive unlock";
};

export const formatDomainBenefitSummary = (domain: DomainInfo): string => {
  const lines = formatDomainModifiers(domain.mods);
  if (domain.effects) {
    for (const [key, value] of Object.entries(domain.effects)) {
      const label = effectSummaryLabel(key, value);
      if (label) lines.push(label);
    }
  }
  return lines.length > 0 ? lines.join(" | ") : "Passive unlock";
};

export const techOwnedHtml = (
  techCatalog: TechInfo[],
  ownedTechIds: string[],
  isPendingTechUnlock: (techId: string) => boolean
): string => {
  if (ownedTechIds.length === 0) return `<article class="card"><p>No techs selected yet.</p></article>`;
  const catalogById = new Map(techCatalog.map((tech) => [tech.id, tech]));
  return ownedTechIds
    .map((id) => {
      const tech = catalogById.get(id);
      const pending = isPendingTechUnlock(id) ? `<p class="muted">Unlocking...</p>` : "";
      return `<article class="card"><strong>${tech?.name ?? id}</strong>${pending}<p>${tech?.description ?? id}</p><p>${tech ? formatTechBenefitSummary(tech) : id}</p></article>`;
    })
    .join("");
};

export const domainOwnedHtml = (domainCatalog: DomainInfo[], domainIds: string[]): string => {
  if (domainIds.length === 0) return `<article class="card"><p>No domains selected yet.</p></article>`;
  const catalogById = new Map(domainCatalog.map((domain) => [domain.id, domain]));
  return domainIds
    .map((id) => {
      const domain = catalogById.get(id);
      return `<article class="card"><strong>${domain?.name ?? id}</strong><p>${domain?.description ?? id}</p><p>${domain ? formatDomainBenefitSummary(domain) : id}</p></article>`;
    })
    .join("");
};

export const techCurrentModsHtml = (
  mods: Record<ModKey, number>,
  expandedModKey: ModKey | null,
  modBreakdown: ModBreakdown
): string => {
  const statDefs = [
    { key: "attack", label: "Attack", short: "ATK", icon: "△", value: mods.attack, tone: "attack" },
    { key: "defense", label: "Defense", short: "DEF", icon: "⬡", value: mods.defense, tone: "defense" },
    { key: "income", label: "Income", short: "INC", icon: "↗", value: mods.income, tone: "income" },
    { key: "vision", label: "Vision", short: "VIS", icon: "◉", value: mods.vision, tone: "vision" }
  ] as const;
  const chips = statDefs
    .map(({ key, label, short, icon, value, tone }) => {
      const pct = Math.round((value - 1) * 100);
      const pctLabel = `${pct >= 0 ? "+" : ""}${pct}%`;
      const sources = (modBreakdown[key] ?? []).filter((entry) => entry.label.trim().toLowerCase() !== "base");
      const inspectable = sources.length > 0;
      const expanded = expandedModKey === key;
      const chipClass = `panel-btn tech-mod-chip tech-mod-chip-${tone}${expanded ? " selected" : ""}${inspectable ? "" : " is-static"}`;
      const chipBody = `<div class="tech-mod-chip-main">
          <span class="tech-mod-chip-label"><span class="tech-mod-chip-icon" aria-hidden="true">${icon}</span><span>${label}</span></span>
          <strong>${pctLabel}</strong>
        </div>
        <div class="tech-mod-chip-meta"><span>${short}</span><span class="tech-mod-chip-expand">${inspectable ? (expanded ? "Hide details" : "Tap to inspect") : "No extra sources"}${inspectable ? " ▾" : ""}</span></div>`;
      if (!inspectable) {
        return `<div class="${chipClass}" aria-disabled="true">${chipBody}</div>`;
      }
      return `<button class="${chipClass}" data-mod-chip="${key}" aria-expanded="${expanded ? "true" : "false"}">
        <div class="tech-mod-chip-main">
          <span class="tech-mod-chip-label"><span class="tech-mod-chip-icon" aria-hidden="true">${icon}</span><span>${label}</span></span>
          <strong>${pctLabel}</strong>
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
  const breakdown =
    expandedModKey === null
      ? ""
      : `<div class="tech-mod-breakdown">${(modBreakdown[expandedModKey] ?? [])
          .filter((entry) => entry.label.trim().toLowerCase() !== "base")
          .map((entry) => {
            const delta = formatTechModDelta(entry.mult);
            return `<div class="tech-mod-breakdown-row"><span>${entry.label}</span><strong class="tech-mod-delta ${delta.tone}">${delta.text}</strong></div>`;
          })
          .join("")}</div>`;
  return `
    <div class="card tech-mod-card">
      <div class="tech-mod-card-head">
        <div class="tech-mod-card-title">Active Bonuses</div>
        <div class="tech-mod-card-hint">${expandedModKey === null ? "Tap a bonus to inspect its sources" : "Bonus source breakdown below"}</div>
      </div>
      <div class="tech-mod-strip">${chips}</div>
      ${breakdown}
    </div>
  `;
};

const checklistHtml = (items: Array<{ label: string; met: boolean }>, className = "tech-req-list"): string =>
  items.length > 0
    ? `<ul class="${className}">${items
        .map((item) => `<li class="${item.met ? "ok" : "bad"}">${item.met ? "✓" : "✗"} ${item.label}</li>`)
        .join("")}</ul>`
    : `<ul class="${className}"><li>None</li></ul>`;

const compactChecklistHtml = (items: Array<{ label: string; met: boolean }>): string =>
  items.length > 0
    ? `<ul>${items
        .map((item) => `<li style="color:${item.met ? "#84f2b8" : "#ff9f9f"}">${item.met ? "✓" : "✗"} ${item.label}</li>`)
        .join("")}</ul>`
    : `<p class="muted">No requirements listed.</p>`;

export const formatDomainCost = (domain: DomainInfo): string => {
  const checklist = domain.requirements.checklist ?? [];
  const costBits = checklist.filter((item) => /gold|food|iron|crystal|supply|shard/i.test(item.label)).map((item) => item.label);
  return costBits.length > 0 ? costBits.join(" · ") : "Cost not listed";
};

export const renderDomainProgressCardHtml = (args: {
  visibleShardCacheCount: number;
  shardStock: number;
  currentTier: number | undefined;
  chosenDomainCount: number;
}): string => {
  const { visibleShardCacheCount, shardStock, currentTier, chosenDomainCount } = args;
  const statusLine =
    currentTier !== undefined
      ? `Tier ${currentTier} is open for your next doctrine shift. Explore for shard caches to build toward your next doctrine pick.`
      : "All open domain tiers are currently committed. Keep hunting shards to afford the next doctrine window.";
  const scoutingLine =
    visibleShardCacheCount > 0
      ? `${visibleShardCacheCount} shard cache${visibleShardCacheCount === 1 ? "" : "s"} visible in explored territory.`
      : "No shard caches in view yet. Push exploration to uncover more shard income.";
  return `<article class="card domain-progress-card">
    <div class="domain-progress-head">
      <div>
        <div class="domain-summary-kicker">Shard Network</div>
        <strong>Shards fuel your doctrine path</strong>
      </div>
      <span class="domain-progress-badge">${currentTier !== undefined ? `Tier ${currentTier} live` : `${chosenDomainCount} chosen`}</span>
    </div>
    <p>${statusLine}</p>
    <div class="domain-progress-metrics">
      <div class="domain-progress-metric">
        <span>Shard stock</span>
        <strong>${shardStock.toFixed(1)}</strong>
      </div>
    </div>
    <p class="domain-progress-note">${scoutingLine}</p>
  </article>`;
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

export const renderTechDetailCardHtml = (args: {
  tech: TechInfo | undefined;
  statusText: string | undefined;
  buttonLabel: string;
  buttonDisabled: boolean;
  prereqs: string[];
  prereqText: string;
  unlocks: Array<{ name: string; tier: number }>;
  relatedStructuresHtml: string;
  relatedCrystalAbilitiesHtml: string;
}): string => {
  const { tech, statusText, buttonLabel, buttonDisabled, prereqs, prereqText, unlocks, relatedStructuresHtml, relatedCrystalAbilitiesHtml } = args;
  if (!tech) return `<article class="card"><p>Select a technology card to inspect details.</p></article>`;
  const checklist = tech.requirements.checklist ?? [];
  return `<article class="card tech-detail-card">
    <div class="tech-detail-head">
      <div>
        <strong>${tech.name}</strong>
        <p class="tech-detail-effect">${formatTechBenefitSummary(tech)}</p>
        <p class="muted">${prereqs.length > 0 ? `Requires ${prereqText}` : "Entry tech (no prerequisites)"}</p>
        ${statusText ? `<p class="muted">${statusText}</p>` : ""}
      </div>
    </div>
    <p class="tech-detail-flavor">${tech.description}</p>
    ${relatedStructuresHtml}
    ${relatedCrystalAbilitiesHtml}
    ${unlocks.length > 0 ? `<p class="muted"><strong>Unlocks next:</strong> ${unlocks.map((next) => `${next.name} (T${next.tier})`).join(", ")}</p>` : ""}
    <p><strong>Requirements:</strong></p>
    ${checklistHtml(checklist)}
    <div class="tech-detail-actions">
      <button class="panel-btn tech-unlock-btn tech-unlock-btn-modal" data-tech-unlock="${tech.id}" ${buttonDisabled ? "disabled" : ""}>${buttonLabel}</button>
    </div>
  </article>`;
};

export const renderDomainChoiceGridHtml = (args: {
  domainCatalog: DomainInfo[];
  domainIds: string[];
  domainUiSelectedId: string;
  ownedByTier: Map<number, DomainInfo>;
  currentTier: number | undefined;
  requiresTechNames: Record<string, string>;
}): string => {
  const { domainCatalog, domainIds, domainUiSelectedId, ownedByTier, currentTier, requiresTechNames } = args;
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
      const visibleDomains = status.tone === "chosen" ? [ownedByTier.get(tier)].filter((domain): domain is DomainInfo => Boolean(domain)) : (grouped.get(tier) ?? []);
      const cards = visibleDomains
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
  pendingDomainUnlockId: string;
  showInlineClose?: boolean;
}): string => {
  const { domain, domainIds, chosenInTier, currentTier, requiresTechName, pendingDomainUnlockId, showInlineClose = true } = args;
  if (!domain) return `<article class="card"><p>Select a domain card to inspect details.</p></article>`;
  const checklist = domain.requirements.checklist ?? [];
  const owned = domainIds.includes(domain.id);
  const pendingUnlock = pendingDomainUnlockId === domain.id;
  const blockedByPending = Boolean(pendingDomainUnlockId && pendingDomainUnlockId !== domain.id);
  const canUnlock = domain.requirements.canResearch && !owned && !pendingDomainUnlockId;
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
        canUnlock || owned || pendingUnlock ? "" : "disabled"
      }>${buttonLabel}</button>
    </div>
  </article>`;
};

export const renderTechChoiceDetailsHtml = (args: {
  tech: TechInfo | undefined;
  statusText: string | undefined;
  currentMods: Record<ModKey, number>;
  prereqs: string[];
}): string => {
  const { tech, statusText, currentMods, prereqs } = args;
  if (!tech) return `<p class="muted">No tech selected.</p>`;
  const mods = Object.entries(tech.mods ?? {})
    .map(([key, value]) => `${key} x${Number(value).toFixed(3)}`)
    .join(" | ");
  const projected = {
    attack: currentMods.attack * (tech.mods.attack ?? 1),
    defense: currentMods.defense * (tech.mods.defense ?? 1),
    income: currentMods.income * (tech.mods.income ?? 1),
    vision: currentMods.vision * (tech.mods.vision ?? 1)
  };
  return `<article class="card">
    <strong>${tech.name}</strong>
    ${statusText ? `<p class="muted">${statusText}</p>` : ""}
    <p>${tech.description}</p>
    <p><strong>Prerequisites:</strong> ${prereqs.length > 0 ? prereqs.join(", ") : "None"}</p>
    <p><strong>Requirements:</strong></p>
    ${compactChecklistHtml(tech.requirements.checklist ?? [])}
    <p><strong>Modifiers:</strong> ${mods || "None"}</p>
    <p><strong>Current:</strong> atk x${currentMods.attack.toFixed(3)} | def x${currentMods.defense.toFixed(3)} | inc x${currentMods.income.toFixed(3)} | vis x${currentMods.vision.toFixed(3)}</p>
    <p><strong>Projected:</strong> atk x${projected.attack.toFixed(3)} | def x${projected.defense.toFixed(3)} | inc x${projected.income.toFixed(3)} | vis x${projected.vision.toFixed(3)}</p>
    ${tech.grantsPowerup ? `<p><strong>Powerup:</strong> ${tech.grantsPowerup.id} (+${tech.grantsPowerup.charges})</p>` : ""}
  </article>`;
};
