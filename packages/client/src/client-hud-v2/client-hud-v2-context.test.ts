// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { writeHtml } from "./client-hud-v2-context.js";

describe("writeHtml", () => {
  // The profile repaints on every score tick; an opened "How rating works" must stay open.
  it("keeps an opened details[data-v2-open] explainer open across a repaint", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const html = (score: number): string => `<p>${score}</p><details data-v2-open="rating"><summary>?</summary>Body</details>`;
    writeHtml("host", html(1));
    document.querySelector<HTMLDetailsElement>("#host details")!.open = true;

    writeHtml("host", html(2));

    expect(document.querySelector("#host p")?.textContent).toBe("2");
    expect(document.querySelector<HTMLDetailsElement>("#host details")?.open).toBe(true);
  });

  it("leaves a closed explainer closed", () => {
    document.body.innerHTML = `<div id="host2"></div>`;
    writeHtml("host2", `<details data-v2-open="rating"><summary>?</summary>a</details>`);
    writeHtml("host2", `<details data-v2-open="rating"><summary>?</summary>b</details>`);
    expect(document.querySelector<HTMLDetailsElement>("#host2 details")?.open).toBe(false);
  });
});
