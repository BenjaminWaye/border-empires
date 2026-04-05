import type { TechInfo } from "./client-types.js";

export type CrystalAbilityInfoKey = "reveal_empire" | "aether_bridge" | "siphon" | "create_mountain" | "remove_mountain";

export type CrystalAbilityInfoView = {
  title: string;
  detail: string;
  glyph: string;
  target: string;
  costBits: string[];
  cooldownLabel?: string;
  durationLabel?: string;
  upkeepLabel?: string;
};

const AETHER_BRIDGE_COOLDOWN_MS = 30 * 60_000;
const AETHER_BRIDGE_DURATION_MS = 8 * 60_000;
const SIPHON_COOLDOWN_MS = 15 * 60_000;
const SIPHON_DURATION_MS = 30 * 60_000;
const TERRAIN_SHAPING_COOLDOWN_MS = 20 * 60_000;

export const crystalAbilityNameForKey = (key: CrystalAbilityInfoKey): string => {
  if (key === "reveal_empire") return "Reveal Empire";
  if (key === "aether_bridge") return "Aether Bridge";
  if (key === "siphon") return "Siphon";
  if (key === "create_mountain") return "Create Mountain";
  return "Remove Mountain";
};

export const relatedCrystalAbilitiesForTech = (tech: Pick<TechInfo, "effects">): CrystalAbilityInfoKey[] => {
  const effects = tech.effects ?? {};
  const out = new Set<CrystalAbilityInfoKey>();
  if (effects.unlockRevealEmpire === true) out.add("reveal_empire");
  if (effects.unlockSabotage === true) out.add("siphon");
  if (effects.unlockNavalInfiltration === true) out.add("aether_bridge");
  if (effects.unlockTerrainShaping === true) {
    out.add("create_mountain");
    out.add("remove_mountain");
  }
  return [...out];
};

export const crystalAbilityInfoButtonHtml = (key: CrystalAbilityInfoKey, label?: string): string =>
  `<button class="inline-info-link" type="button" data-crystal-ability-info="${key}">${label ?? crystalAbilityNameForKey(key)}</button>`;

export const crystalAbilityInfoForKey = (
  key: CrystalAbilityInfoKey,
  deps: { formatCooldownShort: (ms: number) => string }
): CrystalAbilityInfoView => {
  if (key === "reveal_empire") {
    return {
      title: "Reveal Empire",
      detail: "Reveals one hostile empire's territory until you cancel it. Only one empire can be actively revealed at a time.",
      glyph: "◉",
      target: "Tap any hostile tile owned by the empire you want to track.",
      costBits: ["20 CRYSTAL"],
      upkeepLabel: "0.15 CRYSTAL / 10m"
    };
  }
  if (key === "aether_bridge") {
    return {
      title: "Aether Bridge",
      detail: "Opens a temporary assault route from one of your settled coastal tiles to a coastal land target across up to 4 sea tiles.",
      glyph: "⟷",
      target: "Target coastal land reachable from one of your settled coastal tiles.",
      costBits: ["30 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(AETHER_BRIDGE_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(AETHER_BRIDGE_DURATION_MS)
    };
  }
  if (key === "siphon") {
    return {
      title: "Siphon",
      detail: "Steals 50% of a hostile town or resource tile's output for 30 minutes.",
      glyph: "☍",
      target: "Enemy town or resource tile within 30 tiles of one of your observatories.",
      costBits: ["20 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(SIPHON_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(SIPHON_DURATION_MS)
    };
  }
  if (key === "create_mountain") {
    return {
      title: "Create Mountain",
      detail: "Raises impassable mountain terrain to block routes and reshape the frontline.",
      glyph: "⛰",
      target: "Land tile within 2 tiles of your territory. Cannot target towns, docks, or structured tiles.",
      costBits: ["8,000 gold", "400 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(TERRAIN_SHAPING_COOLDOWN_MS)
    };
  }
  return {
    title: "Remove Mountain",
    detail: "Clears a mountain to reopen a pass near your territory.",
    glyph: "⌵",
    target: "Mountain tile within 2 tiles of your territory.",
    costBits: ["8,000 gold", "400 CRYSTAL"],
    cooldownLabel: deps.formatCooldownShort(TERRAIN_SHAPING_COOLDOWN_MS)
  };
};

export const renderCrystalAbilityInfoOverlay = (
  crystalAbilityInfoKey: string,
  deps: { formatCooldownShort: (ms: number) => string }
): string => {
  const key = crystalAbilityInfoKey as CrystalAbilityInfoKey | "";
  if (!key) return "";
  const info = crystalAbilityInfoForKey(key, deps);
  const metaCards = [
    ...info.costBits.map((bit) => ({ label: "Cost", value: bit })),
    { label: "Target", value: info.target },
    ...(info.cooldownLabel ? [{ label: "Cooldown", value: info.cooldownLabel }] : []),
    ...(info.durationLabel ? [{ label: "Duration", value: info.durationLabel }] : []),
    ...(info.upkeepLabel ? [{ label: "Upkeep", value: info.upkeepLabel }] : [])
  ];
  const metaHtml = metaCards
    .map((item) => `<div class="structure-info-meta-card"><span>${item.label}</span><strong>${item.value}</strong></div>`)
    .join("");
  return `<div class="structure-info-backdrop" data-crystal-ability-info-close="backdrop"></div>
    <div class="structure-info-modal" role="dialog" aria-modal="true" aria-labelledby="crystal-ability-info-title">
      <button class="structure-info-close" type="button" aria-label="Close crystal ability details" data-crystal-ability-info-close="button">×</button>
      <div class="structure-info-scroll">
        <div class="structure-info-hero">
          <div class="structure-info-art"><div class="structure-info-glyph" aria-hidden="true">${info.glyph}</div></div>
          <div class="structure-info-head">
            <div class="structure-info-kicker">Crystal Ability</div>
            <h3 id="crystal-ability-info-title">${info.title}</h3>
            <p>${info.detail}</p>
          </div>
        </div>
        <div class="structure-info-meta">
          ${metaHtml}
        </div>
      </div>
    </div>`;
};
