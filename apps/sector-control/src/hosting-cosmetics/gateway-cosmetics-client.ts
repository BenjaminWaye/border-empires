// The game gateway's purchase routes for cosmetics
// (apps/realtime-gateway/src/account-cosmetics/account-cosmetics-purchase-routes.ts),
// called with the hosting service key HOSTING_SERVICE_TOKEN, never ADMIN_API_TOKEN.
export type GatewayCosmeticsClient = {
  /** Whether the account behind the uid owns the product already. */
  owned(uid: string, productId: string): Promise<boolean>;
  /** Idempotent. Throws when the gateway refuses or cannot be reached; "no_player" when the account has never entered the game. */
  grant(uid: string, productId: string, grantRef: string): Promise<void>;
  /** Takes every cosmetic of the product back. Idempotent. */
  revoke(uid: string, productId: string): Promise<void>;
};

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class GatewayCosmeticsError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`the gateway answered ${status}${code ? ` (${code})` : ""}`);
  }
}

export const createGatewayCosmeticsClient = (options: { gatewayUrl: string; token: string; fetch?: FetchLike }): GatewayCosmeticsClient => {
  const post: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const base = options.gatewayUrl.replace(/\/+$/, "");
  const call = async (path: string, body: Record<string, string>): Promise<Record<string, unknown>> => {
    const response = await post(`${base}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    });
    const reply = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || reply.ok !== true) throw new GatewayCosmeticsError(response.status, typeof reply.error === "string" ? reply.error : "");
    return reply;
  };
  return {
    async owned(uid, productId) {
      return (await call("/admin/cosmetics/purchase-status", { uid, productId })).owned === true;
    },
    async grant(uid, productId, grantRef) {
      await call("/admin/cosmetics/purchase-grant", { uid, productId, grantRef });
    },
    async revoke(uid, productId) {
      await call("/admin/cosmetics/purchase-revoke", { uid, productId });
    }
  };
};
