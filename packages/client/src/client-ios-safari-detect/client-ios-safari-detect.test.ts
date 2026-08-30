import { describe, expect, it } from "vitest";
import { isIOSSafari } from "./client-ios-safari-detect.js";

const IPHONE_SAFARI_26 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1";

// Chrome on iOS is required by Apple to embed WebKit, so it inherits the same
// per-tab memory ceiling as Safari despite the different browser chrome.
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";

const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("isIOSSafari", () => {
  it("matches an iPhone running Safari", () => {
    expect(isIOSSafari(IPHONE_SAFARI_26)).toBe(true);
  });

  it("matches an iPhone running Chrome, since it's still WebKit under the hood", () => {
    expect(isIOSSafari(IPHONE_CHROME)).toBe(true);
  });

  it("does not match Android", () => {
    expect(isIOSSafari(ANDROID_CHROME)).toBe(false);
  });

  it("does not match desktop Safari", () => {
    expect(isIOSSafari(DESKTOP_SAFARI)).toBe(false);
  });

  it("does not match an empty or malformed user agent", () => {
    expect(isIOSSafari("")).toBe(false);
  });
});
