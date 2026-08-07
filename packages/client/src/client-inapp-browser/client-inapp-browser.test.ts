import { describe, expect, it } from "vitest";
import {
  detectInAppBrowserName,
  inAppBrowserGoogleSignInMessage,
  isMissingInitialStateError,
  MISSING_INITIAL_STATE_MESSAGE
} from "./client-inapp-browser.js";

describe("detectInAppBrowserName", () => {
  it("detects Facebook Messenger's in-app WebView", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 [FBAN/MessengerForiOS;FBAV/400.0.0.0]";
    expect(detectInAppBrowserName(ua)).toBe("Facebook Messenger");
  });

  it("detects Instagram's in-app WebView", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Instagram 275.0.0.0";
    expect(detectInAppBrowserName(ua)).toBe("Instagram");
  });

  it("returns undefined for a regular Chrome browser", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36";
    expect(detectInAppBrowserName(ua)).toBeUndefined();
  });
});

describe("inAppBrowserGoogleSignInMessage", () => {
  it("names the detected app and suggests opening in the system browser", () => {
    const message = inAppBrowserGoogleSignInMessage("Facebook Messenger");
    expect(message).toContain("Facebook Messenger");
    expect(message).toContain("Open in Chrome");
  });
});

describe("isMissingInitialStateError / MISSING_INITIAL_STATE_MESSAGE", () => {
  it("matches Firebase's missing initial state error text", () => {
    expect(isMissingInitialStateError("Unable to process request due to missing initial state.")).toBe(true);
    expect(isMissingInitialStateError("Some other error")).toBe(false);
  });

  it("provides a friendly fallback message", () => {
    expect(MISSING_INITIAL_STATE_MESSAGE).toContain("in-app browser");
  });
});
