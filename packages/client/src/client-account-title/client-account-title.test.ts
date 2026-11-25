import { describe, expect, it } from "vitest";

import { titledNameHtml } from "./client-account-title.js";

describe("titledNameHtml", () => {
  it("puts a known title before the name", () => {
    expect(titledNameHtml("Varn", "Count")).toBe('<span class="account-title">Count</span> Varn');
  });

  it("draws nothing for no title or an unknown one", () => {
    expect(titledNameHtml("Varn", undefined)).toBe("Varn");
    expect(titledNameHtml("Varn", "<b>Emperor</b>")).toBe("Varn");
  });
});
