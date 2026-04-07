import type { Player } from "@border-empires/shared";

import type { SeasonalTechConfig } from "./server-shared-types.js";
import type { StatsModBreakdown } from "./server-effects.js";

type SeasonTechDeps = Record<string, any>;

export const createServerSeasonTech = (deps: SeasonTechDeps) => {
  const {
    TECHS,
    TECH_ROOTS,
    techById,
    domainById,
    players,
    playerBaseMods,
    clusterControlledTilesByPlayer,
    recomputePlayerEffectsForPlayer,
    markVisibilityDirty
  } = deps;

  const chooseSeasonalTechConfig = (seed: number): SeasonalTechConfig => {
    const activeNodeIds = new Set<string>();
    for (const tech of TECHS) {
      activeNodeIds.add(tech.id);
    }
    return {
      configId: `tree-${seed}`,
      rootNodeIds: [...TECH_ROOTS],
      activeNodeIds,
      balanceConstants: {}
    };
  };

  const seasonTechConfigIsCompatible = (config: SeasonalTechConfig): boolean => {
    if (config.rootNodeIds.length !== TECH_ROOTS.length) return false;
    if (config.rootNodeIds.some((id) => !TECH_ROOTS.includes(id))) return false;
    if (config.activeNodeIds.size !== TECHS.length) return false;
    for (const id of config.activeNodeIds) {
      if (!techById.has(id)) return false;
    }
    for (const tech of TECHS) {
      if (!config.activeNodeIds.has(tech.id)) return false;
    }
    return true;
  };

  const recomputeClusterBonusForPlayer = (player: Player): void => {
    void player;
  };

  const playerModBreakdown = (player: Player): StatsModBreakdown => {
    const breakdown: StatsModBreakdown = {
      attack: [{ label: "Base", mult: 1 }],
      defense: [{ label: "Base", mult: 1 }],
      income: [{ label: "Base", mult: 1 }],
      vision: [{ label: "Base", mult: 1 }]
    };
    for (const techId of player.techIds) {
      const tech = techById.get(techId);
      if (!tech?.mods) continue;
      if (tech.mods.attack && tech.mods.attack !== 1) breakdown.attack.push({ label: `Tech: ${tech.name}`, mult: tech.mods.attack });
      if (tech.mods.defense && tech.mods.defense !== 1) breakdown.defense.push({ label: `Tech: ${tech.name}`, mult: tech.mods.defense });
      if (tech.mods.income && tech.mods.income !== 1) breakdown.income.push({ label: `Tech: ${tech.name}`, mult: tech.mods.income });
      if (tech.mods.vision && tech.mods.vision !== 1) breakdown.vision.push({ label: `Tech: ${tech.name}`, mult: tech.mods.vision });
    }
    for (const domainId of player.domainIds) {
      const domain = domainById.get(domainId);
      if (!domain?.mods) continue;
      if (domain.mods.attack && domain.mods.attack !== 1) breakdown.attack.push({ label: `Domain: ${domain.name}`, mult: domain.mods.attack });
      if (domain.mods.defense && domain.mods.defense !== 1) breakdown.defense.push({ label: `Domain: ${domain.name}`, mult: domain.mods.defense });
      if (domain.mods.income && domain.mods.income !== 1) breakdown.income.push({ label: `Domain: ${domain.name}`, mult: domain.mods.income });
      if (domain.mods.vision && domain.mods.vision !== 1) breakdown.vision.push({ label: `Domain: ${domain.name}`, mult: domain.mods.vision });
    }

    for (const key of ["attack", "defense", "income", "vision"] as const) {
      const computed = breakdown[key].reduce((product, entry) => product * entry.mult, 1);
      const live = player.mods[key];
      if (Math.abs(computed - live) > 0.0001) {
        breakdown[key].push({ label: "Other", mult: live / Math.max(0.0001, computed) });
      }
    }
    return breakdown;
  };

  const recomputeTechModsFromOwnedTechs = (player: Player): void => {
    const depthMemo = new Map<string, number>();
    const depthOf = (id: string): number => {
      const cached = depthMemo.get(id);
      if (cached !== undefined) return cached;
      const t = techById.get(id);
      if (!t || !t.requires) {
        depthMemo.set(id, 0);
        return 0;
      }
      const d = depthOf(t.requires) + 1;
      depthMemo.set(id, d);
      return d;
    };

    const owned = [...player.techIds].sort((a, b) => depthOf(a) - depthOf(b));
    const rebuilt = { attack: 1, defense: 1, income: 1, vision: 1 };
    for (const id of owned) {
      const tech = techById.get(id);
      if (!tech?.mods) continue;
      if (tech.mods.attack) rebuilt.attack *= tech.mods.attack;
      if (tech.mods.defense) rebuilt.defense *= tech.mods.defense;
      if (tech.mods.income) rebuilt.income *= tech.mods.income;
      if (tech.mods.vision) rebuilt.vision *= tech.mods.vision;
    }
    for (const id of player.domainIds) {
      const domain = domainById.get(id);
      if (!domain?.mods) continue;
      if (domain.mods.attack) rebuilt.attack *= domain.mods.attack;
      if (domain.mods.defense) rebuilt.defense *= domain.mods.defense;
      if (domain.mods.income) rebuilt.income *= domain.mods.income;
      if (domain.mods.vision) rebuilt.vision *= domain.mods.vision;
    }

    player.mods.attack = rebuilt.attack;
    player.mods.defense = rebuilt.defense;
    player.mods.income = rebuilt.income;
    player.mods.vision = rebuilt.vision;
    playerBaseMods.set(player.id, rebuilt);
    recomputePlayerEffectsForPlayer(player);
    recomputeClusterBonusForPlayer(player);
    markVisibilityDirty(player.id);
  };

  const setClusterControlDelta = (playerId: string, clusterId: string, delta: number): void => {
    let byCluster = clusterControlledTilesByPlayer.get(playerId);
    if (!byCluster) {
      byCluster = new Map<string, number>();
      clusterControlledTilesByPlayer.set(playerId, byCluster);
    }
    byCluster.set(clusterId, (byCluster.get(clusterId) ?? 0) + delta);
    if ((byCluster.get(clusterId) ?? 0) <= 0) byCluster.delete(clusterId);
    const player = players.get(playerId);
    if (player) recomputeClusterBonusForPlayer(player);
  };

  return {
    chooseSeasonalTechConfig,
    seasonTechConfigIsCompatible,
    recomputeClusterBonusForPlayer,
    playerModBreakdown,
    recomputeTechModsFromOwnedTechs,
    setClusterControlDelta
  };
};
