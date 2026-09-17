import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Profiler } from "node:inspector";
import { captureCpuProfile, parseCpuProfileDurationMs, summarizeCpuProfile } from "./debug-cpu-profile.js";

const frame = (id: number, functionName: string, url: string, lineNumber: number): Profiler.ProfileNode => ({
  id,
  callFrame: { functionName, scriptId: "1", url, lineNumber, columnNumber: 0 },
  hitCount: 0
});

describe("summarizeCpuProfile", () => {
  it("attributes self time per sample and aggregates same function+line across nodes", () => {
    const profile: Profiler.Profile = {
      nodes: [frame(1, "(root)", "", 0), frame(2, "hot", "file:///a.js", 9), frame(3, "hot", "file:///a.js", 9), frame(4, "cold", "file:///b.js", 0)],
      startTime: 0,
      endTime: 10_000,
      samples: [2, 3, 2, 4, 2],
      timeDeltas: [1000, 1000, 1000, 1000, 1000]
    };
    const { sampledMs, topSelf } = summarizeCpuProfile(profile);
    expect(sampledMs).toBe(5);
    expect(topSelf[0]).toEqual({ functionName: "hot", url: "file:///a.js", line: 10, selfMs: 4, selfPct: 80 });
    expect(topSelf[1]).toEqual({ functionName: "cold", url: "file:///b.js", line: 1, selfMs: 1, selfPct: 20 });
    // The root node had no samples, so it must not appear at all.
    expect(topSelf.find((f) => f.functionName === "(root)")).toBeUndefined();
  });
});

describe("parseCpuProfileDurationMs", () => {
  it("reads ?ms= and falls back to the default", () => {
    expect(parseCpuProfileDurationMs("/debug/cpu-profile?ms=1500")).toBe(1500);
    expect(parseCpuProfileDurationMs("/debug/cpu-profile")).toBe(5000);
  });
});

describe("captureCpuProfile", () => {
  it("profiles the calling thread and names a busy function in the top self frames", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpuprof-"));
    // Named so the sampler can attribute the spin to it.
    function burnCpuForProfileTest(untilMs: number): number {
      let acc = 0;
      while (Date.now() < untilMs) acc = (acc * 31 + 7) % 1_000_003;
      return acc;
    }
    const capture = captureCpuProfile(400, outDir);
    // Profiler.start resolves asynchronously, so a synchronous spin right
    // here would finish before sampling begins -- defer it into the window.
    setTimeout(() => burnCpuForProfileTest(Date.now() + 250), 50);
    const summary = await capture;
    expect(summary.ok).toBe(true);
    expect(summary.durationMs).toBe(400);
    expect(fs.existsSync(summary.path)).toBe(true);
    expect(summary.bytes).toBeGreaterThan(0);
    expect(summary.topSelf.some((f) => f.functionName === "burnCpuForProfileTest")).toBe(true);
    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
