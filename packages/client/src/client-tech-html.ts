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
  if (key === "unlockRevealRegion" && value === true) return "Unlocks reveal region";
  if (key === "unlockRevealEmpire" && value === true) return "Unlocks empire reveal";
  if (key === "unlockDeepStrike" && value === true) return "Unlocks deep strike";
  if (key === "unlockNavalInfiltration" && value === true) return "Unlocks naval infiltration";
  if (key === "unlockSabotage" && value === true) return "Unlocks sabotage";
  if (key === "unlockMountainPass" && value === true) return "Unlocks mountain pass";
  if (key === "unlockTerrainShaping" && value === true) return "Unlocks terrain shaping";
  if (key === "unlockBreachAttack" && value === true) return "Unlocks breach attack";
  if (key === "dockGoldOutputMult" && typeof value === "number") return `Dock income +${Math.round((value - 1) * 100)}%`;
  if (key === "dockGoldCapMult" && typeof value === "number") return `Dock cap +${Math.round((value - 1) * 100)}%`;
  if (key === "dockConnectionBonusPerLink" && typeof value === "number") return `Dock route bonus ${Math.round(value * 100)}% per link`;
  if (key === "dockRoutesVisible" && value === true) return "Shows dock routes";
  if (key === "marketCrystalUpkeepMult" && typeof value === "number") return `Market crystal upkeep -${Math.round((1 - value) * 100)}%`;
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
  if (key === "newSettlementDefenseMult" && typeof value === "number")
    return `New settlement defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "settledFoodUpkeepMult" && typeof value === "number") return `Settled food upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "settledGoldUpkeepMult" && typeof value === "number") return `Settled gold upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "townFoodUpkeepMult" && typeof value === "number") return `Town food upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "townGoldOutputMult" && typeof value === "number") return `Town gold output ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
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
      const expanded = expandedModKey === key;
      return `<button class="panel-btn tech-mod-chip tech-mod-chip-${tone}${expanded ? " selected" : ""}" data-mod-chip="${key}" aria-expanded="${expanded ? "true" : "false"}">
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
