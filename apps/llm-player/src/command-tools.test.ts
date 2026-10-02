import { describe, expect, it } from "vitest";
import { botActionFromToolUse, COMMAND_TOOLS } from "./command-tools.js";

describe("COMMAND_TOOLS", () => {
  it("has unique names and stays well under the tool-count ceiling research says degrades selection", () => {
    const names = COMMAND_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeLessThanOrEqual(12);
    expect(names).toContain("choose_domain");
  });
});

describe("botActionFromToolUse choose_domain", () => {
  it("maps a domain id to CHOOSE_DOMAIN", () => {
    expect(botActionFromToolUse("choose_domain", { domainId: "frontier-doctrine" })).toEqual({
      type: "CHOOSE_DOMAIN",
      domainId: "frontier-doctrine"
    });
  });

  it("rejects a missing, empty or non-string domain id", () => {
    expect(botActionFromToolUse("choose_domain", {})).toBeUndefined();
    expect(botActionFromToolUse("choose_domain", { domainId: "" })).toBeUndefined();
    expect(botActionFromToolUse("choose_domain", { domainId: 3 })).toBeUndefined();
  });
});
