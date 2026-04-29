import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("server respawn incident regression", () => {
  it("records explicit incident breadcrumbs for elimination and startup bootstrap respawns", () => {
    const source = serverMainSource();
    expect(source).toContain('runtimeIncidentLog.record("player_elimination_resolved", {');
    expect(source).toContain('runtimeIncidentLog.record("startup_player_bootstrap_respawn", {');
    expect(source).toContain('recordPlayerLifecycleEvent: (event, payload) => runtimeIncidentLog.record(event, payload),');
  });
});
