import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Prefer compiled JS worker entries, but fall back to TS source files when
 * running directly from packages/server/src in local dev/test flows.
 */
export const resolveWorkerEntryUrl = (relativeJsPath: string, baseUrl: string): URL => {
  const jsUrl = new URL(relativeJsPath, baseUrl);
  if (existsSync(fileURLToPath(jsUrl))) {
    return jsUrl;
  }

  const tsUrl = new URL(relativeJsPath.replace(/\.js$/, ".ts"), baseUrl);
  if (existsSync(fileURLToPath(tsUrl))) {
    return tsUrl;
  }

  return jsUrl;
};
