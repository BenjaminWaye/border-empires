import { execSync } from "node:child_process";
import { defineConfig } from "vite";

const manualChunkFor = (id: string): string | undefined => {
  if (id.includes("/firebase/") || id.includes("/@firebase/")) {
    return "firebase";
  }

  if (id.includes("/packages/shared/dist/")) {
    return "shared-game";
  }

  return undefined;
};

const resolveBuildVersion = (): string => {
  const envSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA;
  if (envSha) return envSha.slice(0, 8);
  try {
    const sha = execSync("git rev-parse --short=8 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().length > 0;
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return `dev-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  }
};

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: manualChunkFor
      }
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(resolveBuildVersion()),
    // Shared package dist files reference Node's `process.env` directly.
    // Replace with a subset so browser builds don't throw.
    "process.env": JSON.stringify({
      EMPIRE_INTEGRITY_ENABLED: process.env.EMPIRE_INTEGRITY_ENABLED ?? "true"
    })
  },
  test: {
    // Node >=22 exposes an experimental global `localStorage`/`sessionStorage`
    // (enabled by default, backed by --localstorage-file) that shadows the
    // happy-dom polyfill these `@vitest-environment happy-dom` test files rely
    // on. Node's built-in stub is missing `.clear()` when no file path is
    // configured, so `window.localStorage.clear()` throws. Disable it in the
    // test worker so happy-dom's own Storage implementation wins.
    poolOptions: {
      forks: {
        execArgv: ["--no-experimental-webstorage"]
      },
      threads: {
        execArgv: ["--no-experimental-webstorage"]
      }
    }
  }
});
