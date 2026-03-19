import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export type StatsModKey = "attack" | "defense" | "income" | "vision";

export interface TechDef {
  id: string;
  rootId?: string;
  name: string;
  description: string;
  requires?: string;
  prereqIds?: string[];
  cost?: {
    gold?: number;
    food?: number;
    iron?: number;
    supply?: number;
    crystal?: number;
    shard?: number;
  };
  researchTimeSeconds?: number;
  mods?: Partial<Record<StatsModKey, number>>;
  grantsPowerup?: { id: string; charges: number };
}

const TechSchema = z.object({
  id: z.string().min(1),
  rootId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  requires: z.string().min(1).optional(),
  prereqIds: z.array(z.string().min(1)).optional(),
  cost: z
    .object({
      gold: z.number().nonnegative().optional(),
      food: z.number().nonnegative().optional(),
      iron: z.number().nonnegative().optional(),
      supply: z.number().nonnegative().optional(),
      crystal: z.number().nonnegative().optional(),
      shard: z.number().nonnegative().optional()
    })
    .optional(),
  researchTimeSeconds: z.number().int().positive().optional(),
  mods: z
    .object({
      attack: z.number().positive().optional(),
      defense: z.number().positive().optional(),
      income: z.number().positive().optional(),
      vision: z.number().positive().optional()
    })
    .partial()
    .optional(),
  grantsPowerup: z
    .object({
      id: z.string().min(1),
      charges: z.number().int().positive()
    })
    .optional()
});

const TechFileSchema = z.object({
  version: z.number().int().positive(),
  techs: z.array(TechSchema).min(1)
});

export interface LoadedTechTree {
  techs: TechDef[];
  techById: Map<string, TechDef>;
  childrenByTech: Map<string, string[]>;
  roots: string[];
}

const ROOT_LABELS: Record<string, { name: string; description: string; pool: string[] }> = {
  "dominion-core": {
    name: "Warfare Doctrine",
    description: "Focuses on military pressure, border breakthrough, and combat momentum.",
    pool: ["Bronze Working", "Iron Working", "Steel Forging", "Tactics", "Drill Formations", "Siegecraft", "Heavy Infantry", "Combined Arms"]
  },
  "aegis-core": {
    name: "Defensive Engineering",
    description: "Strengthens border holding, counter-attacks, and fortified fronts.",
    pool: ["Masonry", "Fortification", "Watch Posts", "Shield Wall", "Bastion Design", "Counterbattery", "Defensive Depth", "Stone Keep"]
  },
  "mercantile-core": {
    name: "Trade and Logistics",
    description: "Improves sustained growth through supply, movement, and economic discipline.",
    pool: ["Road Networks", "Caravans", "Market Charter", "Ledger Keeping", "Warehousing", "Supply Trains", "Customs", "Guild Contracts"]
  },
  "oracle-core": {
    name: "Scholarship and Recon",
    description: "Expands information advantage, strategic foresight, and coordinated planning.",
    pool: ["Cartography", "Surveying", "Signal Towers", "Field Intelligence", "Codebooks", "Astronomy", "Early Warning", "Strategic Analysis"]
  },
  "forge-core": {
    name: "Industry and Metallurgy",
    description: "Builds durable war capacity through materials, tools, and production quality.",
    pool: ["Smelting", "Alloying", "Toolmaking", "Foundries", "Gearworks", "Heat Treatment", "Industrial Standards", "Armory Workflow"]
  },
  "citadel-core": {
    name: "Statecraft and Order",
    description: "Improves cohesion through governance, civil structure, and strategic administration.",
    pool: ["Civil Service", "Tax Reform", "Provincial Law", "Bureau Records", "Command Hierarchy", "Public Works", "Internal Security", "Administrative Reach"]
  },
  "harvest-core": {
    name: "Agriculture and Provisioning",
    description: "Strengthens food security and long-term expansion through reliable provisioning.",
    pool: ["Irrigation", "Crop Rotation", "Seed Selection", "Granaries", "Plow Teams", "Soil Management", "Water Lifting", "Harvest Logistics"]
  },
  "horizon-core": {
    name: "Mobility and Exploration",
    description: "Favors maneuver, expansion speed, and flexible frontier operations.",
    pool: ["Pathfinding", "Horseback Riding", "Wayfinding", "Field Camps", "Bridge Building", "Rapid Deployment", "Scouting Lines", "March Discipline"]
  },
  "tempest-core": {
    name: "Skirmish and Tempo",
    description: "Leans into pressure timing, opportunistic strikes, and battle rhythm control.",
    pool: ["Light Cavalry", "Volley Timing", "Flanking Drills", "Shock Assault", "Battle Signals", "Rapid Muster", "Momentum Warfare", "Pursuit Doctrine"]
  },
  "bulwark-core": {
    name: "Frontier Security",
    description: "Specializes in chokepoints, territorial resilience, and sustained border defense.",
    pool: ["Border Patrols", "Checkpoint Network", "Reserve Lines", "Hardpoint Defense", "Chokepoint Doctrine", "Fallback Positions", "Perimeter Drills", "Fort Garrison"]
  }
};

const OFFENSE_FOCUSED_ROOTS = new Set(["dominion-core", "tempest-core", "horizon-core", "forge-core"]);

const modText = (mods?: Partial<Record<StatsModKey, number>>): string => {
  if (!mods) return "No direct stat modifier.";
  const parts = Object.entries(mods).map(([k, v]) => `${k} x${Number(v).toFixed(3)}`);
  return parts.length > 0 ? parts.join(" | ") : "No direct stat modifier.";
};

export const loadTechTree = (cwd: string): LoadedTechTree => {
  const candidates = [
    path.resolve(cwd, "data/tech-tree.json"),
    path.resolve(cwd, "packages/server/data/tech-tree.json")
  ];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    throw new Error(`tech-tree.json not found. tried: ${candidates.join(", ")}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const parsed = TechFileSchema.parse(raw);
  const techs = parsed.techs as TechDef[];

  const techById = new Map<string, TechDef>();
  const childrenByTech = new Map<string, string[]>();

  for (const tech of techs) {
    if (techById.has(tech.id)) throw new Error(`Duplicate tech id: ${tech.id}`);
    techById.set(tech.id, tech);
  }

  for (const tech of techs) {
    const parents = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
    for (const parentId of parents) {
      if (!techById.has(parentId)) {
        throw new Error(`Tech ${tech.id} references missing parent ${parentId}`);
      }
      const children = childrenByTech.get(parentId) ?? [];
      children.push(tech.id);
      childrenByTech.set(parentId, children);
    }
  }

  const roots = techs.filter((t) => !(t.prereqIds?.length) && !t.requires).map((t) => t.id);
  if (roots.length === 0) throw new Error("Tech tree has no entry nodes (no nodes without prerequisites)");

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Tech cycle detected at ${id}`);
    visiting.add(id);
    for (const child of childrenByTech.get(id) ?? []) dfs(child);
    visiting.delete(id);
    visited.add(id);
  };

  for (const rootId of roots) dfs(rootId);
  if (visited.size !== techs.length) {
    throw new Error(`Tech graph has cycle or disconnected component: visited ${visited.size} / ${techs.length}`);
  }

  // Enrich generated/generic content with recognizable names and clearer descriptions.
  const byId = new Map(techs.map((t) => [t.id, t]));
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depthMemo.get(id);
    if (cached !== undefined) return cached;
    const t = byId.get(id);
    if (!t) return 0;
    const parents = t.prereqIds && t.prereqIds.length > 0 ? t.prereqIds : t.requires ? [t.requires] : [];
    const d = parents.length > 0 ? Math.max(...parents.map((p) => depthOf(p))) + 1 : 0;
    depthMemo.set(id, d);
    return d;
  };
  for (const tech of techs) {
    if (tech.mods?.attack) {
      const delta = Math.max(0, tech.mods.attack - 1);
      const scale = tech.rootId && OFFENSE_FOCUSED_ROOTS.has(tech.rootId) ? 3.2 : 2.2;
      tech.mods.attack = 1 + delta * scale;
    }
    if (tech.mods?.defense) {
      const delta = Math.max(0, tech.mods.defense - 1);
      tech.mods.defense = 1 + delta * 1.4;
    }

    const label = tech.rootId ? ROOT_LABELS[tech.rootId] : undefined;
    if (!label) continue;
    const depth = depthOf(tech.id);
    if (!tech.requires) {
      tech.name = label.name;
      tech.description = `${label.description} ${modText(tech.mods)}`;
      continue;
    }
    const m = tech.id.match(/-n(\d+)$/);
    const idx = m ? Number(m[1]) : depth;
    const baseName = label.pool[idx % label.pool.length] ?? `Doctrine Tier ${depth}`;
    tech.name = `${baseName} (Tier ${Math.max(1, depth)})`;
    tech.description = `${label.name}: ${baseName}. ${modText(tech.mods)}`;
  }

  return { techs, techById, childrenByTech, roots };
};
