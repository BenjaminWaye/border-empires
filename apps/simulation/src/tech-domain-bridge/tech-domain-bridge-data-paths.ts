import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Resolves the on-disk tech-tree/domain-tree JSON paths tech-domain-bridge.ts
// loads at import time. Split out of that file (already over the repo's
// 500-line soft cap) so this addition doesn't grow it further -- see
// scripts/check-file-line-limits.mjs.

export const resolveDataPath = (
  relativeCandidates: readonly string[],
  options: {
    from?: string;
    exists?: (path: string) => boolean;
  } = {}
): string => {
  const from = options.from ?? import.meta.url;
  const exists = options.exists ?? existsSync;
  for (const relativePath of relativeCandidates) {
    const resolved = fileURLToPath(new URL(relativePath, from));
    if (exists(resolved)) return resolved;
  }
  return fileURLToPath(new URL(relativeCandidates[0]!, from));
};

export const TECH_TREE_RELATIVE_CANDIDATES = [
  "../../../packages/game-domain/data/tech-tree.json",
  "../../../../packages/game-domain/data/tech-tree.json",
  "../../../../../../packages/game-domain/data/tech-tree.json"
] as const;
export const DOMAIN_TREE_RELATIVE_CANDIDATES = [
  "../../../packages/game-domain/data/domain-tree.json",
  "../../../../packages/game-domain/data/domain-tree.json",
  "../../../../../../packages/game-domain/data/domain-tree.json"
] as const;
