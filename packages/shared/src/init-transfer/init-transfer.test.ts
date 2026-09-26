import { describe, expect, it } from "vitest";
import { decodeInitChunkFrame, encodeInitChunkFrames, isInitChunkFrame } from "./init-transfer.js";

const reassemble = (frames: string[]): string =>
  frames
    .map((frame) => decodeInitChunkFrame(frame))
    .map((decoded) => {
      if (!decoded) throw new Error("frame failed to decode");
      return decoded.data;
    })
    .join("");

describe("init chunk framing", () => {
  it("round-trips a payload through chunk frames", () => {
    const payload = JSON.stringify({ type: "INIT", tiles: Array.from({ length: 500 }, (_, i) => ({ x: i, y: i * 2 })) });
    const frames = encodeInitChunkFrames(payload, 1000);
    expect(frames.length).toBe(Math.ceil(payload.length / 1000));
    expect(frames.every(isInitChunkFrame)).toBe(true);
    const first = decodeInitChunkFrame(frames[0]!);
    expect(first).toMatchObject({ index: 0, count: frames.length, totalChars: payload.length });
    expect(reassemble(frames)).toBe(payload);
  });

  it("never splits a surrogate pair across frames", () => {
    const payload = JSON.stringify({ name: "a🏰".repeat(200) });
    for (let target = 2; target < 12; target += 1) {
      const frames = encodeInitChunkFrames(payload, target);
      for (const frame of frames) {
        const data = decodeInitChunkFrame(frame)!.data;
        const last = data.charCodeAt(data.length - 1);
        expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
      }
      expect(reassemble(frames)).toBe(payload);
    }
  });

  it("does not treat JSON messages or malformed headers as chunk frames", () => {
    expect(isInitChunkFrame('{"type":"INIT"}')).toBe(false);
    expect(decodeInitChunkFrame('{"type":"INIT"}')).toBeUndefined();
    expect(decodeInitChunkFrame("\u001eIC1/1/10|abc")).toBeUndefined();
    expect(decodeInitChunkFrame("\u001eICx/2/10|abc")).toBeUndefined();
    expect(decodeInitChunkFrame("\u001eIC0/2/10abc")).toBeUndefined();
  });
});
