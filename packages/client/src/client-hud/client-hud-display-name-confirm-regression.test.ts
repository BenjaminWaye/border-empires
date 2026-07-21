import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Renames are throttled to once per season server-side (see gateway-app.ts
// SET_PROFILE / DISPLAY_NAME_LIMIT), so the Settings "Update" button warns
// the player up front instead of only letting them discover the limit via a
// rejection after the fact. The prompt must be skipped for the player's
// initial name pick (state.meName still empty) and for a no-op resubmit of
// the same name — only an actual rename should be gated.
describe("client HUD display-name rename confirmation regression", () => {
  it("confirms with the player before sending an actual display-name change", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    const clickHandlerStart = hudSource.indexOf("const settingsUpdateNameButtons");
    const clickHandlerEnd = hudSource.indexOf("const mapRevealButtons");
    const clickHandlerSource = hudSource.slice(clickHandlerStart, clickHandlerEnd);

    expect(clickHandlerSource).toContain("const trimmedNewName = input.value.trim();");
    expect(clickHandlerSource).toContain('if (state.meName && trimmedNewName !== state.meName && typeof window !== "undefined" && typeof window.confirm === "function") {');
    expect(clickHandlerSource).toContain("window.confirm(");
    expect(clickHandlerSource).toContain("once per season");
    expect(clickHandlerSource).toContain("if (!confirmed) return;");
  });
});
