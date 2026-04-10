// @ts-nocheck

export const createServerTechDomainRuntime = (deps) => {
  const {
    TECHS,
    activeSeasonTechConfig,
    techById,
    domainById,
    ownershipStateByTile,
    parseKey,
    runtimeTileCore,
    docksByTile,
    townsByTile,
    getOrInitStrategicStocks,
    recomputeTechModsFromOwnedTechs,
    telemetryCounters,
    DOMAINS,
    colorFromId
  } = deps;

  const reachableTechs = (player: Player): string[] => {
    const out: string[] = [];
    for (const tech of TECHS) {
      if (!activeSeasonTechConfig.activeNodeIds.has(tech.id)) continue;
      if (player.techIds.has(tech.id)) continue;
      const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
      if (prereqs.every((req) => player.techIds.has(req))) out.push(tech.id);
    }
    return out;
  };
  
  const techDepth = (id: string): number => {
    const seen = new Set<string>();
    const walk = (techId: string): number => {
      if (seen.has(techId)) return 0;
      seen.add(techId);
      const cur = techById.get(techId);
      if (!cur) return 0;
      const parents = cur.prereqIds && cur.prereqIds.length > 0 ? cur.prereqIds : cur.requires ? [cur.requires] : [];
      if (parents.length === 0) return 0;
      return Math.max(...parents.map((p) => walk(p))) + 1;
    };
    return walk(id);
  };
  
  const playerWorldFlags = (player: Player): Set<string> => {
    const flags = new Set<string>();
    if (player.Ts >= 8) flags.add("settled_tiles_8");
    if (player.Ts >= 16) flags.add("settled_tiles_16");
    let hasIron = false;
    let hasCrystal = false;
    let hasTown = false;
    let hasDock = false;
    for (const tk of player.territoryTiles) {
      if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
      const [x, y] = parseKey(tk);
      const t = runtimeTileCore(x, y);
      if (t.resource === "IRON") hasIron = true;
      if (t.resource === "GEMS") hasCrystal = true;
      if (docksByTile.has(tk)) hasDock = true;
      const town = townsByTile.get(tk);
      if (town) hasTown = true;
    }
    if (hasIron) flags.add("active_iron_site");
    if (hasCrystal) flags.add("active_crystal_site");
    if (hasTown) flags.add("active_town");
    if (hasDock) flags.add("active_dock");
    return flags;
  };
  
  const techRequirements = (tech: (typeof TECHS)[number]): { gold: number; resources: Partial<Record<StrategicResource, number>> } => {
    if (tech.cost) {
      const resources: Partial<Record<StrategicResource, number>> = {};
      const food = tech.cost.food ?? 0;
      const iron = tech.cost.iron ?? 0;
      const crystal = tech.cost.crystal ?? 0;
      const supply = tech.cost.supply ?? 0;
      const shard = tech.cost.shard ?? 0;
      if (food > 0) resources.FOOD = food;
      if (iron > 0) resources.IRON = iron;
      if (crystal > 0) resources.CRYSTAL = crystal;
      if (supply > 0) resources.SUPPLY = supply;
      if (shard > 0) resources.SHARD = shard;
      return { gold: tech.cost.gold ?? 0, resources };
    }
    const depth = techDepth(tech.id);
    const gold = Math.max(15, 12 + depth * 9);
    const resources: Partial<Record<StrategicResource, number>> = {};
  
    const mods = tech.mods ?? {};
    const offensive = (mods.attack ?? 1) > 1;
    const defensive = (mods.defense ?? 1) > 1;
    const economic = (mods.income ?? 1) > 1;
    const vision = (mods.vision ?? 1) > 1;
  
    if (offensive) resources.IRON = Math.max(resources.IRON ?? 0, Math.max(0, Math.ceil(depth / 2)));
    if (defensive) resources.SUPPLY = Math.max(resources.SUPPLY ?? 0, Math.max(0, Math.ceil(depth / 3)));
    if (economic) resources.FOOD = Math.max(resources.FOOD ?? 0, Math.max(0, Math.ceil(depth / 2)));
    if (vision) resources.CRYSTAL = Math.max(resources.CRYSTAL ?? 0, Math.max(0, Math.ceil(depth / 2)));
    if (depth >= 6) {
      resources.SHARD = Math.max(resources.SHARD ?? 0, 1);
    }
    return { gold, resources };
  };
  
  const techChecklistFor = (
    player: Player,
    tech: (typeof TECHS)[number]
  ): { ok: boolean; checks: TechRequirementChecklist[]; resources: Partial<Record<StrategicResource, number>>; gold: number } => {
    const req = techRequirements(tech);
    const checks: TechRequirementChecklist[] = [];
    const stocks = getOrInitStrategicStocks(player.id);
    checks.push({ label: `Gold ${req.gold}`, met: player.points >= req.gold });
    for (const [r, amount] of Object.entries(req.resources) as Array<[StrategicResource, number]>) {
      checks.push({ label: `${r} ${amount}`, met: (stocks[r] ?? 0) >= amount });
    }
    return { ok: checks.every((c) => c.met), checks, resources: req.resources, gold: req.gold };
  };
  
  const activeTechCatalog = (player?: Player): Array<{
    id: string;
    tier: number;
    name: string;
    researchTimeSeconds?: number;
    rootId?: string;
    requires?: string;
    prereqIds?: string[];
    description: string;
    mods: Partial<Record<StatsModKey, number>>;
    effects?: (typeof TECHS)[number]["effects"];
    requirements: {
      gold: number;
      resources: Partial<Record<StrategicResource, number>>;
      checklist?: TechRequirementChecklist[];
      canResearch?: boolean;
    };
    grantsPowerup?: { id: string; charges: number };
  }> => {
    return TECHS.filter((t) => activeSeasonTechConfig.activeNodeIds.has(t.id)).map((t) => {
      const out: {
        id: string;
        tier: number;
        name: string;
        researchTimeSeconds?: number;
        rootId?: string;
        requires?: string;
        prereqIds?: string[];
        description: string;
        mods: Partial<Record<StatsModKey, number>>;
        effects?: (typeof TECHS)[number]["effects"];
        requirements: {
          gold: number;
          resources: Partial<Record<StrategicResource, number>>;
          checklist?: TechRequirementChecklist[];
          canResearch?: boolean;
        };
        grantsPowerup?: { id: string; charges: number };
      } = {
        id: t.id,
        tier: t.tier ?? 0,
        name: t.name,
        description: t.description,
        mods: t.mods ?? {},
        requirements: techRequirements(t)
      };
      if (t.effects) out.effects = { ...t.effects };
      if (t.rootId) out.rootId = t.rootId;
      if (t.requires) out.requires = t.requires;
      if (t.prereqIds && t.prereqIds.length > 0) out.prereqIds = [...t.prereqIds];
      if (t.grantsPowerup) out.grantsPowerup = t.grantsPowerup;
      if (player) {
        const check = techChecklistFor(player, t);
        out.requirements.checklist = check.checks;
        out.requirements.canResearch = check.ok;
      }
      return out;
    });
  };
  
  const IRON_DOMAIN_IDS = new Set<string>();
  const SUPPLY_DOMAIN_IDS = new Set(["expansion"]);
  const FOOD_DOMAIN_IDS = new Set(["urbanization"]);
  const CRYSTAL_DOMAIN_IDS = new Set<string>();
  
  const IRON_TECH_IDS = new Set(["masonry", "mining", "bronze-working", "fortified-walls", "siegecraft", "industrial-extraction", "breach-doctrine", "steelworking"]);
  const SUPPLY_TECH_IDS = new Set(["toolmaking", "leatherworking", "harborcraft", "logistics", "navigation", "organized-supply", "deep-operations", "terrain-engineering", "imperial-roads", "workshops"]);
  const FOOD_TECH_IDS = new Set(["agriculture", "irrigation", "pottery", "banking", "civil-service", "workshops"]);
  const CRYSTAL_TECH_IDS = new Set([
    "cartography",
    "signal-fires",
    "surveying",
    "beacon-towers",
    "cryptography",
    "grand-cartography",
    "banking",
    "trade",
    "ledger-keeping",
    "coinage",
    "maritime-trade",
    "port-infrastructure",
    "global-trade-networks",
    "urban-markets",
    "aeronautics",
    "radar",
    "plastics"
  ]);
  
  const empireStyleFromPlayer = (player: Player): EmpireVisualStyle => {
    const primaryOverlay = player.tileColor ?? colorFromId(player.id);
    let secondaryTint: EmpireVisualStyle["secondaryTint"] = "BALANCED";
  
    for (const id of player.domainIds) {
      if (IRON_DOMAIN_IDS.has(id)) {
        secondaryTint = "IRON";
        break;
      }
      if (SUPPLY_DOMAIN_IDS.has(id)) {
        secondaryTint = "SUPPLY";
        break;
      }
      if (FOOD_DOMAIN_IDS.has(id)) {
        secondaryTint = "FOOD";
        break;
      }
      if (CRYSTAL_DOMAIN_IDS.has(id)) {
        secondaryTint = "CRYSTAL";
        break;
      }
    }
  
    if (secondaryTint === "BALANCED") {
      const scores = { IRON: 0, SUPPLY: 0, FOOD: 0, CRYSTAL: 0 } satisfies Record<Exclude<EmpireVisualStyle["secondaryTint"], "BALANCED">, number>;
      for (const id of player.techIds) {
        if (IRON_TECH_IDS.has(id)) scores.IRON += 1;
        if (SUPPLY_TECH_IDS.has(id)) scores.SUPPLY += 1;
        if (FOOD_TECH_IDS.has(id)) scores.FOOD += 1;
        if (CRYSTAL_TECH_IDS.has(id)) scores.CRYSTAL += 1;
      }
      const ranked = (Object.entries(scores) as Array<[Exclude<EmpireVisualStyle["secondaryTint"], "BALANCED">, number]>)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if ((ranked[0]?.[1] ?? 0) >= 2) secondaryTint = ranked[0]![0];
    }
  
    const borderStyle: EmpireVisualStyle["borderStyle"] =
      secondaryTint === "IRON" ? "HEAVY" : secondaryTint === "SUPPLY" ? "DASHED" : secondaryTint === "FOOD" ? "SOFT" : secondaryTint === "CRYSTAL" ? "GLOW" : "SHARP";
    const structureAccent: EmpireVisualStyle["structureAccent"] = secondaryTint === "BALANCED" ? "NEUTRAL" : secondaryTint;
  
    return { primaryOverlay, secondaryTint, borderStyle, structureAccent };
  };
  
  const domainCostResources = (
    cost: Partial<Record<"gold" | "food" | "iron" | "supply" | "crystal" | "shard", number>>
  ): Partial<Record<StrategicResource, number>> => {
    const resources: Partial<Record<StrategicResource, number>> = {};
    if ((cost.food ?? 0) > 0) resources.FOOD = cost.food ?? 0;
    if ((cost.iron ?? 0) > 0) resources.IRON = cost.iron ?? 0;
    if ((cost.supply ?? 0) > 0) resources.SUPPLY = cost.supply ?? 0;
    if ((cost.crystal ?? 0) > 0) resources.CRYSTAL = cost.crystal ?? 0;
    if ((cost.shard ?? 0) > 0) resources.SHARD = cost.shard ?? 0;
    return resources;
  };
  
  const chosenDomainTierMax = (player: Player): number => {
    let tier = 0;
    for (const id of player.domainIds) {
      const d = domainById.get(id);
      if (d) tier = Math.max(tier, d.tier);
    }
    return tier;
  };
  
  const domainChecklistFor = (
    player: Player,
    domainId: string
  ): { ok: boolean; checks: DomainRequirementChecklist[]; gold: number; resources: Partial<Record<StrategicResource, number>> } => {
    const d = domainById.get(domainId);
    if (!d) return { ok: false, checks: [{ label: "Domain exists", met: false }], gold: 0, resources: {} };
    const checks: DomainRequirementChecklist[] = [];
    const stocks = getOrInitStrategicStocks(player.id);
    const gold = d.cost.gold ?? 0;
    const resources = domainCostResources(d.cost);
    const tierMax = chosenDomainTierMax(player);
    const pickedThisTier = [...player.domainIds].some((id) => domainById.get(id)?.tier === d.tier);
    checks.push({ label: `Requires tech ${d.requiresTechId}`, met: player.techIds.has(d.requiresTechId) });
    checks.push({ label: `Tier ${d.tier} progression`, met: d.tier <= tierMax + 1 });
    checks.push({ label: `One domain per tier`, met: !pickedThisTier });
    checks.push({ label: `Gold ${gold}`, met: player.points >= gold });
    for (const [r, amount] of Object.entries(resources) as Array<[StrategicResource, number]>) {
      checks.push({ label: `${r} ${amount}`, met: (stocks[r] ?? 0) >= amount });
    }
    return { ok: checks.every((c) => c.met), checks, gold, resources };
  };
  
  const reachableDomains = (player: Player): string[] => {
    const tierMax = chosenDomainTierMax(player);
    const targetTier = Math.min(5, tierMax + 1);
    const pickedAtTargetTier = [...player.domainIds].some((id) => domainById.get(id)?.tier === targetTier);
    if (pickedAtTargetTier) return [];
    return DOMAINS.filter((d) => d.tier === targetTier).map((d) => d.id);
  };
  
  const activeDomainCatalog = (player?: Player): Array<{
    id: string;
    tier: number;
    name: string;
    description: string;
    requiresTechId: string;
    mods: Partial<Record<StatsModKey, number>>;
    effects?: (typeof DOMAINS)[number]["effects"];
    requirements: {
      gold: number;
      resources: Partial<Record<StrategicResource, number>>;
      checklist?: DomainRequirementChecklist[];
      canResearch?: boolean;
    };
  }> => {
    return DOMAINS.map((d) => {
      const out: {
        id: string;
        tier: number;
        name: string;
        description: string;
        requiresTechId: string;
        mods: Partial<Record<StatsModKey, number>>;
        effects?: (typeof DOMAINS)[number]["effects"];
        requirements: {
          gold: number;
          resources: Partial<Record<StrategicResource, number>>;
          checklist?: DomainRequirementChecklist[];
          canResearch?: boolean;
        };
      } = {
        id: d.id,
        tier: d.tier,
        name: d.name,
        description: d.description,
        requiresTechId: d.requiresTechId,
        mods: d.mods ?? {},
        requirements: {
          gold: d.cost.gold ?? 0,
          resources: domainCostResources(d.cost)
        }
      };
      if (d.effects) out.effects = { ...d.effects };
      if (player) {
        const check = domainChecklistFor(player, d.id);
        out.requirements.checklist = check.checks;
        out.requirements.canResearch = check.ok;
      }
      return out;
    });
  };
  
  const applyDomain = (player: Player, domainId: string): { ok: boolean; reason?: string } => {
    const d = domainById.get(domainId);
    if (!d) return { ok: false, reason: "domain not found" };
    if (player.domainIds.has(domainId)) return { ok: false, reason: "domain already selected" };
    const check = domainChecklistFor(player, domainId);
    if (!check.ok) {
      const miss = check.checks.find((c) => !c.met);
      return { ok: false, reason: `requirements not met: ${miss?.label ?? "unknown"}` };
    }
    player.points = Math.max(0, player.points - check.gold);
    const stock = getOrInitStrategicStocks(player.id);
    for (const [r, amount] of Object.entries(check.resources) as Array<[StrategicResource, number]>) {
      stock[r] = Math.max(0, stock[r] - amount);
    }
    player.domainIds.add(domainId);
    recomputeTechModsFromOwnedTechs(player);
    telemetryCounters.techUnlocks += 1;
    return { ok: true };
  };
  

  return {
    reachableTechs,
    techDepth,
    playerWorldFlags,
    techRequirements,
    techChecklistFor,
    activeTechCatalog,
    empireStyleFromPlayer,
    domainCostResources,
    chosenDomainTierMax,
    domainChecklistFor,
    reachableDomains,
    activeDomainCatalog,
    applyDomain
  };
};
