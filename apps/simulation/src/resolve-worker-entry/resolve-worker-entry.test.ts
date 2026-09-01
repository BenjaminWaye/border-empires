import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { resolveWorkerEntryUrl, resolveWorkerExecArgv } from "./resolve-worker-entry.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const makeTempBaseUrl = (subdir: "src" | "dist"): { dir: string; baseUrl: string } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "simulation-worker-entry-"));
  tempDirs.push(dir);
  const workerDir = path.join(dir, subdir);
  fs.mkdirSync(workerDir, { recursive: true });
  const basePath = path.join(workerDir, "producer.ts");
  fs.writeFileSync(basePath, "export {};\n");
  return { dir, baseUrl: pathToFileURL(basePath).href };
};

describe("resolve worker entry", () => {
  it("falls back to the ts source worker when the sibling js entry is missing", () => {
    const { dir, baseUrl } = makeTempBaseUrl("src");
    const tsWorkerPath = path.join(dir, "src", "ai-planner-worker.ts");
    fs.writeFileSync(tsWorkerPath, "export {};\n");

    const resolved = resolveWorkerEntryUrl("./ai-planner-worker.js", baseUrl);

    expect(fileURLToPath(resolved)).toBe(tsWorkerPath);
  });

  it("prefers the compiled dist worker when resolving from a src entrypoint", () => {
    const { dir, baseUrl } = makeTempBaseUrl("src");
    const distWorkerPath = path.join(dir, "dist", "ai-planner-worker.js");
    fs.mkdirSync(path.dirname(distWorkerPath), { recursive: true });
    fs.writeFileSync(distWorkerPath, "export {};\n");
    fs.writeFileSync(path.join(dir, "src", "ai-planner-worker.ts"), "export {};\n");

    const resolved = resolveWorkerEntryUrl("./ai-planner-worker.js", baseUrl);

    expect(fileURLToPath(resolved)).toBe(distWorkerPath);
  });
});

describe("resolveWorkerExecArgv", () => {
  // Regression: `new Worker(scriptPath)` on a `.ts` fallback entry (local dev
  // under `tsx watch`) crash-loops with ERR_MODULE_NOT_FOUND on its first
  // relative import, because tsx's loader hooks — registered in the main
  // thread — don't propagate to new worker_threads. resolveWorkerExecArgv
  // must re-register tsx via execArgv whenever the resolved entry is `.ts`.
  it("adds a tsx --import for a .ts entry (local dev fallback)", () => {
    const execArgv = resolveWorkerExecArgv(new URL("file:///repo/src/worker.ts"));
    expect(execArgv).toEqual(["--import", "tsx"]);
  });

  it("adds nothing for a compiled .js entry (production/dist — no tsx needed)", () => {
    expect(resolveWorkerExecArgv(new URL("file:///repo/dist/worker.js"))).toEqual([]);
  });

  it("accepts a plain string path, not just a URL", () => {
    expect(resolveWorkerExecArgv("/repo/dist/worker.js")).toEqual([]);
    expect(resolveWorkerExecArgv("/repo/src/worker.ts")).toEqual(["--import", "tsx"]);
  });

  // Regression for the exact crash seen under vitest: process.execArgv can
  // contain flags (e.g. --expose-gc) that new Worker() rejects outright, so
  // this must never forward the parent's execArgv wholesale.
  it("never forwards the parent process's own execArgv", () => {
    const execArgv = resolveWorkerExecArgv(new URL("file:///repo/src/worker.ts"));
    expect(execArgv).not.toContain("--expose-gc");
  });
});
