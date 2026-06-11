import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = new URL("..", import.meta.url).pathname;
const scriptPath = join(repoRoot, "scripts/check-file-line-limits.mjs");

const run = (cwd, args, options = {}) => execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", ...options });
const lines = (count) => Array.from({ length: count }, (_, index) => `export const value${index} = ${index};`).join("\n") + "\n";

const withRepo = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "line-limit-"));
  try {
    run(dir, ["git", "init", "-q"]);
    run(dir, ["git", "config", "user.email", "test@example.com"]);
    run(dir, ["git", "config", "user.name", "Test"]);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("fails when an already oversized source file grows", () => withRepo((dir) => {
  writeFileSync(join(dir, "large.ts"), lines(501));
  run(dir, ["git", "add", "large.ts"]);
  run(dir, ["git", "commit", "-qm", "base"]);
  writeFileSync(join(dir, "large.ts"), lines(502));

  assert.throws(
    () => run(dir, ["node", scriptPath], { env: { ...process.env, FILE_LINE_LIMIT_BASE_REF: "HEAD" }, stdio: "pipe" }),
    /already over 500 lines/
  );
}));

test("passes when an oversized source file shrinks", () => withRepo((dir) => {
  writeFileSync(join(dir, "large.ts"), lines(501));
  run(dir, ["git", "add", "large.ts"]);
  run(dir, ["git", "commit", "-qm", "base"]);
  writeFileSync(join(dir, "large.ts"), lines(500));

  const output = run(dir, ["node", scriptPath], { env: { ...process.env, FILE_LINE_LIMIT_BASE_REF: "HEAD" } });
  assert.match(output, /passed/);
}));

test("passes when an oversized source file is renamed without growing", () => withRepo((dir) => {
  writeFileSync(join(dir, "large.ts"), lines(501));
  run(dir, ["git", "add", "large.ts"]);
  run(dir, ["git", "commit", "-qm", "base"]);
  run(dir, ["mkdir", "large"]);
  run(dir, ["git", "mv", "large.ts", "large/large.ts"]);

  const output = run(dir, ["node", scriptPath], { env: { ...process.env, FILE_LINE_LIMIT_BASE_REF: "HEAD" } });
  assert.match(output, /passed/);
}));

test("fails when a new source file exceeds the cap", () => withRepo((dir) => {
  writeFileSync(join(dir, "README.md"), "base\n");
  run(dir, ["git", "add", "README.md"]);
  run(dir, ["git", "commit", "-qm", "base"]);
  writeFileSync(join(dir, "new.ts"), lines(501));

  assert.throws(
    () => run(dir, ["node", scriptPath], { env: { ...process.env, FILE_LINE_LIMIT_BASE_REF: "HEAD" }, stdio: "pipe" }),
    /new source file has 501 lines/
  );
}));
