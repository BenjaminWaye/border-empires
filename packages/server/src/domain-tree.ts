import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export type DomainModKey = "attack" | "defense" | "income" | "vision";
export type DomainResourceKey = "gold" | "food" | "iron" | "supply" | "crystal" | "shard";

export interface DomainDef {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  cost: Partial<Record<DomainResourceKey, number>>;
  mods?: Partial<Record<DomainModKey, number>>;
  effects?: {
    revealUpkeepMult?: number;
    revealCapacityBonus?: number;
  };
}

const DomainSchema = z.object({
  id: z.string().min(1),
  tier: z.number().int().min(1).max(5),
  name: z.string().min(1),
  description: z.string().min(1),
  requiresTechId: z.string().min(1),
  cost: z
    .object({
      gold: z.number().nonnegative().optional(),
      food: z.number().nonnegative().optional(),
      iron: z.number().nonnegative().optional(),
      supply: z.number().nonnegative().optional(),
      crystal: z.number().nonnegative().optional(),
      shard: z.number().nonnegative().optional()
    })
    .partial(),
  mods: z
    .object({
      attack: z.number().positive().optional(),
      defense: z.number().positive().optional(),
      income: z.number().positive().optional(),
      vision: z.number().positive().optional()
    })
    .partial()
    .optional(),
  effects: z
    .object({
      revealUpkeepMult: z.number().positive().optional(),
      revealCapacityBonus: z.number().int().min(0).optional()
    })
    .partial()
    .optional()
});

const DomainFileSchema = z.object({
  version: z.number().int().positive(),
  domains: z.array(DomainSchema).min(1)
});

export interface LoadedDomainTree {
  domains: DomainDef[];
  domainById: Map<string, DomainDef>;
}

export const loadDomainTree = (cwd: string): LoadedDomainTree => {
  const candidates = [path.resolve(cwd, "data/domain-tree.json"), path.resolve(cwd, "packages/server/data/domain-tree.json")];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) throw new Error(`domain-tree.json not found. tried: ${candidates.join(", ")}`);

  const parsed = DomainFileSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));
  const domainById = new Map<string, DomainDef>();

  const domains: DomainDef[] = [];
  for (const d of parsed.domains) {
    const cost: DomainDef["cost"] = {};
    if (typeof d.cost.gold === "number") cost.gold = d.cost.gold;
    if (typeof d.cost.food === "number") cost.food = d.cost.food;
    if (typeof d.cost.iron === "number") cost.iron = d.cost.iron;
    if (typeof d.cost.supply === "number") cost.supply = d.cost.supply;
    if (typeof d.cost.crystal === "number") cost.crystal = d.cost.crystal;
    if (typeof d.cost.shard === "number") cost.shard = d.cost.shard;

    const normalized: DomainDef = {
      id: d.id,
      tier: d.tier,
      name: d.name,
      description: d.description,
      requiresTechId: d.requiresTechId,
      cost,
    };
    if (d.mods) {
      const mods: NonNullable<DomainDef["mods"]> = {};
      if (typeof d.mods.attack === "number") mods.attack = d.mods.attack;
      if (typeof d.mods.defense === "number") mods.defense = d.mods.defense;
      if (typeof d.mods.income === "number") mods.income = d.mods.income;
      if (typeof d.mods.vision === "number") mods.vision = d.mods.vision;
      if (Object.keys(mods).length > 0) normalized.mods = mods;
    }
    if (d.effects) {
      const effects: NonNullable<DomainDef["effects"]> = {};
      if (typeof d.effects.revealUpkeepMult === "number") effects.revealUpkeepMult = d.effects.revealUpkeepMult;
      if (typeof d.effects.revealCapacityBonus === "number") effects.revealCapacityBonus = d.effects.revealCapacityBonus;
      if (Object.keys(effects).length > 0) normalized.effects = effects;
    }

    if (domainById.has(normalized.id)) throw new Error(`Duplicate domain id: ${normalized.id}`);
    domainById.set(normalized.id, normalized);
    domains.push(normalized);
  }

  return { domains, domainById };
};
