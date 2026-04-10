import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeIncidentLog } from "./runtime-incident-log.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("runtime incident log", () => {
  it("persists breadcrumbs and reports a prior unclean shutdown on restart", async () => {
    const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "be-incident-log-"));
    tempDirs.push(snapshotDir);

    const firstBoot = createRuntimeIncidentLog({ snapshotDir });
    firstBoot.record("runtime_memory", { rssMb: 412.3 });
    firstBoot.record("slow_chunk_snapshot", { rssMb: 468.5, elapsedMs: 1811 });
    await firstBoot.flush();

    const secondBoot = createRuntimeIncidentLog({ snapshotDir });
    const crashReport = secondBoot.getLastCrashReport();
    expect(crashReport).toBeDefined();
    expect(crashReport?.cleanShutdown).toBe(false);
    expect(crashReport?.likelyCause).toBe("chunk_sync");
    expect(crashReport?.breadcrumbs).toHaveLength(2);
    expect(crashReport?.summary).toContain("Chunk snapshot");
    await secondBoot.flush();
  });

  it("does not report a crash after a clean shutdown", async () => {
    const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "be-incident-log-clean-"));
    tempDirs.push(snapshotDir);

    const firstBoot = createRuntimeIncidentLog({ snapshotDir });
    firstBoot.record("runtime_memory", { rssMb: 300.1 });
    await firstBoot.markCleanShutdown("SIGTERM");

    const secondBoot = createRuntimeIncidentLog({ snapshotDir });
    expect(secondBoot.getLastCrashReport()).toBeUndefined();
    await secondBoot.flush();
  });
});
