import { onAuthStateChanged, type Auth } from "firebase/auth";
import { isStagingHostname } from "./client-backend-selector.js";
import { serverHttpOriginFromWsUrl } from "./client-debug-bundle.js";

export type RallyLinkView = {
  code: string;
  url: string;
  ownerPlayerId: string;
  ownerName: string;
  anchor: { x: number; y: number; island: string };
  createdAt: number;
  expiresAt: number;
  maxUses: number;
  usesRemaining: number;
};

export const rallyCodeFromLocation = (location: Pick<Location, "pathname">): string | undefined => {
  const match = location.pathname.match(/^\/r\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]!) : undefined;
};

export const isRallyNewRoute = (location: Pick<Location, "pathname">): boolean =>
  location.pathname === "/rally/new" || location.pathname === "/rally/new/";

type RallyRuntimeEnv = {
  VITE_RALLY_API_ORIGIN?: string;
};

const normalizedOrigin = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : undefined;
};

export const rallyApiOrigin = (
  wsUrl: string,
  locationLike: Pick<Location, "hostname" | "protocol"> | undefined =
    typeof window !== "undefined" ? window.location : undefined,
  env: RallyRuntimeEnv = import.meta.env as unknown as RallyRuntimeEnv
): string => {
  const configured = normalizedOrigin(env.VITE_RALLY_API_ORIGIN);
  if (configured) return configured;

  const hostname = locationLike?.hostname.toLowerCase() ?? "";
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
    return `${locationLike?.protocol === "https:" ? "https" : "http"}://127.0.0.1:3101`;
  }
  if (isStagingHostname(hostname)) return "https://border-empires-combined-staging.fly.dev";

  const wsOrigin = serverHttpOriginFromWsUrl(wsUrl);
  if (wsOrigin !== "https://border-empires.fly.dev") return wsOrigin;
  return "https://border-empires-gateway.fly.dev";
};

export const rallyLinkEndpoint = (
  wsUrl: string,
  code?: string,
  locationLike?: Pick<Location, "hostname" | "protocol">,
  env?: RallyRuntimeEnv
): string => {
  const base = `${rallyApiOrigin(wsUrl, locationLike, env)}/rally/links`;
  return code ? `${base}/${encodeURIComponent(code)}` : base;
};

const formatExpiry = (expiresAt: number): string => {
  if (!Number.isFinite(expiresAt)) return "";
  const date = new Date(expiresAt);
  return `Expires ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
};

const createPanel = (variant: "new" | "invite"): HTMLElement => {
  const panel = document.createElement("section");
  panel.className = "rally-link-panel";
  panel.dataset.variant = variant;
  panel.innerHTML = `
    <div class="rally-link-card">
      <h2>Rally link</h2>
      <p data-rally-status>Sign in to create a rally link.</p>
      <dl data-rally-details hidden>
        <div><dt>Host</dt><dd data-rally-owner></dd></div>
        <div><dt>Spawns</dt><dd data-rally-uses></dd></div>
        <div><dt>Anchor</dt><dd data-rally-anchor></dd></div>
      </dl>
      <div data-rally-output hidden>
        <input data-rally-url readonly />
        <button type="button" data-rally-copy>Copy</button>
      </div>
    </div>
  `;
  document.body.append(panel);
  const style = document.createElement("style");
  style.textContent = `
    .rally-link-panel{position:fixed;inset:0;z-index:29;display:grid;place-items:center;pointer-events:none}
    .rally-link-card{width:min(420px,calc(100vw - 32px));background:rgba(11,18,32,.94);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:18px;color:#f8fafc;box-shadow:0 18px 54px rgba(0,0,0,.38);pointer-events:auto}
    .rally-link-card h2{font-size:20px;line-height:1.2;margin:0 0 8px}
    .rally-link-card p{margin:0 0 12px;color:#cbd5e1}
    .rally-link-card dl{display:grid;grid-template-columns:1fr;gap:8px;margin:0 0 14px}
    .rally-link-card dl[hidden]{display:none}
    .rally-link-card dl div{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-top:1px solid rgba(255,255,255,.12);padding-top:8px}
    .rally-link-card dt{color:#94a3b8;font-size:12px;text-transform:uppercase}
    .rally-link-card dd{margin:0;text-align:right;color:#f8fafc}
    .rally-link-card [data-rally-output]{display:grid;grid-template-columns:1fr auto;gap:8px}
    .rally-link-card [data-rally-output][hidden]{display:none}
    .rally-link-card input{min-width:0;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:#020617;color:#f8fafc;padding:10px}
    .rally-link-card button{border:0;border-radius:6px;background:#38bdf8;color:#082f49;font-weight:700;padding:0 12px}
  `;
  document.head.append(style);
  return panel;
};

export const mountRallyNewPanel = (deps: { firebaseAuth?: Auth; wsUrl: string }): void => {
  if (typeof window === "undefined" || !isRallyNewRoute(window.location)) return;
  const panel = createPanel("new");
  const status = panel.querySelector<HTMLElement>("[data-rally-status]")!;
  const output = panel.querySelector<HTMLElement>("[data-rally-output]")!;
  const input = panel.querySelector<HTMLInputElement>("[data-rally-url]")!;
  const copy = panel.querySelector<HTMLButtonElement>("[data-rally-copy]")!;
  let mintInFlight = false;
  let minted = false;

  const mint = async (): Promise<void> => {
    if (minted || mintInFlight) return;
    const user = deps.firebaseAuth?.currentUser;
    if (!user) {
      status.textContent = "Sign in, then this page will create your rally link.";
      return;
    }
    mintInFlight = true;
    status.textContent = "Creating rally link...";
    try {
      const token = await user.getIdToken();
      const response = await fetch(rallyLinkEndpoint(deps.wsUrl), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({})
      });
      const body = await response.json().catch(() => undefined) as RallyLinkView | { error?: string } | undefined;
      if (!response.ok || !body || !("url" in body)) {
        status.textContent = body && "error" in body && body.error ? body.error : "Could not create a rally link.";
        return;
      }
      minted = true;
      input.value = body.url;
      output.hidden = false;
      status.textContent = `Share this link. ${body.usesRemaining} joins remaining.`;
    } finally {
      mintInFlight = false;
    }
  };

  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(input.value);
    status.textContent = "Rally link copied.";
  });
  if (deps.firebaseAuth) onAuthStateChanged(deps.firebaseAuth, () => void mint());
  void mint();
};

export const mountRallyInvitePanel = (deps: { firebaseAuth?: Auth; wsUrl: string }): void => {
  if (typeof window === "undefined") return;
  const code = rallyCodeFromLocation(window.location);
  if (!code) return;

  const panel = createPanel("invite");
  const title = panel.querySelector<HTMLHeadingElement>("h2")!;
  const status = panel.querySelector<HTMLElement>("[data-rally-status]")!;
  const details = panel.querySelector<HTMLElement>("[data-rally-details]")!;
  const owner = panel.querySelector<HTMLElement>("[data-rally-owner]")!;
  const uses = panel.querySelector<HTMLElement>("[data-rally-uses]")!;
  const anchor = panel.querySelector<HTMLElement>("[data-rally-anchor]")!;
  title.textContent = "Join a rally";
  status.textContent = "Loading rally invite...";

  const renderAuthStatus = (): void => {
    if (deps.firebaseAuth?.currentUser) {
      panel.remove();
      return;
    }
    status.textContent = "Sign in or create an account to join through this rally invite.";
  };

  void fetch(rallyLinkEndpoint(deps.wsUrl, code), {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" }
  })
    .then(async (response) => {
      const body = await response.json().catch(() => undefined) as RallyLinkView | { error?: string } | undefined;
      if (!response.ok || !body || !("code" in body)) {
        status.textContent = "This rally invite is expired or no longer available.";
        return;
      }
      owner.textContent = body.ownerName;
      uses.textContent = `${body.usesRemaining} remaining`;
      anchor.textContent = `${body.anchor.x}, ${body.anchor.y} · ${formatExpiry(body.expiresAt)}`;
      details.hidden = false;
      renderAuthStatus();
    })
    .catch(() => {
      status.textContent = "Could not load this rally invite.";
    });

  if (deps.firebaseAuth) onAuthStateChanged(deps.firebaseAuth, renderAuthStatus);
};
