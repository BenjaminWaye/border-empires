import type { TechInfo } from "./client-types.js";

export type CrystalAbilityInfoKey =
  | "reveal_empire"
  | "reveal_empire_stats"
  | "aether_wall"
  | "survey_sweep"
  | "aether_lance"
  | "retort_recasting"
  | "aether_bridge"
  | "siphon"
  | "aether_emp"
  | "city_overclock"
  | "stormfront"
  | "aegis_lock"
  | "astral_dock_launch"
  | "create_mountain"
  | "remove_mountain";

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
const AETHER_WALL_COOLDOWN_MS = 8 * 60_000;
const AETHER_WALL_DURATION_MS = 20 * 60_000;
const REVEAL_EMPIRE_STATS_COOLDOWN_MS = 5 * 60_000;
const SIPHON_COOLDOWN_MS = 15 * 60_000;
const SIPHON_DURATION_MS = 30 * 60_000;
const RETORT_RECAST_COOLDOWN_MS = 20 * 60_000;
const SURVEY_SWEEP_COOLDOWN_MS = 12 * 60_000;
const SURVEY_SWEEP_DURATION_MS = 2 * 60_000;
const AETHER_LANCE_COOLDOWN_MS = 10 * 60_000;
const AETHER_EMP_COOLDOWN_MS = 45 * 60_000;
const AETHER_EMP_DURATION_MS = 15 * 60_000;
const CITY_OVERCLOCK_COOLDOWN_MS = 45 * 60_000;
const CITY_OVERCLOCK_DURATION_MS = 15 * 60_000;
const TERRAIN_SHAPING_COOLDOWN_MS = 20 * 60_000;
const STORMFRONT_COOLDOWN_MS = 45 * 60_000;
const STORMFRONT_DURATION_MS = 15 * 60_000;
const AEGIS_LOCK_COOLDOWN_MS = 60 * 60_000;
const AEGIS_LOCK_DURATION_MS = 15 * 60_000;
const ASTRAL_DOCK_COOLDOWN_MS = 90 * 60_000;
const ASTRAL_DOCK_DURATION_MS = 24 * 60 * 60_000;

export const crystalAbilityNameForKey = (key: CrystalAbilityInfoKey): string => {
  if (key === "reveal_empire") return "Reveal Empire";
  if (key === "reveal_empire_stats") return "Reveal Empire Stats";
  if (key === "aether_wall") return "Aether Wall";
  if (key === "survey_sweep") return "Survey Sweep";
  if (key === "aether_lance") return "Aether Purge";
  if (key === "retort_recasting") return "Retort Transmutation";
  if (key === "aether_bridge") return "Aether Bridge";
  if (key === "siphon") return "Siphon";
  if (key === "aether_emp") return "Aether EMP";
  if (key === "city_overclock") return "City Overclock";
  if (key === "stormfront") return "Stormfront";
  if (key === "aegis_lock") return "Aegis Lock";
  if (key === "astral_dock_launch") return "Launch Satellite";
  if (key === "create_mountain") return "Create Mountain";
  return "Remove Mountain";
};

export const relatedCrystalAbilitiesForTech = (tech: Pick<TechInfo, "effects">): CrystalAbilityInfoKey[] => {
  const effects = tech.effects ?? {};
  const out = new Set<CrystalAbilityInfoKey>();
  if (effects.unlockRevealEmpire === true) out.add("reveal_empire");
  if (effects.unlockRevealEmpireStats === true) out.add("reveal_empire_stats");
  if (effects.unlockAetherWall === true) out.add("aether_wall");
  if (effects.unlockSurveySweep === true) out.add("survey_sweep");
  if (effects.unlockAetherLance === true) out.add("aether_lance");
  if (effects.unlockRetortRecasting === true) out.add("retort_recasting");
  if (effects.unlockSabotage === true) out.add("siphon");
  if (effects.unlockAetherEmp === true) out.add("aether_emp");
  if (effects.unlockCityOverclock === true) out.add("city_overclock");
  if (effects.unlockNavalInfiltration === true) out.add("aether_bridge");
  if (effects.unlockStormfront === true) out.add("stormfront");
  if (effects.unlockAegisLock === true) out.add("aegis_lock");
  if (effects.unlockAstralDockLaunch === true) out.add("astral_dock_launch");
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
  if (key === "survey_sweep") {
    return {
      title: "Survey Sweep",
      detail: "Pulses one of your active observatories to temporarily reveal a huge surrounding area, then lets it fade back into fog.",
      glyph: "⌖",
      target: "Owned active observatory. Reveals up to 50 tiles in each direction around that observatory.",
      costBits: ["30 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(SURVEY_SWEEP_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(SURVEY_SWEEP_DURATION_MS)
    };
  }
  if (key === "aether_lance") {
    return {
      title: "Aether Purge",
      detail: "Purge enemy control from a tile, turning it neutral.",
      glyph: "✦",
      target: "Enemy settled or frontier tile within observatory range.",
      costBits: ["3,000 gold", "100 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(AETHER_LANCE_COOLDOWN_MS)
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
  if (key === "retort_recasting") {
    return {
      title: "Retort Transmutation",
      detail: "Rewrites one exposed resource vein into a different industrial class, turning food, supply, iron, or crystal ground into whatever your empire needs next.",
      glyph: "⚗",
      target: "Any land resource tile within observatory range that has no town, dock, fort, observatory, siege line, or economic structure on it.",
      costBits: ["6,000 gold", "120 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(RETORT_RECAST_COOLDOWN_MS)
    };
  }
  if (key === "reveal_empire_stats") {
    return {
      title: "Reveal Empire Stats",
      detail: "Extracts a one-time intelligence snapshot of a hostile empire's economy, stockpiles, manpower, and territory totals.",
      glyph: "◈",
      target: "Select a hostile tile, then cast to inspect that empire.",
      costBits: ["15 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(REVEAL_EMPIRE_STATS_COOLDOWN_MS)
    };
  }
  if (key === "aether_wall") {
    return {
      title: "Aether Wall",
      detail: "Projects a one-way crystal barrier along up to 3 border edges. Units cannot cross from the faced side until it expires.",
      glyph: "║",
      target: "Select one of your settled border tiles, then cast. If more than one facing is valid, choose the glowing arrow direction.",
      costBits: ["25 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(AETHER_WALL_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(AETHER_WALL_DURATION_MS)
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
  if (key === "aether_emp") {
    return {
      title: "Aether EMP",
      detail: "Blasts an enemy powered structure with a crystal surge, forcing it offline long enough to collapse the local power network.",
      glyph: "⚡",
      target: "Enemy powered Aether Tower, Sky Dock, Resonance Grid, or monument within observatory range.",
      costBits: ["180 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(AETHER_EMP_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(AETHER_EMP_DURATION_MS)
    };
  }
  if (key === "city_overclock") {
    return {
      title: "City Overclock",
      detail: "Drives one of your major cities into a short industrial frenzy, boosting its linked urban network for 15 minutes.",
      glyph: "⌘",
      target: "Owned City, Great City, or Monumental City. The target city and its directly connected towns run overclocked.",
      costBits: ["160 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(CITY_OVERCLOCK_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(CITY_OVERCLOCK_DURATION_MS)
    };
  }
  if (key === "stormfront") {
    return {
      title: "Stormfront",
      detail: "Drops an aether storm over a region, blinding vision and shutting down hostile bombardment and observatory pressure inside it.",
      glyph: "☈",
      target: "Cast from an active Resonance Grid to cover a 30-tile region around the target grid.",
      costBits: ["180 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(STORMFRONT_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(STORMFRONT_DURATION_MS)
    };
  }
  if (key === "aegis_lock") {
    return {
      title: "Aegis Lock",
      detail: "Hardens the Aegis Dome into a temporary untouchable core. During the lock, hostile attacks cannot change ownership and hostile structure-breaking abilities fail in the dome's radius.",
      glyph: "⬡",
      target: "Activate from your powered Aegis Dome to lock the surrounding 25-tile region.",
      costBits: ["220 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(AEGIS_LOCK_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(AEGIS_LOCK_DURATION_MS)
    };
  }
  if (key === "astral_dock_launch") {
    return {
      title: "Launch Satellite",
      detail: "Launches an aether satellite into orbit from a powered Astral Dock. While it stays aloft, your empire sees the entire map.",
      glyph: "🜨",
      target: "Activate from your powered Astral Dock monument.",
      costBits: ["300 CRYSTAL"],
      cooldownLabel: deps.formatCooldownShort(ASTRAL_DOCK_COOLDOWN_MS),
      durationLabel: deps.formatCooldownShort(ASTRAL_DOCK_DURATION_MS)
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
            <div class="structure-info-kicker">Ability</div>
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
