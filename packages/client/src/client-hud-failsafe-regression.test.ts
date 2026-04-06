import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client HUD failsafe regression", () => {
  it("logs and falls back instead of blanking the entire HUD on panel render errors", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(hudSource).toContain("[hud-render-error]");
    expect(hudSource).toContain("fallbackCard");
    expect(hudSource).toContain('"leaderboardHtml"');
    expect(hudSource).toContain('"renderDomainProgressCard"');
  });

  it("keeps a fatal HUD render catch in bootstrap", () => {
    const bootstrapSource = readFileSync(new URL("./client-bootstrap-render.ts", import.meta.url), "utf8");

    expect(bootstrapSource).toContain("[hud-render-fatal]");
    expect(bootstrapSource).toContain("ctx.syncAuthOverlay();");
  });
});
