import { execSync } from "node:child_process";
import { defineConfig } from "vite";

const resolveBuildVersion = (): string => {
  const envSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA;
  if (envSha) return envSha.slice(0, 8);
  try {
    return execSync("git rev-parse --short=8 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(resolveBuildVersion())
  }
});
