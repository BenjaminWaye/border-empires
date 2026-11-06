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

test("local stack boots from a clean checkout and an empty DB", () => {
  // pnpm dev must build every workspace package the apps import (sim-protocol
  // ships simulation.proto in dist/), not just shared.
  const devScript = JSON.parse(text("package.json")).scripts.dev;
  for (const app of ["@border-empires/simulation", "@border-empires/realtime-gateway", "@border-empires/client"]) {
    assert.ok(devScript.includes(`"${app}^..."`), `pnpm dev must build ${app}'s dependencies`);
  }
  // A SQLite path requires durable state by default; the local seed scripts
  // must opt out so an empty DB seeds the world instead of crashing.
  for (const file of ["scripts/restart-rewrite-stack-20ai-seed.sh", "scripts/restart-rewrite-stack-20ai.sh"]) {
    assert.match(text(file), /SIMULATION_REQUIRE_DURABLE_STARTUP_STATE=0 \\/, `${file} must allow seeding an empty DB`);
  }
});

test("routine questions have a small entrypoint and no implementation setup", () => {
  const agents = text("AGENTS.md");
  assert.ok(Buffer.byteLength(agents, "utf8") <= 6000, "keep always-loaded instructions below 6 KB; move conditional detail to runbooks");
  assert.match(agents, /Read-only questions.*do not create worktrees/);
  assert.match(agents, /implementation-rules\.md/);
  const implementation = text("docs/agents/implementation-rules.md");
  for (const requirement of [/500-line/, /noUnusedLocals/, /isTrue3DRendererActive/, /CLIENT_CHANGELOG_ENTRIES/, /regression test/, /galactic-lore\.md/]) {
    assert.match(implementation, requirement);
  }
  assert.match(text("docs/agents/codex-token-budget.md"), /one narrow discovery batch/);
});
