import { encodeInitChunkFrames } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { createInitTransferAssembler } from "./client-init-transfer-assembler.js";
import { describeInitTransfer, formatTimeLeft } from "./client-init-transfer-progress.js";

const payload = JSON.stringify({ type: "INIT", padding: "y".repeat(2500) });

describe("createInitTransferAssembler", () => {
  it("reassembles frames and reports cumulative progress", () => {
    const assembler = createInitTransferAssembler(() => 5_000);
    const frames = encodeInitChunkFrames(payload, 1000);
    const results = frames.map((frame) => assembler.push(frame));
    expect(results.slice(0, -1).map((result) => result.kind)).toEqual(frames.slice(1).map(() => "progress"));
    const last = results.at(-1);
    expect(last?.kind).toBe("complete");
    if (last?.kind !== "complete") return;
    expect(last.payload).toBe(payload);
    expect(last.progress).toEqual({
      phase: "building",
      receivedChars: payload.length,
      totalChars: payload.length,
      startedAt: 5_000,
      firstFrameChars: 1000
    });
  });

  it("rejects a skipped frame and starts over on the next index 0", () => {
    const assembler = createInitTransferAssembler();
    const frames = encodeInitChunkFrames(payload, 1000);
    expect(assembler.push(frames[0]!).kind).toBe("progress");
    expect(assembler.push(frames[2]!).kind).toBe("invalid");
    const retried = frames.map((frame) => assembler.push(frame));
    expect(retried.at(-1)?.kind).toBe("complete");
  });

  it("restarts cleanly when a new transfer begins mid-way through an old one", () => {
    const assembler = createInitTransferAssembler();
    const stale = encodeInitChunkFrames(JSON.stringify({ type: "INIT", stale: "z".repeat(3000) }), 1000);
    assembler.push(stale[0]!);
    assembler.push(stale[1]!);
    const fresh = encodeInitChunkFrames(payload, 1000).map((frame) => assembler.push(frame));
    const last = fresh.at(-1);
    expect(last?.kind === "complete" ? last.payload : undefined).toBe(payload);
  });
});

describe("describeInitTransfer", () => {
  const downloading = (receivedChars: number) => ({
    phase: "downloading" as const,
    receivedChars,
    totalChars: 1024 * 1024,
    startedAt: 10_000,
    firstFrameChars: 32 * 1024
  });

  it("says it is still estimating until the download speed can be measured", () => {
    const view = describeInitTransfer(downloading(32 * 1024), 10_100, 3_000);
    expect(view.detail).toBe("32 KB of 1,024 KB received. Estimating time left...");
    expect(view.remainingMs).toBeNull();
  });

  it("estimates time left as remaining download at the measured speed plus the map build", () => {
    // 224 KB in the 1s since the first frame -> 768 KB left takes ~3.43s, plus a 3s build.
    const view = describeInitTransfer(downloading(256 * 1024), 11_000, 3_000);
    expect(view.title).toBe("Downloading your world...");
    expect(view.percent).toBe(25);
    expect(view.remainingMs).toBeCloseTo(768 / 224 * 1000 + 3_000, 0);
    expect(view.detail).toBe("256 KB of 1,024 KB received. About 7s left.");
  });

  it("switches to the building state with the build estimate once the download completes", () => {
    const view = describeInitTransfer({ ...downloading(1024 * 1024), phase: "building" }, 20_000, 4_200);
    expect(view.title).toBe("Building your map...");
    expect(view.detail).toBe("World downloaded. Laying out your territory. About 5s left.");
    expect(view.percent).toBe(100);
  });

  it("formats long waits in minutes", () => {
    expect(formatTimeLeft(59_000)).toBe("About 59s left.");
    expect(formatTimeLeft(60_000)).toBe("About 1 min left.");
    expect(formatTimeLeft(95_000)).toBe("About 1 min 35s left.");
  });
});
