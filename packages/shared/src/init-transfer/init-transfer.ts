// Chunked INIT transfer framing.
//
// The gateway's INIT message is one large JSON document (hundreds of KB for
// a big empire). Sent as a single WebSocket frame, the browser only fires a
// "message" event once the whole thing has arrived, so the login overlay has
// nothing to show while a phone downloads it over mobile data. Clients that
// advertise `initChunking: true` in AUTH instead receive the serialized INIT
// split into raw text frames of the form
//
//   "\u001eIC<index>/<count>/<totalChars>|<data>"
//
// which the client reassembles (reporting progress per frame) before handing
// the joined JSON to the normal message handler. The record-separator prefix
// can never start a JSON document, so these frames are unambiguous. Raw text
// is used instead of a JSON envelope so the payload isn't re-escaped.

export const INIT_CHUNK_FRAME_PREFIX = "\u001eIC";
/** Payloads at or below this size are sent as a single normal frame. */
export const INIT_CHUNKING_MIN_CHARS = 64 * 1024;
export const INIT_CHUNK_TARGET_CHARS = 32 * 1024;

export type InitChunkFrame = {
  index: number;
  count: number;
  totalChars: number;
  data: string;
};

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/**
 * Splits a serialized INIT payload into chunk frames. Cut points never fall
 * between the two halves of a surrogate pair: a lone surrogate would be
 * replaced with U+FFFD when the frame is UTF-8 encoded, corrupting the JSON.
 */
export const encodeInitChunkFrames = (payload: string, targetChars = INIT_CHUNK_TARGET_CHARS): string[] => {
  const size = Math.max(2, Math.floor(targetChars));
  const pieces: string[] = [];
  let start = 0;
  while (start < payload.length) {
    let end = Math.min(payload.length, start + size);
    if (end < payload.length && isHighSurrogate(payload.charCodeAt(end - 1))) end -= 1;
    pieces.push(payload.slice(start, end));
    start = end;
  }
  const count = pieces.length;
  return pieces.map((data, index) => `${INIT_CHUNK_FRAME_PREFIX}${index}/${count}/${payload.length}|${data}`);
};

export const isInitChunkFrame = (frame: string): boolean => frame.startsWith(INIT_CHUNK_FRAME_PREFIX);

/** Parses a chunk frame; returns undefined for anything malformed. */
export const decodeInitChunkFrame = (frame: string): InitChunkFrame | undefined => {
  if (!isInitChunkFrame(frame)) return undefined;
  const headerEnd = frame.indexOf("|", INIT_CHUNK_FRAME_PREFIX.length);
  if (headerEnd < 0) return undefined;
  const parts = frame.slice(INIT_CHUNK_FRAME_PREFIX.length, headerEnd).split("/");
  if (parts.length !== 3) return undefined;
  const [index, count, totalChars] = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN)) as [number, number, number];
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || !Number.isSafeInteger(totalChars)) return undefined;
  if (count < 1 || index >= count) return undefined;
  return { index, count, totalChars, data: frame.slice(headerEnd + 1) };
};
