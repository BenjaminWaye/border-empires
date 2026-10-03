// Mirrors apps/simulation/src/tech-domain-bridge/tech-domain-bridge.ts's
// reachableTechChoices: unresearched tech whose prereqs are all already
// owned. The server only pushes the reachable list itself via a TECH_UPDATE
// event (which fires reactively, after a CHOOSE_TECH round-trip) -- a fresh
// session has no TECH_UPDATE yet, so turn 1 would see no choices at all
// without computing this client-side. The tech tree is static game data
// (packages/game-domain/data/tech-tree.json), not part of any package's
// exported JS API, so it's read directly via a relative path the same way
// apps/simulation's tech-domain-bridge-data-paths.ts does -- both src/ and
// dist/ sit at the same depth under apps/llm-player/, so one relative
// candidate covers both `tsx src/index.ts` (dev) and `node dist/index.js`
// (built).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MONUMENT_UNLOCK_TECH_ID, techGoldCostForResearchedCount } from "@border-empires/shared";

// Every monument-unlock tech's only effects are the monument itself, the
// Aether Tower, and/or an aether ability (packages/game-domain/data/tech-
// tree.json's effects field) -- none of which this bot can build or cast
// (BUILDABLE_STRUCTURE_TYPES in structures.ts is FARMSTEAD/MINE only, and
// aether abilities aren't in COMMAND_TOOLS at all). Researching one is pure
// waste for this bot today, and the server's own reachableTechChoices
// additionally excludes whichever of these six is already claimed by any
// player this season (apps/simulation/src/tech-domain-bridge/tech-domain-
// bridge.ts's buildTechUpdatePayload passes claimedMonumentUnlockTechIds as
// excludeTechIds) -- a claim this client can't verify at all client-side
// (monument tiles outside the bot's fog-of-war vision are invisible to it),
// so offering one that's already been claimed elsewhere would silently fail
// forever (CHOOSE_TECH has no ack). Excluding all six outright is strictly
// correct given neither branch is reachable for this bot anyway.
const MONUMENT_UNLOCK_TECH_IDS: ReadonlySet<string> = new Set(Object.values(MONUMENT_UNLOCK_TECH_ID));

type RawTech = {
  id: string;
  tier: number;
  branch: string;
  name: string;
  description: string;
  requires?: string;
  prereqIds?: string[];
};

export type TechChoice = { id: string; name: string; description: string; tier: number; branch: string; goldCost: number };

const TECH_TREE_RELATIVE_CANDIDATES = [
  "../../../packages/game-domain/data/tech-tree.json",
  "../../../../packages/game-domain/data/tech-tree.json"
] as const;

const resolveTechTreePath = (): string => {
  for (const relativePath of TECH_TREE_RELATIVE_CANDIDATES) {
    const resolved = fileURLToPath(new URL(relativePath, import.meta.url));
    if (existsSync(resolved)) return resolved;
  }
  throw new Error(
    `Could not find tech-tree.json via any of: ${TECH_TREE_RELATIVE_CANDIDATES.join(", ")} (relative to ${import.meta.url})`
  );
};

const loadTechs = (): RawTech[] => {
  const raw = JSON.parse(readFileSync(resolveTechTreePath(), "utf8")) as { techs: RawTech[] };
  return raw.techs;
};

const TECHS: RawTech[] = loadTechs();

const prereqIdsFor = (tech: RawTech): string[] =>
  tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];

// goldCost is the same escalating per-research-count formula the real
// client displays (see apps/simulation/src/tech-domain-bridge/tech-domain-
// bridge.ts's buildTechUpdatePayload) -- NOT each tech's own listed
// cost.gold in tech-tree.json, which the server ignores in favor of this
// formula (every tech in the current tree lists a flat 10 there regardless).
export const reachableTechChoices = (ownedTechIds: readonly string[]): TechChoice[] => {
  const owned = new Set(ownedTechIds);
  const goldCost = techGoldCostForResearchedCount(owned.size);
  return TECHS.filter(
    (tech) => !owned.has(tech.id) && !MONUMENT_UNLOCK_TECH_IDS.has(tech.id) && prereqIdsFor(tech).every((id) => owned.has(id))
  ).map((tech) => ({
    id: tech.id,
    name: tech.name,
    description: tech.description,
    tier: tech.tier,
    branch: tech.branch,
    goldCost
  }));
};
