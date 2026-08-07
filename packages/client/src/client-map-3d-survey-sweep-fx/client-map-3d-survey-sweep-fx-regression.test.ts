import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d survey sweep fx regression guard", () => {
  it("keeps the one-shot survey scan phases and parts", () => {
    const source = clientSource("./client-map-3d-survey-sweep-fx.ts");
    expect(source).toContain("LOCK_END_MS");
    expect(source).toContain("SWEEP_END_MS");
    expect(source).toContain("RESOLVE_END_MS");
    expect(source).toContain("sweepBeamA");
    expect(source).toContain("waveA");
    expect(source).toContain("SurveyMarker");
  });

  it("queues survey sweep fx only after the command send path accepts the cast", () => {
    const source = clientSource("../client-action-flow.ts");
    expect(source).toContain('sendGameMessage({ type: "SURVEY_SWEEP"');
    expect(source).toContain("state.surveySweepFxQueue.push");
  });

  it("renders coarse hidden-intel pings without resource-specific badge kinds", () => {
    const overlaySource = clientSource("../client-map-3d-survey-sweep-ping-overlay.ts");
    const networkSource = clientSource("../client-network/client-network.ts");
    const codecSource = clientSource("../client-network/client-network-codec.ts");
    expect(overlaySource).toContain('kind === "resource"');
    expect(overlaySource).toContain("townMesh");
    expect(codecSource).toContain('value === "resource" || value === "town"');
    expect(networkSource).toContain("state.surveySweepPings.push");
    expect(overlaySource).not.toContain('"GEMS"');
    expect(overlaySource).not.toContain('"IRON"');
    expect(overlaySource).not.toContain('"WOOD"');
  });
});
