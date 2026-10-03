// Authenticated calls to the gateway's read-only /admin endpoints. The
// gateway accepts the signed-in admin's Firebase ID token as a Bearer token
// (apps/realtime-gateway/src/admin-auth/admin-firebase-auth.ts); getIdToken()
// refreshes it automatically when it's close to expiry.

export type AdminFetchResult =
  | { ok: true; contentType: string; body: string }
  | { ok: false; status: number; message: string };

export type AdminApi = {
  get: (path: string) => Promise<AdminFetchResult>;
};

export const createAdminApi = (gatewayOrigin: string, getIdToken: () => Promise<string | undefined>, fetchImpl: typeof fetch = fetch): AdminApi => ({
  get: async (path) => {
    const token = await getIdToken();
    if (!token) return { ok: false, status: 401, message: "Not signed in." };
    let response: Response;
    try {
      response = await fetchImpl(`${gatewayOrigin}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json, text/plain" },
        credentials: "omit"
      });
    } catch (error) {
      return { ok: false, status: 0, message: `Could not reach the server: ${error instanceof Error ? error.message : String(error)}` };
    }
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, message: "This Google account isn't the game's admin (it must match ADMIN_EMAIL and be verified)." };
    }
    if (!response.ok) return { ok: false, status: response.status, message: `Server returned ${response.status}: ${body.slice(0, 200)}` };
    return { ok: true, contentType: response.headers.get("content-type") ?? "", body };
  }
});
