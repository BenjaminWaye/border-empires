// The few Stripe API calls the hosting service makes, over plain HTTPS.
// No SDK: the calls are simple, and fewer dependencies means less to trust
// in the one service that handles money.
//
// Test mode only for now (plan PR 5). A live key is refused here, and
// assertStripeTestMode asks Stripe itself at boot, so a live key pasted under
// a test-looking name is caught too.

export type StripeFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;

export class StripeApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "StripeApiError";
  }
}

export type StripeApi = {
  get(path: string): Promise<Record<string, unknown>>;
  post(path: string, params: Record<string, string>, idempotencyKey?: string): Promise<Record<string, unknown>>;
};

const STRIPE_API = "https://api.stripe.com/v1";
/** Pinned so a change on Stripe's side cannot alter the shape of what we read. */
export const STRIPE_API_VERSION = "2025-06-30.basil";

/** Rejects keys that are visibly live. The boot check catches the rest. */
export const assertNotLiveKey = (secretKey: string): void => {
  if (/^(sk|rk)_live_/.test(secretKey)) throw new Error("a live Stripe key was given; the hosting service runs in Stripe test mode only");
};

export const createStripeApi = (deps: { secretKey: string; fetchImpl?: StripeFetch }): StripeApi => {
  assertNotLiveKey(deps.secretKey);
  const fetchImpl: StripeFetch = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const call = async (method: string, path: string, body?: string, idempotencyKey?: string): Promise<Record<string, unknown>> => {
    const headers: Record<string, string> = { authorization: `Bearer ${deps.secretKey}`, "stripe-version": STRIPE_API_VERSION };
    if (body !== undefined) headers["content-type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    const response = await fetchImpl(`${STRIPE_API}${path}`, { method, headers, ...(body !== undefined ? { body } : {}) });
    const json = (await response.json()) as Record<string, unknown>;
    if (response.status >= 400) {
      const error = (json.error ?? {}) as { code?: string; message?: string };
      // Stripe's message never contains the key; it is safe to log.
      throw new StripeApiError(response.status, error.code, `Stripe ${method} ${path} failed (${response.status}): ${error.message ?? "unknown error"}`);
    }
    return json;
  };
  return {
    get: (path) => call("GET", path),
    post: (path, params, idempotencyKey) => call("POST", path, new URLSearchParams(params).toString(), idempotencyKey)
  };
};

/** Asks Stripe whether this key is a live one. Call once at boot. */
export const assertStripeTestMode = async (api: StripeApi): Promise<void> => {
  const balance = await api.get("/balance");
  if (balance.livemode !== false) throw new Error("the Stripe key is a live-mode key; the hosting service runs in Stripe test mode only");
};
