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
  // must re-activate tsx's loader inside the worker whenever the resolved
  // entry is `.ts`.
  it("adds a --import for the tsx register preload for a .ts entry (local dev fallback)", () => {
    const execArgv = resolveWorkerExecArgv(new URL("file:///repo/src/worker.ts"));
    expect(execArgv[0]).toBe("--import");
    expect(execArgv[1]).toMatch(/tsx-worker-register-preload\.mjs$/);
  });

  it("adds nothing for a compiled .js entry (production/dist — no tsx needed)", () => {
    expect(resolveWorkerExecArgv(new URL("file:///repo/dist/worker.js"))).toEqual([]);
  });

  it("accepts a plain string path, not just a URL", () => {
    expect(resolveWorkerExecArgv("/repo/dist/worker.js")).toEqual([]);
    expect(resolveWorkerExecArgv("/repo/src/worker.ts")[0]).toBe("--import");
  });

  // Regression for the exact crash seen under vitest: process.execArgv can
  // contain flags (e.g. --expose-gc) that new Worker() rejects outright, so
  // this must never forward the parent's execArgv wholesale.
  it("never forwards the parent process's own execArgv", () => {
    const execArgv = resolveWorkerExecArgv(new URL("file:///repo/src/worker.ts"));
    expect(execArgv).not.toContain("--expose-gc");
  });

  // The critical regression: a prior version of this fix passed `--import
  // "tsx"` (the bare package specifier). That looked plausible and even
  // passed the assertions above, but tsx's package entry point only exports
  // old-style `--experimental-loader` hooks — merely `--import`ing it never
  // calls `module.register()`, so it silently did nothing and the worker
  // still crash-looped. Only an end-to-end spawn of a real `.ts` worker
  // proves the loader is actually active inside the worker thread.
  it("actually lets a real worker resolve a .ts entry's relative .js-mapped-to-.ts import", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-worker-exec-argv-e2e-"));
    tempDirs.push(dir);
    // Match apps/simulation's own package.json ("type": "module") — without
    // this, Node defaults an extension-less-format .ts file to CommonJS,
    // which trips an unrelated "require() ES Module in a cycle" error in
    // tsx's CJS-interop shim and masks whatever this test is actually
    // checking.
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
    fs.writeFileSync(
      path.join(dir, "dependency.ts"),
      "export const value = 42;\n"
    );
    const entryPath = path.join(dir, "entry.ts");
    fs.writeFileSync(
      entryPath,
      [
        "import { parentPort } from 'node:worker_threads';",
        // Written as a `.js` import of a `.ts` sibling — the exact pattern
        // that requires tsx's resolve hook to be active in this thread.
        "import { value } from './dependency.js';",
        "parentPort?.postMessage({ value });"
      ].join("\n")
    );
    const entryUrl = pathToFileURL(entryPath);

    const { Worker } = await import("node:worker_threads");
    const result = await new Promise<{ ok: true; value: number } | { ok: false; error: string }>((resolve) => {
      const worker = new Worker(entryUrl, { execArgv: resolveWorkerExecArgv(entryUrl) });
      const timer = setTimeout(() => {
        worker.terminate();
        resolve({ ok: false, error: "timed out waiting for the worker" });
      }, 10_000);
      worker.on("message", (msg: { value: number }) => {
        clearTimeout(timer);
        worker.terminate();
        resolve({ ok: true, value: msg.value });
      });
      worker.on("error", (err: Error) => {
        clearTimeout(timer);
        resolve({ ok: false, error: err.message });
      });
    });

    expect(result).toEqual({ ok: true, value: 42 });
  }, 15_000);
});
