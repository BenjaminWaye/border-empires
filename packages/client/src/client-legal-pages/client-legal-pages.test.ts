// The legal pages the site serves (packages/client/public) must be finished
// text: a draft's [[PLACEHOLDER]] left in a published page tells players
// nothing and reads as broken. The privacy page must also describe the
// analytics consent the game asks for (plan step 8f).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const page = (name: string): string => readFileSync(fileURLToPath(new URL(`../../public/${name}`, import.meta.url)), "utf8");

describe("published legal pages", () => {
  for (const name of ["privacy.html", "terms.html", "support.html"]) {
    it(`${name} has no unfilled placeholder`, () => {
      expect(page(name)).not.toMatch(/\[\[[A-Z_]+\]\]/);
    });
  }

  it("the published privacy page is the draft in docs/legal-drafts, with its date filled in and the UK representative left out until appointed", () => {
    const draft = readFileSync(fileURLToPath(new URL("../../../../docs/legal-drafts/privacy.html", import.meta.url)), "utf8");
    const published = page("privacy.html");
    const date = /Effective date: ([^<]+)</.exec(published)?.[1] ?? "";
    expect(date).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
    const ukLine = /^ *<p><strong>United Kingdom\.<\/strong>[^\n]*\[\[UK_REPRESENTATIVE\]\][^\n]*\n/m;
    const omitted = "            <!-- The UK GDPR representative (Art. 27) is added here once appointed: docs/legal-drafts/README.md, UK_REPRESENTATIVE. -->\n";
    const expected = draft.replace("[[EFFECTIVE_DATE]]", date).replace(ukLine, omitted);
    // Edit the draft and this copy together (docs/legal-drafts/README.md, "How to publish").
    expect(published).toBe(expected);
  });

  it("the privacy page says analytics run only with consent and how to withdraw it", () => {
    const privacy = page("privacy.html");
    expect(privacy).toContain("only if you consent");
    expect(privacy).toContain("?analytics=ask");
  });
});
