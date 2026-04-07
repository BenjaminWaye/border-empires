import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureSnapshotDir = resolve(here, "__fixtures__/late-game-snapshot");
const serverPackageDir = resolve(here, "../..");
const randomReplayPort = (): number => 32000 + Math.floor(Math.random() * 10000);

const sleep = (ms: number): Promise<void> => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const waitForChildExit = async (child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> =>
  await new Promise((resolveWait) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolveWait();
    };
    const timeout = setTimeout(finish, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      finish();
    });
  });

const fetchJson = async <T>(url: string, timeoutMs: number): Promise<{ json: T; elapsedMs: number }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const json = (await response.json()) as T;
    return { json, elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
};

export type PlanningStaticReplayResult = {
  startupReady: boolean;
  maxDebugElapsedMs: number;
  planningSnapshotBreaches: Array<{ phase?: string; elapsedMs: number }>;
  logs: string;
};

export const runPlanningStaticReplaySmoke = async (): Promise<PlanningStaticReplayResult> => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "be-ai-replay-"));
  const snapshotDir = resolve(tempRoot, "snapshots");
  cpSync(fixtureSnapshotDir, snapshotDir, { recursive: true });
  const port = randomReplayPort();
  const logs: string[] = [];
  const useDist = process.env.AI_REPLAY_USE_DIST === "1";
  const child = spawn(process.execPath, useDist ? ["dist/main.js"] : ["--import", "tsx", "src/main.ts"], {
    cwd: serverPackageDir,
    env: {
      ...process.env,
      PORT: String(port),
      SNAPSHOT_DIR: snapshotDir,
      AI_PLAYERS: process.env.AI_REPLAY_AI_PLAYERS ?? "40",
      AI_DISPATCH_INTERVAL_MS: "250",
      AI_TICK_BATCH_SIZE: "1",
      AI_PLANNER_WORKER: "0",
      SIM_COMBAT_WORKER: "0",
      CHUNK_SERIALIZER_WORKER: "0",
      CHUNK_READ_WORKER: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));

  let childExitCode: number | null = null;
  child.on("exit", (code) => {
    childExitCode = code;
  });

  try {
    let startupReady = false;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      if (childExitCode !== null) {
        throw new Error(`server exited early with code ${childExitCode}\n${logs.join("")}`);
      }
      try {
        const { json } = await fetchJson<{ ok: boolean }>(`http://127.0.0.1:${port}/health`, 2_500);
        if (json.ok) {
          startupReady = true;
          break;
        }
      } catch {
        // continue polling until startup completes
      }
      await sleep(500);
    }

    if (!startupReady) {
      return {
        startupReady: false,
        maxDebugElapsedMs: 0,
        planningSnapshotBreaches: [],
        logs: logs.join("")
      };
    }

    const debugSamples: Array<{ elapsedMs: number; aiBudget: { recent: Array<{ phase?: string; elapsedMs: number }> } }> = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (childExitCode !== null) {
        throw new Error(`server exited during replay with code ${childExitCode}\n${logs.join("")}`);
      }
      let sample: { json: { ok: boolean; aiBudget: { recent: Array<{ phase?: string; elapsedMs: number }> } }; elapsedMs: number };
      try {
        sample = await fetchJson<{
          ok: boolean;
          aiBudget: { recent: Array<{ phase?: string; elapsedMs: number }> };
        }>(`http://127.0.0.1:${port}/admin/runtime/debug`, 2_000);
      } catch (err) {
        await sleep(5_000);
        throw new Error(`runtime debug timed out on attempt ${attempt + 1}\n${err instanceof Error ? err.message : String(err)}\n${logs.join("")}`);
      }
      if (!sample.json.ok) {
        throw new Error(`runtime debug returned not-ok payload\n${JSON.stringify(sample.json)}\n${logs.join("")}`);
      }
      debugSamples.push({ elapsedMs: sample.elapsedMs, aiBudget: sample.json.aiBudget });
      await sleep(1_000);
    }

    return {
      startupReady: true,
      maxDebugElapsedMs: Math.max(...debugSamples.map((sample) => sample.elapsedMs)),
      planningSnapshotBreaches: debugSamples.flatMap((sample) =>
        sample.aiBudget.recent.filter((entry) => entry.phase === "planningSnapshot")
      ),
      logs: logs.join("")
    };
  } finally {
    child.kill("SIGTERM");
    await waitForChildExit(child, 1_000);
    if (childExitCode === null) {
      child.kill("SIGKILL");
      await waitForChildExit(child, 1_000);
    }
    child.stdout.destroy();
    child.stderr.destroy();
    rmSync(tempRoot, { recursive: true, force: true });
  }
};
