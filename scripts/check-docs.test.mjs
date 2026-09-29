import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const script = new URL("./check-docs.mjs", import.meta.url).pathname;
const withRepo = (files, run) => {
  const dir = mkdtempSync(join(tmpdir(), "docs-check-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    execFileSync("git", ["add", "."], { cwd: dir });
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const check = (dir) => execFileSync("node", [script], { cwd: dir, encoding: "utf8", stdio: "pipe" });

test("accepts documented lifecycle markers and resolvable local links", () => withRepo({
  "docs/README.md": "# Docs\n\nStatus: canonical\n\n[Guide](guide.md)\n",
  "docs/guide.md": "# Guide\n\nStatus: runbook\n",
  "docs/archive/README.md": "# Archive\n\nStatus: canonical\n",
  "docs/archive/old.md": "# Old\n\nStatus: historical record — do not use as an execution plan.\n"
}, (dir) => assert.match(check(dir), /passed/)));

test("rejects missing lifecycle markers and broken local links", () => withRepo({
  "docs/README.md": "# Docs\n\n[Missing](missing.md)\n"
}, (dir) => assert.throws(() => check(dir), /missing Status: line near the top|unresolved local link/)));
