// The sign-up conversion reads analytics when it happens (plan step 8f): one
// given mid-visit, after the consent prompt, counts; one withdrawn does not.
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/analytics", () => ({ logEvent: vi.fn() }));
vi.mock("../client-acquisition-funnel/client-acquisition-funnel.js", () => ({ reportAcquisitionSignUp: vi.fn() }));
vi.mock("./client-auth-flow-acquisition.js", () => ({ readAcquisitionParams: () => ({}) }));

const { logEvent } = await import("firebase/analytics");
const { logSignUpConversion } = await import("./client-auth-flow-analytics.js");

describe("logging a sign-up", () => {
  it("logs to analytics only while the player has consented, read at the moment of the event", () => {
    const instance = { app: {} } as never;
    let consented = false;
    const source = () => (consented ? instance : undefined);
    logSignUpConversion(source, "google.com");
    expect(logEvent).not.toHaveBeenCalled();
    consented = true;
    logSignUpConversion(source, "google.com");
    expect(logEvent).toHaveBeenCalledWith(instance, "sign_up", { method: "google.com" });
    consented = false;
    logSignUpConversion(source, "google.com");
    expect(logEvent).toHaveBeenCalledTimes(1);
  });
});
