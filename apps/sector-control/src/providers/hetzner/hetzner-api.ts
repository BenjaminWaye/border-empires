// The few Hetzner Cloud API calls the hosting service makes, over plain HTTPS.
// The token belongs to a Hetzner project that holds only hosted sectors, so
// nothing done here can touch the staging or production servers.
export type HetznerFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;

export class HetznerApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "HetznerApiError";
  }
}

export type HetznerApi = {
  request(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<Record<string, unknown>>;
};

const HETZNER_API = "https://api.hetzner.cloud/v1";

export const createHetznerApi = (deps: { token: string; fetchImpl?: HetznerFetch }): HetznerApi => {
  const fetchImpl: HetznerFetch = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    async request(method, path, body) {
      const headers: Record<string, string> = { authorization: `Bearer ${deps.token}` };
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetchImpl(`${HETZNER_API}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      // A DELETE answers 204 with no body.
      const json = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>);
      if (response.status >= 400) {
        const error = (json.error ?? {}) as { code?: string; message?: string };
        throw new HetznerApiError(response.status, error.code, `Hetzner ${method} ${path} failed (${response.status}): ${error.message ?? "unknown error"}`);
      }
      return json;
    }
  };
};

export const isNotFound = (error: unknown): boolean => error instanceof HetznerApiError && (error.status === 404 || error.code === "not_found");
export const isConflict = (error: unknown): boolean => error instanceof HetznerApiError && (error.status === 409 || error.code === "uniqueness_error");
