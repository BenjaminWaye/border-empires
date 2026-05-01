import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DOMAIN_TREE_PATH, TECH_TREE_PATH } from "./init-payload.js";

const EXPECTED_TECH_TREE_PATH = fileURLToPath(new URL("../../../packages/server/data/tech-tree.json", import.meta.url));
const EXPECTED_DOMAIN_TREE_PATH = fileURLToPath(new URL("../../../packages/server/data/domain-tree.json", import.meta.url));

describe("gateway init progression sources", () => {
  it("loads the legacy server tech tree file", () => {
    expect(realpathSync(TECH_TREE_PATH)).toBe(realpathSync(EXPECTED_TECH_TREE_PATH));
    expect(readFileSync(TECH_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_TECH_TREE_PATH, "utf8"));
  });

  it("loads the legacy server domain tree file", () => {
    expect(realpathSync(DOMAIN_TREE_PATH)).toBe(realpathSync(EXPECTED_DOMAIN_TREE_PATH));
    expect(readFileSync(DOMAIN_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_DOMAIN_TREE_PATH, "utf8"));
  });
});
