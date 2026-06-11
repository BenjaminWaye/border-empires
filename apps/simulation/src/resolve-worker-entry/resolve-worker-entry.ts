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

  // Merged-process fallback: when the caller is the gateway's compiled
  // dist (apps/realtime-gateway/dist/simulation/src/...) and tsc didn't
  // emit the worker file (because it was never statically imported), the
  // worker script still exists in the simulation app's own dist at
  // apps/simulation/dist/<file>. Walk up from the caller to find it.
  const baseSegments = basePath.split("/").filter(Boolean);
  const appsIndex = baseSegments.lastIndexOf("apps");
  if (appsIndex >= 0 && appsIndex + 1 < baseSegments.length) {
    const root = "/" + baseSegments.slice(0, appsIndex).join("/");
    const candidate = `${root}/apps/simulation/dist/${relativeJsPath.replace(/^\.\//, "")}`;
    if (existsSync(candidate)) {
      return pathToFileURL(candidate);
    }
  }

  return jsUrl;
};
