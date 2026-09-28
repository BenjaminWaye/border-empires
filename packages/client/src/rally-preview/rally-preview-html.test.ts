import { describe, expect, it } from "vitest";

import { buildRallyPreviewHead, injectRallyPreview, rallyPreviewCopy } from "./rally-preview-html.js";

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Border Empires</title>
  </head>
  <body><div id="game-surface"></div></body>
</html>`;

describe("rally preview html", () => {
  it("names the inviter in the card title and description", () => {
    const copy = rallyPreviewCopy("Sam");
    expect(copy.title).toBe("Sam needs you in Border Empires");
    expect(copy.description).toContain("Sam");
  });

  it("falls back to generic copy when the inviter is unknown or blank", () => {
    expect(rallyPreviewCopy(undefined).title).toBe("Border Empires");
    expect(rallyPreviewCopy("   \n ").title).toBe("Border Empires");
  });

  it("escapes a hostile display name so it cannot break out of an attribute or the title", () => {
    const head = buildRallyPreviewHead({ origin: "https://play.example.test", code: "r_abc", ownerName: `"><script>alert(1)</script>` });
    expect(head).not.toContain("<script>");
    expect(head).not.toContain(`"><`);
    expect(head).toContain("&lt;script&gt;");
  });

  it("caps very long names", () => {
    const { title } = rallyPreviewCopy("x".repeat(500));
    expect(title.length).toBeLessThan(80);
  });

  it("emits absolute og:image/og:url and a large twitter card", () => {
    const head = buildRallyPreviewHead({ origin: "https://play.example.test/", code: "r_a-b_c", ownerName: "Sam" });
    expect(head).toContain('content="https://play.example.test/og/rally-preview.png"');
    expect(head).toContain('property="og:url" content="https://play.example.test/r/r_a-b_c"');
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("swaps the shell title, adds tags inside <head>, and leaves the rest of the shell intact", () => {
    const out = injectRallyPreview(SHELL, { origin: "https://play.example.test", code: "r_abc", ownerName: "Sam" });
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out).toContain("<title>Sam needs you in Border Empires</title>");
    expect(out.indexOf('property="og:title"')).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain('<div id="game-surface"></div>');
    expect(out).toContain('<meta charset="UTF-8" />');
  });

  it("returns the shell unchanged when it has no </head>", () => {
    expect(injectRallyPreview("<html><body>x</body></html>", { origin: "https://o", code: "c" })).toBe("<html><body>x</body></html>");
  });
});
