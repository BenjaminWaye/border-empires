// A recording stand-in for Stripe's HTTP API, for the Stripe provider tests.
import type { StripeFetch } from "./stripe-api.js";

export type RecordedStripeCall = { method: string; path: string; params: Record<string, string>; headers: Record<string, string> };

export const fakeStripeFetch = (respond: (call: RecordedStripeCall) => { status?: number; body: Record<string, unknown> }) => {
  const calls: RecordedStripeCall[] = [];
  const fetchImpl: StripeFetch = async (url, init) => {
    const call = {
      method: init.method,
      path: url.replace("https://api.stripe.com/v1", ""),
      params: Object.fromEntries(new URLSearchParams(init.body ?? "")),
      headers: init.headers
    };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return { status, json: async () => body };
  };
  return { calls, fetchImpl };
};
