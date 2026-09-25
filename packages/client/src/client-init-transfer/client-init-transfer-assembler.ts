import { decodeInitChunkFrame } from "@border-empires/shared";
import type { InitTransferProgress } from "../client-socket-types.js";

export type InitChunkPushResult =
  | { kind: "progress"; progress: InitTransferProgress }
  | { kind: "complete"; progress: InitTransferProgress; payload: string }
  | { kind: "invalid" };

export type InitTransferAssembler = {
  push: (frame: string) => InitChunkPushResult;
  reset: () => void;
};

/**
 * Reassembles a chunked INIT (see shared init-transfer.ts). Frames arrive in
 * order on one socket, so anything out of sequence means the transfer was
 * interrupted; it is dropped and the gateway's normal auth retry recovers.
 */
export const createInitTransferAssembler = (): InitTransferAssembler => {
  let parts: string[] = [];
  let receivedChars = 0;
  let expectedCount = 0;
  let expectedTotalChars = 0;

  const reset = (): void => {
    parts = [];
    receivedChars = 0;
    expectedCount = 0;
    expectedTotalChars = 0;
  };

  const push = (frame: string): InitChunkPushResult => {
    const chunk = decodeInitChunkFrame(frame);
    if (!chunk) {
      reset();
      return { kind: "invalid" };
    }
    // A fresh index 0 always starts a new transfer (e.g. a retried AUTH).
    if (chunk.index === 0) reset();
    const continuesTransfer =
      chunk.index === parts.length &&
      (chunk.index === 0 || (chunk.count === expectedCount && chunk.totalChars === expectedTotalChars));
    if (!continuesTransfer) {
      reset();
      return { kind: "invalid" };
    }
    expectedCount = chunk.count;
    expectedTotalChars = chunk.totalChars;
    parts.push(chunk.data);
    receivedChars += chunk.data.length;
    if (parts.length < expectedCount) {
      return { kind: "progress", progress: { phase: "downloading", receivedChars, totalChars: expectedTotalChars } };
    }
    const payload = parts.join("");
    const totalChars = expectedTotalChars;
    reset();
    if (payload.length !== totalChars) return { kind: "invalid" };
    return { kind: "complete", progress: { phase: "building", receivedChars: totalChars, totalChars }, payload };
  };

  return { push, reset };
};
