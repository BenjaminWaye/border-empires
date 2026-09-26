import { MAX_DIGEST } from "./galaxy-duke-config.js";
import type { DigestEntry, DigestKind, DukeCounter, DukeState } from "./galaxy-duke-types.js";

// Appends to the bounded digest ring. Returns which counters fired so the
// caller can emit them: a cap that evicts silently would hide a leak.
export const pushDigest = (
  state: DukeState,
  at: number,
  kind: DigestKind,
  text: string
): { state: DukeState; counters: DukeCounter[] } => {
  const entry: DigestEntry = { at, kind, text };
  const digest = [...state.digest, entry];
  const counters: DukeCounter[] = [];
  while (digest.length > MAX_DIGEST) {
    digest.shift();
    counters.push("duke_digest_evicted");
  }
  return { state: { ...state, digest }, counters };
};
