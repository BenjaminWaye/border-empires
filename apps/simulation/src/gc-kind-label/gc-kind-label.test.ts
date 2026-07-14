import { describe, expect, it } from "vitest";

import { decodeGcKind } from "./gc-kind-label.js";

describe("decodeGcKind", () => {
  it("decodes a single-bit scavenge (minor GC) kind", () => {
    expect(decodeGcKind(1)).toBe("scavenge");
  });

  it("decodes a single-bit mark-sweep-compact (major GC) kind", () => {
    expect(decodeGcKind(2)).toBe("mark_sweep_compact");
  });

  it("decodes incremental marking and weak callbacks", () => {
    expect(decodeGcKind(4)).toBe("incremental_marking");
    expect(decodeGcKind(8)).toBe("weak_callbacks");
  });

  it("joins multiple set bits with +", () => {
    expect(decodeGcKind(1 | 2)).toBe("scavenge+mark_sweep_compact");
  });

  it("returns unknown for undefined, non-finite, zero, or unrecognised values", () => {
    expect(decodeGcKind(undefined)).toBe("unknown");
    expect(decodeGcKind(Number.NaN)).toBe("unknown");
    expect(decodeGcKind(0)).toBe("unknown");
    expect(decodeGcKind(-1)).toBe("unknown");
  });
});
