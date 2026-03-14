import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export type StatsModKey = "attack" | "defense" | "income" | "vision";

export interface TechDef {
  id: string;
  rootId: string;
  name: string;
  description: string;
  requires?: string;
  mods?: Partial<Record<StatsModKey, number>>;
  grantsPowerup?: { id: string; charges: number };
}

const TechSchema = z.object({
  id: z.string().min(1),
  rootId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  requires: z.string().min(1).optional(),
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
  roots: TechDef[];
}

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
    if (tech.requires && !techById.has(tech.requires)) {
      throw new Error(`Tech ${tech.id} references missing parent ${tech.requires}`);
    }
    if (tech.requires) {
      const children = childrenByTech.get(tech.requires) ?? [];
      children.push(tech.id);
      childrenByTech.set(tech.requires, children);
    }
  }

  const roots = techs.filter((t) => !t.requires);
  if (roots.length === 0) throw new Error("Tech tree has no roots");

  for (const root of roots) {
    if (root.rootId !== root.id) {
      throw new Error(`Root ${root.id} must have rootId equal to id`);
    }
  }

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

  for (const root of roots) dfs(root.id);
  if (visited.size !== techs.length) {
    throw new Error(`Unreachable tech nodes found: visited ${visited.size} / ${techs.length}`);
  }

  for (const tech of techs) {
    if (tech.rootId === tech.id) continue;
    const root = techById.get(tech.rootId);
    if (!root || root.rootId !== root.id) {
      throw new Error(`Tech ${tech.id} has invalid rootId ${tech.rootId}`);
    }
  }

  return { techs, techById, childrenByTech, roots };
};
