// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAcquisitionParams } from "./client-auth-flow-acquisition.js";

describe("readAcquisitionParams", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads utm_* params from the URL and document.referrer", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      search: "?utm_source=reddit&utm_medium=social&utm_campaign=launch"
    } as unknown as Location);
    vi.spyOn(document, "referrer", "get").mockReturnValue("https://www.reddit.com/r/games/");

    expect(readAcquisitionParams()).toEqual({
      source: "reddit",
      medium: "social",
      campaign: "launch",
      referrer: "https://www.reddit.com/r/games/"
    });
  });

  it("omits fields that are absent instead of sending empty strings", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({ search: "" } as unknown as Location);
    vi.spyOn(document, "referrer", "get").mockReturnValue("");

    expect(readAcquisitionParams()).toEqual({});
  });
});
