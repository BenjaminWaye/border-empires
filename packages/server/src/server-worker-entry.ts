import { existsSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { WorkerOptions } from "node:worker_threads";

export const SERVER_WORKER_ENTRY_RELATIVE_PATHS = {
  aiPlanner: "ai/planner-worker",
  chunkRead: "sim/chunk-read-worker",
  chunkSerializer: "chunk/serializer-worker",
  commandBus: "sim/command-bus-worker",
  combat: "sim/combat-worker"
} as const;

export type ServerWorkerEntry = keyof typeof SERVER_WORKER_ENTRY_RELATIVE_PATHS;

type ServerWorkerEntryExtension = ".js" | ".ts";
type ServerWorkerRuntimeMode = "dist" | "src";

const resolveServerRuntimeRootDir = (runtimeModuleUrl: string): string => dirname(fileURLToPath(runtimeModuleUrl));

const resolveServerRuntimeMode = (runtimeRootDir: string, runtimeModuleUrl: string): ServerWorkerRuntimeMode => {
  const runtimeDirName = basename(runtimeRootDir);
  if (runtimeDirName === "src") return "src";
  if (runtimeDirName === "dist") return "dist";
  return extname(fileURLToPath(runtimeModuleUrl)) === ".ts" ? "src" : "dist";
};

const resolveServerWorkerEntryPathForRuntime = (
  entry: ServerWorkerEntry,
  runtimeRootDir: string,
  extension: ServerWorkerEntryExtension
): string => resolve(runtimeRootDir, `${SERVER_WORKER_ENTRY_RELATIVE_PATHS[entry]}${extension}`);

export const resolveServerWorkerEntryPath = (entry: ServerWorkerEntry, runtimeModuleUrl: string = import.meta.url): string => {
  const runtimeRootDir = resolveServerRuntimeRootDir(runtimeModuleUrl);
  const runtimeMode = resolveServerRuntimeMode(runtimeRootDir, runtimeModuleUrl);
  const extension = runtimeMode === "src" ? ".ts" : ".js";
  const workerEntryPath = resolveServerWorkerEntryPathForRuntime(entry, runtimeRootDir, extension);
  if (!existsSync(workerEntryPath)) {
    throw new Error(`Resolved ${entry} worker entry does not exist: ${workerEntryPath}`);
  }
  return workerEntryPath;
};

export const resolveServerWorkerEntryUrl = (entry: ServerWorkerEntry, runtimeModuleUrl: string = import.meta.url): URL =>
  pathToFileURL(resolveServerWorkerEntryPath(entry, runtimeModuleUrl));

export const resolveServerWorkerOptions = (runtimeModuleUrl: string = import.meta.url): WorkerOptions | undefined => {
  const runtimeRootDir = resolveServerRuntimeRootDir(runtimeModuleUrl);
  const runtimeMode = resolveServerRuntimeMode(runtimeRootDir, runtimeModuleUrl);
  if (runtimeMode !== "src") return undefined;
  return {
    execArgv: ["--import", "tsx"]
  };
};
