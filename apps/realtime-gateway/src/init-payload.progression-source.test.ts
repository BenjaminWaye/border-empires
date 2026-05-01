import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DOMAIN_TREE_PATH,
  DOMAIN_TREE_RELATIVE_CANDIDATES,
  TECH_TREE_PATH,
  TECH_TREE_RELATIVE_CANDIDATES,
  resolveDataPath
} from "./init-payload.js";

const MODULE_URL = new URL("./init-payload.js", import.meta.url).href;
const EXPECTED_TECH_TREE_PATH = fileURLToPath(new URL("../../../packages/server/data/tech-tree.json", import.meta.url));
const EXPECTED_DOMAIN_TREE_PATH = fileURLToPath(new URL("../../../packages/server/data/domain-tree.json", import.meta.url));
const FALLBACK_TECH_TREE_PATH = fileURLToPath(new URL("../../../packages/game-domain/data/tech-tree.json", import.meta.url));
const FALLBACK_DOMAIN_TREE_PATH = fileURLToPath(new URL("../../../packages/game-domain/data/domain-tree.json", import.meta.url));

describe("gateway init progression sources", () => {
  it("loads the legacy server tech tree file", () => {
    expect(realpathSync(TECH_TREE_PATH)).toBe(realpathSync(EXPECTED_TECH_TREE_PATH));
    expect(readFileSync(TECH_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_TECH_TREE_PATH, "utf8"));
  });

  it("loads the legacy server domain tree file", () => {
    expect(realpathSync(DOMAIN_TREE_PATH)).toBe(realpathSync(EXPECTED_DOMAIN_TREE_PATH));
    expect(readFileSync(DOMAIN_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_DOMAIN_TREE_PATH, "utf8"));
  });

  it("falls back to packaged game-domain tech data when legacy server data is unavailable", () => {
    const resolved = resolveDataPath(TECH_TREE_RELATIVE_CANDIDATES, {
      from: MODULE_URL,
      exists: (path) => path === FALLBACK_TECH_TREE_PATH
    });

    expect(resolved).toBe(FALLBACK_TECH_TREE_PATH);
  });

  it("falls back to packaged game-domain domain data when legacy server data is unavailable", () => {
    const resolved = resolveDataPath(DOMAIN_TREE_RELATIVE_CANDIDATES, {
      from: MODULE_URL,
      exists: (path) => path === FALLBACK_DOMAIN_TREE_PATH
    });

    expect(resolved).toBe(FALLBACK_DOMAIN_TREE_PATH);
  });
});
