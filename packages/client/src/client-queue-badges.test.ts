import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { queuedCornerBadgeLayout } from "./client-queue-badges.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("queued corner badge layout", () => {
  it("keeps the settlement queue ordinal badge visible in true 3d mode", () => {
    const layout = queuedCornerBadgeLayout({
      kind: "SETTLEMENT",
      ordinal: 2,
      px: 100,
      py: 200,
      size: 24,
      isTrue3D: true,
      blocked: false
    });

    expect(layout?.border).toBeUndefined();
    expect(layout?.badge).toEqual({
      background: "rgba(49, 31, 4, 0.92)",
      foreground: "#fbbf24",
      text: "2",
      x: 107,
      y: 203,
      width: 14,
      height: 12,
      textX: 109,
      textY: 204
    });
  });

  it("keeps the legacy border in 2d mode", () => {
    const layout = queuedCornerBadgeLayout({
      kind: "BUILD",
      ordinal: 11,
      px: 10,
      py: 20,
      size: 26,
      isTrue3D: false,
      blocked: false
    });

    expect(layout?.border).toEqual({
      strokeStyle: "rgba(122, 214, 255, 0.95)",
      x: 12,
      y: 22,
      width: 21,
      height: 21
    });
    expect(layout?.badge?.text).toBe("11");
    expect(layout?.badge?.width).toBe(18);
  });

  it("routes queued settlement numbers through the shared badge helper in the runtime loop", () => {
    const source = clientSource("./client-runtime-loop.ts");
    expect(source).toContain('const queuedSettlementBadge = queuedCornerBadgeLayout({');
    expect(source).toContain("isTrue3D: isTrue3DRendererActive()");
    expect(source).not.toContain("!isTrue3DRendererActive() && queuedSettlementN !== undefined && !settlementProgress");
  });
});
