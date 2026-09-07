// Admin auth for the read-only /admin/* diagnostic endpoints
// (/admin/runtime/metrics, /admin/runtime/dashboard, /admin/players,
// /admin/debug/ai*). Two independent ways in, either is sufficient:
//
//   1. The static ADMIN_API_TOKEN (Fly secret) as a Bearer header or
//      ?token= query param — unchanged from before.
//   2. A GitHub token (personal access token or OAuth token) proving the
//      caller has at least read access to this repo, passed via the
//      X-Admin-Github-Token header.
//
// (2) exists because most developers/agents working on this repo run in
// fresh, ephemeral sandboxes with no durable place to receive a
// provisioned secret, but they already have a GitHub token to clone/push
// this same repo — so that token doubles as an identity proof for the
// read-only debug endpoints, with nothing extra to distribute or rotate.
// Destructive endpoints (/admin/season/start-next, /admin/barbarians/seed)
// intentionally do NOT accept this path — they stay on the static token.
export type AdminGithubAuthConfig = {
  repoOwner: string;
  repoName: string;
};

// This repo, so the GitHub-identity path works out of the box with no
// per-deployment config — override only if this app is ever deployed for a
// fork under a different owner/name.
export const DEFAULT_ADMIN_GITHUB_REPO: AdminGithubAuthConfig = {
  repoOwner: "BenjaminWaye",
  repoName: "border-empires"
};

type GithubAccessCacheEntry = { allowed: boolean; expiresAt: number };

const GITHUB_ACCESS_CACHE_MAX_ENTRIES = 200;
const GITHUB_ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;
const GITHUB_API_USER_AGENT = "border-empires-admin-auth";

export const createGithubAdminAccessChecker = (
  config: AdminGithubAuthConfig,
  fetchImpl: typeof fetch = fetch
): ((token: string) => Promise<boolean>) => {
  const cache = new Map<string, GithubAccessCacheEntry>();

  const rememberResult = (token: string, allowed: boolean, now: number): boolean => {
    if (cache.size >= GITHUB_ACCESS_CACHE_MAX_ENTRIES && !cache.has(token)) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(token, { allowed, expiresAt: now + GITHUB_ACCESS_CACHE_TTL_MS });
    return allowed;
  };

  return async (token: string): Promise<boolean> => {
    const now = Date.now();
    const cached = cache.get(token);
    if (cached && cached.expiresAt > now) return cached.allowed;

    try {
      const authHeaders = { Authorization: `Bearer ${token}`, "User-Agent": GITHUB_API_USER_AGENT };
      const userResponse = await fetchImpl("https://api.github.com/user", { headers: authHeaders });
      if (!userResponse.ok) return rememberResult(token, false, now);
      const user = (await userResponse.json()) as { login?: string };
      if (!user.login) return rememberResult(token, false, now);

      const permissionResponse = await fetchImpl(
        `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/collaborators/${user.login}/permission`,
        { headers: authHeaders }
      );
      if (!permissionResponse.ok) return rememberResult(token, false, now);
      const body = (await permissionResponse.json()) as { permission?: string };
      const allowed = body.permission === "admin" || body.permission === "write" || body.permission === "read";
      return rememberResult(token, allowed, now);
    } catch {
      return rememberResult(token, false, now);
    }
  };
};

export type AdminHttpRequest = { headers: Record<string, unknown>; query?: unknown };

export type CreateAdminAuthorizerDeps = {
  adminApiToken?: string;
  githubAuth?: AdminGithubAuthConfig;
  fetchImpl?: typeof fetch;
};

export type AdminAuthorizer = {
  // Static-token-only check, for destructive endpoints that must not accept
  // the GitHub-identity path.
  adminAuthorized: (authorizationHeader: string | undefined) => boolean;
  // Full check (static token, ?token=, or GitHub identity), for read-only
  // diagnostic endpoints.
  adminRequestAuthorized: (request: AdminHttpRequest) => Promise<boolean>;
};

export const createAdminAuthorizer = (deps: CreateAdminAuthorizerDeps): AdminAuthorizer => {
  const checkGithubAccess = deps.githubAuth
    ? createGithubAdminAccessChecker(deps.githubAuth, deps.fetchImpl ?? fetch)
    : undefined;

  const adminAuthorized = (authorizationHeader: string | undefined): boolean => {
    if (!deps.adminApiToken) return false;
    return authorizationHeader === `Bearer ${deps.adminApiToken}`;
  };

  const adminRequestAuthorized = async (request: AdminHttpRequest): Promise<boolean> => {
    const headerAuth = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
    if (adminAuthorized(headerAuth)) return true;

    const queryToken = (request.query as { token?: string } | undefined)?.token;
    if (Boolean(deps.adminApiToken) && queryToken === deps.adminApiToken) return true;

    if (checkGithubAccess) {
      const githubToken = request.headers["x-admin-github-token"];
      if (typeof githubToken === "string" && githubToken.length > 0 && (await checkGithubAccess(githubToken))) {
        return true;
      }
    }

    return false;
  };

  return { adminAuthorized, adminRequestAuthorized };
};
