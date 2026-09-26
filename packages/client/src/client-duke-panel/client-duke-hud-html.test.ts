import { describe, expect, it } from "vitest";
import { dukeHudHtml } from "./client-duke-hud-html.js";
import { NOW, dukeStatus, dukeSystem } from "./client-duke-fixtures.js";

describe("dukeHudHtml", () => {
  it("leads with what needs the player, as buttons that name their system", () => {
    const html = dukeHudHtml(dukeStatus(), NOW);
    expect(html).toContain("Craft arriving at Aurelia in 2d. No Fighter there.");
    expect(html).toContain('data-duke-attention="INCURSION_UNDEFENDED" data-season-id="s1"');
    expect(html).toContain("dk-attn-urgent");
    expect(html.indexOf("Craft arriving")).toBeLessThan(html.indexOf("Stability"));
  });
  it("shows the three meters with plain-language tooltips", () => {
    const html = dukeHudHtml(dukeStatus(), NOW);
    expect(html).toContain("4 more hits before contested");
    expect(html).toContain("#1 of 2 Dukes");
    expect(html).toContain("280 / 300");
    expect(html).toMatch(/title="Court Strength is the Court&#39;s grip/);
    expect(html).toMatch(/title="Domain Weight is your score for the throne/);
    expect(html).toMatch(/title="Stability is how firmly you hold a Sector/);
  });
  it("says all quiet when nothing needs attention", () => {
    expect(dukeHudHtml(dukeStatus({ attention: [] }), NOW)).toContain("All quiet. Tap your planet to build.");
  });
  it("caps the list and counts the rest", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ kind: "SLOT_EMPTY" as const, severity: "NOTICE" as const, seasonId: `s${i}`, label: `P${i}`, at: null }));
    const html = dukeHudHtml(dukeStatus({ attention: many }), NOW);
    expect(html.match(/data-duke-attention=/g)).toHaveLength(4);
    expect(html).toContain("+3 more");
  });
  it("shows the lowest Stability across systems, and the fallen Court", () => {
    const html = dukeHudHtml(dukeStatus({ systems: [dukeSystem({ stability: 90 }), dukeSystem({ seasonId: "s2", stability: 40, hitsRemaining: 2 })], court: { ...dukeStatus().court, fallen: true, current: 0 } }), NOW);
    expect(html).toContain("2 more hits before contested");
    expect(html).toContain("The Court has fallen");
  });
  it("escapes every player-derived string", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const html = dukeHudHtml(dukeStatus({ attention: [{ kind: "SLOT_EMPTY", severity: "NOTICE", seasonId: evil, label: evil, at: null }] }), NOW);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("copes with no system held", () => {
    expect(dukeHudHtml(dukeStatus({ systems: [], attention: [] }), NOW)).toContain("no Sector held");
  });
});

describe("attention ordering is the server's; the HUD keeps it", () => {
  it("renders items in the order given", () => {
    const html = dukeHudHtml(dukeStatus(), NOW);
    expect(html.indexOf("INCURSION_UNDEFENDED")).toBeLessThan(html.indexOf("SLOT_EMPTY"));
  });
});
