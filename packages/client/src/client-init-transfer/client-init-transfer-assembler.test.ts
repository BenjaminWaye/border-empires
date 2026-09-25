import { encodeInitChunkFrames } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { createInitTransferAssembler } from "./client-init-transfer-assembler.js";
import { describeInitTransfer } from "./client-init-transfer-progress.js";

const payload = JSON.stringify({ type: "INIT", padding: "y".repeat(2500) });

describe("createInitTransferAssembler", () => {
  it("reassembles frames and reports cumulative progress", () => {
    const assembler = createInitTransferAssembler();
    const frames = encodeInitChunkFrames(payload, 1000);
    const results = frames.map((frame) => assembler.push(frame));
    expect(results.slice(0, -1).map((result) => result.kind)).toEqual(frames.slice(1).map(() => "progress"));
    const last = results.at(-1);
    expect(last?.kind).toBe("complete");
    if (last?.kind !== "complete") return;
    expect(last.payload).toBe(payload);
    expect(last.progress).toEqual({ phase: "building", receivedChars: payload.length, totalChars: payload.length });
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
  it("shows received/total KB and a percentage while downloading", () => {
    expect(describeInitTransfer({ phase: "downloading", receivedChars: 256 * 1024, totalChars: 1024 * 1024 })).toEqual({
      title: "Downloading your world...",
      detail: "256 KB of 1,024 KB received.",
      percent: 25
    });
  });

  it("switches to the building state once the download completes", () => {
    const view = describeInitTransfer({ phase: "building", receivedChars: 10, totalChars: 10 });
    expect(view.title).toBe("Building your map...");
    expect(view.percent).toBe(100);
  });
});
