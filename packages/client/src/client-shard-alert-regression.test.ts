import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const sourceFor = (name: string): string => readFileSync(resolve(here, name), "utf8");

describe("shard rain alert regression guard", () => {
  it("renders a dedicated shard alert and clears shard fx on dismiss", () => {
    const bootstrapSource = sourceFor("./client-bootstrap-render.ts");
    expect(bootstrapSource).toContain("renderShardAlertFromModule");

    const controlsSource = sourceFor("./client-ui-controls.ts");
    expect(controlsSource).toContain("shardAlertCloseBtn.onclick = () => {");

    const captureEffectsSource = sourceFor("./client-capture-effects.ts");
    expect(captureEffectsSource).toContain("export const renderShardAlert = (");
    expect(captureEffectsSource).toContain("state.shardRainFxUntil = 0;");
  });

  it("stops using feed messages as the primary shard rain alert path", () => {
    const alertsSource = sourceFor("./client-alerts.ts");
    expect(alertsSource).not.toContain("Shard rain sighted at");
    expect(alertsSource).not.toContain("Shard rain has begun. ${siteCount}");
  });
});
