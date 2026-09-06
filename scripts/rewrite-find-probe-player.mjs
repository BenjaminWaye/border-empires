// The prod-shape gate's frontier smoke/soak need to act as a player who
// actually owns territory, so they can find a legal EXPAND/ATTACK
// candidate. The hardcoded default probe identity ("player-1") is a
// synthetic reserved test account -- in a real cloned prod snapshot it is
// frequently a brand-new, zero-tile account (profileNeedsSetup: true,
// gold: 10, no manpower spent), which makes every candidate generator
// legitimately find nothing to do (acceptedSamples: 0), silently skipping
// the gate's real latency checks without that ever showing up as an error.
//
// This queries the gateway's read-only /admin/players diagnostic endpoint
// (see apps/realtime-gateway/src/admin-auth/admin-auth.ts) for the
// non-AI, non-barbarian player who currently owns the most tiles, and
// prints that id. It can then be used as AUTH_TOKEN for the frontier
// smoke/soak scripts via resolveGatewayAuthIdentity's
// allowDirectPlayerIdToken dev path (any raw string authenticates directly
// as that player id in local/dev boots -- see apps/realtime-gateway/src/
// auth-identity/auth-identity.ts). Admin auth is satisfied with a GitHub
// token that has read access to this repo (`gh auth token`), which is
// already how any agent/developer working in this repo is authenticated --
// no separate secret needs to be provisioned just to run the gate.
const gatewayHealthUrl = process.env.GATEWAY_HEALTH_URL ?? "http://127.0.0.1:3101/health";
const adminPlayersUrl = new URL("/admin/players", gatewayHealthUrl).toString();
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? "10000");

const githubToken = process.env.PROBE_ADMIN_GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
const adminApiToken = process.env.ADMIN_API_TOKEN;

const fetchJson = async (url, headers) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    const body = await response.json();
    if (!response.ok || body?.ok === false) {
      throw new Error(`${url} returned ${response.status}: ${JSON.stringify(body)}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const headers = {};
if (adminApiToken) headers.Authorization = `Bearer ${adminApiToken}`;
else if (githubToken) headers["X-Admin-Github-Token"] = githubToken;
else {
  console.error(
    "no admin credential available -- set ADMIN_API_TOKEN, or PROBE_ADMIN_GITHUB_TOKEN/GH_TOKEN/GITHUB_TOKEN " +
      "(e.g. `gh auth token`) so /admin/players can be queried"
  );
  process.exit(1);
}

const { players } = await fetchJson(adminPlayersUrl, headers);
const candidates = (Array.isArray(players) ? players : [])
  .filter((player) => !player.isAi && player.id !== "barbarian-1" && Number(player.ownedTiles) > 0)
  .sort((left, right) => Number(right.ownedTiles) - Number(left.ownedTiles));

if (candidates.length === 0) {
  console.error("no non-AI, non-barbarian player with ownedTiles > 0 found via /admin/players");
  process.exit(1);
}

const winner = candidates[0];
console.log(JSON.stringify({ ok: true, playerId: winner.id, ownedTiles: winner.ownedTiles, name: winner.name }));
