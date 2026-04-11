import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  SERVER_WORKER_ENTRY_RELATIVE_PATHS,
  resolveServerWorkerEntryPath,
  resolveServerWorkerOptions,
  type ServerWorkerEntry
} from "./server-worker-entry.js";

const tempDirs: string[] = [];

const workerEntries = Object.entries(SERVER_WORKER_ENTRY_RELATIVE_PATHS) as Array<[ServerWorkerEntry, string]>;

const createRuntimeLayout = (runtimeDirName: "dist" | "src", extension: ".js" | ".ts") => {
  const tempDir = mkdtempSync(join(tmpdir(), "border-empires-worker-entry-"));
  tempDirs.push(tempDir);

  const runtimeRootDir = resolve(tempDir, runtimeDirName);
  mkdirSync(runtimeRootDir, { recursive: true });

  const runtimeModulePath = resolve(runtimeRootDir, `server-worker-entry${extension}`);
  writeFileSync(runtimeModulePath, "");

  for (const [, relativePath] of workerEntries) {
    const workerPath = resolve(runtimeRootDir, `${relativePath}${extension}`);
    mkdirSync(dirname(workerPath), { recursive: true });
    writeFileSync(workerPath, `// ${relativePath}${extension}\n`);
  }

  return {
    runtimeModuleUrl: pathToFileURL(runtimeModulePath).href,
    runtimeRootDir
  };
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe("server worker entry resolution", () => {
  it("targets src worker entrypoints in dev mode", () => {
    const layout = createRuntimeLayout("src", ".ts");

    for (const [entry, relativePath] of workerEntries) {
      expect(resolveServerWorkerEntryPath(entry, layout.runtimeModuleUrl)).toBe(resolve(layout.runtimeRootDir, `${relativePath}.ts`));
    }
    expect(resolveServerWorkerOptions(layout.runtimeModuleUrl)).toEqual({ execArgv: ["--import", "tsx"] });
  });

  it("targets dist worker entrypoints in build mode", () => {
    const layout = createRuntimeLayout("dist", ".js");

    for (const [entry, relativePath] of workerEntries) {
      expect(resolveServerWorkerEntryPath(entry, layout.runtimeModuleUrl)).toBe(resolve(layout.runtimeRootDir, `${relativePath}.js`));
    }
    expect(resolveServerWorkerOptions(layout.runtimeModuleUrl)).toBeUndefined();
  });

  it("fails fast when the resolved worker entry does not exist", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "border-empires-worker-entry-missing-"));
    tempDirs.push(tempDir);

    const runtimeRootDir = resolve(tempDir, "src");
    mkdirSync(runtimeRootDir, { recursive: true });

    const runtimeModulePath = resolve(runtimeRootDir, "server-worker-entry.ts");
    writeFileSync(runtimeModulePath, "");

    expect(() => resolveServerWorkerEntryPath("commandBus", pathToFileURL(runtimeModulePath).href)).toThrowError(
      new RegExp(`Resolved commandBus worker entry does not exist: ${resolve(runtimeRootDir, "sim/command-bus-worker.ts")}`)
    );
  });
});
