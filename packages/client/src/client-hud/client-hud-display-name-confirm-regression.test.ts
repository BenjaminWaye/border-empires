import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Renames are throttled to once per season server-side (see gateway-app.ts
// SET_PROFILE / DISPLAY_NAME_LIMIT), so the Settings "Update" button warns
// the player up front instead of only letting them discover the limit via a
// rejection after the fact. The prompt must be skipped for the player's
// initial name pick (state.meName still empty) and for a no-op resubmit of
// the same name — only an actual rename should be gated.
describe("client HUD display-name rename confirmation regression", () => {
  it("confirms with the player before sending an actual name/colour change", () => {
    // Moved out of client-hud.ts's inline settings-panel bindings into the
    // standalone "Edit Name & Colour" overlay (client-hud-profile-edit-overlay.ts)
    // as part of the settings redesign; the throttle-warning behavior itself
    // is unchanged, just now combined across both fields in one dialog.
    const overlaySource = readFileSync(new URL("./client-hud-profile-edit-overlay.ts", import.meta.url), "utf8");

    const saveHandlerStart = overlaySource.indexOf("saveBtn.onclick = async ()");
    const saveHandlerEnd = overlaySource.indexOf("close();", saveHandlerStart);
    const saveHandlerSource = overlaySource.slice(saveHandlerStart, saveHandlerEnd);

    expect(saveHandlerSource).toContain("const nameChanged = newName !== state.meName;");
    expect(saveHandlerSource).toContain('if (typeof window !== "undefined" && typeof window.confirm === "function") {');
    expect(saveHandlerSource).toContain("window.confirm(");
    expect(saveHandlerSource).toContain("once per season");
    expect(saveHandlerSource).toContain("if (!confirmed) return;");
  });
});
