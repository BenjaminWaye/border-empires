import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Prefer compiled JS worker entries, but fall back to TS source files when
 * running directly from apps/simulation/src in local dev/test flows.
 */
export const resolveWorkerEntryUrl = (relativeJsPath: string, baseUrl: string): URL => {
  const jsUrl = new URL(relativeJsPath, baseUrl);
  if (existsSync(fileURLToPath(jsUrl))) {
    return jsUrl;
  }

  const basePath = fileURLToPath(new URL(".", baseUrl));
  const distBasePath = basePath.replace("/src/", "/dist/");
  if (distBasePath !== basePath) {
    const distBaseUrl = pathToFileURL(distBasePath.endsWith("/") ? distBasePath : `${distBasePath}/`);
    const distUrl = new URL(relativeJsPath, distBaseUrl);
    if (existsSync(fileURLToPath(distUrl))) {
      return distUrl;
    }
  }

  const tsUrl = new URL(relativeJsPath.replace(/\.js$/, ".ts"), baseUrl);
  if (existsSync(fileURLToPath(tsUrl))) {
    return tsUrl;
  }

  return jsUrl;
};
