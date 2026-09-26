import { decodeInitChunkFrame, INIT_CHUNKING_MIN_CHARS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { sendInitPayload } from "./login-progress-stages.js";

const captureSocket = (): { sent: string[]; send: (data: string) => void } => {
  const sent: string[] = [];
  return { sent, send: (data) => sent.push(data) };
};

const largeInitJson = (): string =>
  JSON.stringify({ type: "INIT", padding: "x".repeat(INIT_CHUNKING_MIN_CHARS * 3) });

describe("sendInitPayload", () => {
  it("sends a single frame to clients that did not advertise chunking", () => {
    const socket = captureSocket();
    const initJson = largeInitJson();
    expect(sendInitPayload(socket, initJson, false)).toBe(1);
    expect(socket.sent).toEqual([initJson]);
  });

  it("sends small payloads as a single frame even when chunking is supported", () => {
    const socket = captureSocket();
    const initJson = JSON.stringify({ type: "INIT" });
    expect(sendInitPayload(socket, initJson, true)).toBe(1);
    expect(socket.sent).toEqual([initJson]);
  });

  it("chunks large payloads for clients that advertised chunking", () => {
    const socket = captureSocket();
    const initJson = largeInitJson();
    const frameCount = sendInitPayload(socket, initJson, true);
    expect(frameCount).toBeGreaterThan(1);
    expect(socket.sent).toHaveLength(frameCount);
    const decoded = socket.sent.map((frame) => decodeInitChunkFrame(frame));
    expect(decoded.every((frame) => frame?.totalChars === initJson.length && frame.count === frameCount)).toBe(true);
    expect(decoded.map((frame) => frame?.data ?? "").join("")).toBe(initJson);
  });
});
