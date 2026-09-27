import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const text = (file) => readFileSync(resolve(root, file), "utf8");

test("agent entrypoints and local gates remain discoverable", () => {
  const agents = text("AGENTS.md");
  const docsMap = text("docs/README.md");
  for (const file of ["README.md", "docs/README.md", "docs/agents/documentation-maintenance.md", "scripts/create-worktree.sh", "scripts/local-ci.sh"]) {
    assert.equal(existsSync(resolve(root, file)), true, `${file} must exist`);
  }
  assert.match(agents, /origin\/develop/);
  assert.match(agents, /pnpm ci:local/);
  assert.match(docsMap, /documentation-maintenance\.md/);
  assert.match(docsMap, /agent-work-readiness-plan\.md/);
});
