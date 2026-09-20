import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: the 2D-canvas aether-wall-edge and aether-bridge-lane
// draws in client-runtime-loop.ts used to run unconditionally every frame,
// gated only internally on secondary details (pylon/anchor glyphs) via
// isTrue3DRendererActive(). That left the flat 2D lane/edge itself drawn on
// top of the true-3D renderer's own native pylon overlays, so a bridge/wall
// effect appeared to "stay" visible in 3D mode even after it ended, because
// the 2D draw call kept repainting it on a canvas the 3D renderer doesn't
// manage. Both draws must be skipped entirely when the true-3D renderer is
// active, matching the drawMusterSupplyLines2D gating right above them.
const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

// Brace-depth walk from the nearest preceding `if (!isTrue3DRendererActive())`
// guard line down to the line where that guard's own block closes. Returns
// the line index the guard block closes on, or -1 if none precedes.
const findEnclosingGuardCloseLine = (lines: string[], targetLineIndex: number): number => {
  let guardLine = -1;
  for (let i = targetLineIndex; i >= 0; i -= 1) {
    if (lines[i]!.includes("if (!isTrue3DRendererActive())")) {
      guardLine = i;
      break;
    }
  }
  if (guardLine === -1) return -1;

  let depth = 0;
  for (let i = guardLine; i < lines.length; i += 1) {
    for (const ch of lines[i]!) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
    }
    if (i > guardLine && depth <= 0) return i;
  }
  return -1;
};

describe("2D aether wall/bridge renderer-parity gate regression guard", () => {
  it("keeps the aether wall edge and aether bridge lane draws inside an isTrue3DRendererActive() guard block", () => {
    const source = clientSource("./client-runtime-loop.ts");
    const lines = source.split("\n");

    const wallLoopLine = lines.findIndex((line) => line.includes("state.activeAetherWalls.filter"));
    const bridgeLoopLine = lines.findIndex((line) => line.includes("state.activeAetherBridges.filter"));
    expect(wallLoopLine).toBeGreaterThan(-1);
    expect(bridgeLoopLine).toBeGreaterThan(-1);

    const wallGuardCloseLine = findEnclosingGuardCloseLine(lines, wallLoopLine);
    const bridgeGuardCloseLine = findEnclosingGuardCloseLine(lines, bridgeLoopLine);

    expect(wallGuardCloseLine).toBeGreaterThan(wallLoopLine);
    expect(bridgeGuardCloseLine).toBeGreaterThan(bridgeLoopLine);
  });
});
