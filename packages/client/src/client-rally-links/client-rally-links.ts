import { onAuthStateChanged, type Auth } from "firebase/auth";
import { isStagingHostname } from "../client-backend-selector/client-backend-selector.js";
import { serverHttpOriginFromWsUrl } from "../client-debug-bundle/client-debug-bundle.js";

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

const createPanel = (): HTMLElement => {
  const panel = document.createElement("section");
  panel.className = "rally-link-panel";
  panel.innerHTML = `
    <div class="rally-link-card">
      <button type="button" class="rally-link-dismiss" data-rally-dismiss aria-label="Close">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M2 2 L14 14 M14 2 L2 14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
      </button>
      <h2>Rally link</h2>
      <p data-rally-status>Sign in to create a rally link.</p>
      <div data-rally-output hidden>
        <input data-rally-url readonly />
        <button type="button" data-rally-copy>Copy</button>
      </div>
    </div>
  `;
  // Mounted inside #hud (not document.body) so its z-index is compared
  // against #auth-overlay's within the same stacking context. #hud is
  // `position: fixed` with `z-index: auto`, which still forms its own
  // stacking context -- a body-level sibling with an explicit z-index
  // (even one numerically below #auth-overlay's) paints above everything
  // inside #hud regardless, hiding the sign-in form behind this panel.
  (document.getElementById("hud") ?? document.body).append(panel);
  // Injected once and left in <head> for the page's lifetime (harmless,
  // idempotent CSS) instead of on every open -- panels can now be opened
  // and dismissed repeatedly via the settings button, and re-adding this
  // tag each time would leak a fresh <style> element per cycle.
  if (!document.getElementById("rally-link-panel-style")) {
    const style = document.createElement("style");
    style.id = "rally-link-panel-style";
    style.textContent = `
      .rally-link-panel{position:fixed;inset:0;z-index:29;display:grid;place-items:center;pointer-events:none}
      .rally-link-card{position:relative;width:min(420px,calc(100vw - 32px));background:rgba(11,18,32,.94);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:18px;color:#f8fafc;box-shadow:0 18px 54px rgba(0,0,0,.38);pointer-events:auto}
      .rally-link-dismiss{position:absolute;top:8px;right:8px;width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:#94a3b8;padding:0;cursor:pointer}
      .rally-link-dismiss:hover{background:rgba(255,255,255,.1);color:#f8fafc}
      .rally-link-card h2{font-size:20px;line-height:1.2;margin:0 0 8px;padding-right:24px}
      .rally-link-card p{margin:0 0 12px;color:#cbd5e1}
      .rally-link-card [data-rally-output]{display:grid;grid-template-columns:1fr auto;gap:8px}
      .rally-link-card [data-rally-output][hidden]{display:none}
      .rally-link-card input{min-width:0;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:#020617;color:#f8fafc;padding:10px}
      .rally-link-card button{border:0;border-radius:6px;background:#38bdf8;color:#082f49;font-weight:700;padding:0 12px}
    `;
    document.head.append(style);
  }
  return panel;
};

const dismissPanel = (panel: HTMLElement): void => {
  panel.remove();
  if (typeof window !== "undefined" && window.history?.replaceState) {
    window.history.replaceState(null, "", "/");
  }
};

const openRallyNewPanel = (deps: { firebaseAuth?: Auth; wsUrl: string }): void => {
  const panel = createPanel();
  const status = panel.querySelector<HTMLElement>("[data-rally-status]")!;
  const output = panel.querySelector<HTMLElement>("[data-rally-output]")!;
  const input = panel.querySelector<HTMLInputElement>("[data-rally-url]")!;
  const copy = panel.querySelector<HTMLButtonElement>("[data-rally-copy]")!;
  const dismiss = panel.querySelector<HTMLButtonElement>("[data-rally-dismiss]")!;
  dismiss.addEventListener("click", () => dismissPanel(panel));
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

// Delegated so it also catches the "Get Rally Link" settings-panel button:
// that button opens the panel in place (no navigation), which keeps the
// already-signed-in Firebase session intact instead of racing a page reload.
export const bindRallyLinkOpenClicks = (deps: { firebaseAuth?: Auth; wsUrl: string }): void => {
  if (typeof document === "undefined") return;
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-rally-link-open]")) return;
    // Guard against stacking a second full-screen panel (and its own
    // duplicate <style> tag) if the button is clicked again before the
    // first panel is dismissed.
    if (document.querySelector(".rally-link-panel")) return;
    if (typeof window !== "undefined" && window.history?.pushState) {
      window.history.pushState(null, "", "/rally/new");
    }
    openRallyNewPanel(deps);
  });
};

export const mountRallyNewPanel = (deps: { firebaseAuth?: Auth; wsUrl: string }): void => {
  bindRallyLinkOpenClicks(deps);
  if (typeof window === "undefined" || !isRallyNewRoute(window.location)) return;
  openRallyNewPanel(deps);
};

// Shown inline inside the sign-in card rather than as its own overlay: a
// floating full-screen panel here used to sit on top of #auth-overlay
// (see bindRallyLinkOpenClicks's comment on stacking contexts -- #auth-card
// lives inside #hud, so a body-level popup with a numerically lower
// z-index still painted over it), hiding the "Continue with Google" button
// a rally guest actually needs to click.
const mountRallyInviteBanner = (deps: { firebaseAuth?: Auth; wsUrl: string }, code: string): void => {
  const authPanelHead = document.querySelector<HTMLElement>(".auth-panel-head");
  if (!authPanelHead) return;
  // Guard against inserting a second banner (with a second <style> tag)
  // if this is ever invoked more than once for the same page load.
  if (document.querySelector(".rally-invite-banner")) return;

  const banner = document.createElement("div");
  banner.className = "rally-invite-banner";
  banner.innerHTML = `<p data-rally-invite-status>Loading rally invite...</p>`;
  authPanelHead.before(banner);

  const style = document.createElement("style");
  style.textContent = `
    .rally-invite-banner{margin-bottom:14px;padding:10px 14px;border-radius:10px;border:1px solid rgba(56,189,248,.35);background:rgba(56,189,248,.1);color:#e0f2fe}
    .rally-invite-banner p{margin:0;font-size:14px;line-height:1.4}
  `;
  document.head.append(style);

  const status = banner.querySelector<HTMLElement>("[data-rally-invite-status]")!;

  const renderAuthStatus = (): void => {
    if (deps.firebaseAuth?.currentUser) banner.remove();
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
      const expiry = formatExpiry(body.expiresAt);
      status.textContent =
        `${body.ownerName} invited you to a rally -- sign in to spawn right next to them. ` +
        `${body.usesRemaining} joins remaining${expiry ? `, ${expiry}` : ""}.`;
      renderAuthStatus();
    })
    .catch(() => {
      status.textContent = "Could not load this rally invite.";
    });

  if (deps.firebaseAuth) onAuthStateChanged(deps.firebaseAuth, renderAuthStatus);
};

export const mountRallyInvitePanel = (deps: { firebaseAuth?: Auth; wsUrl: string }): void => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const code = rallyCodeFromLocation(window.location);
  if (!code) return;
  mountRallyInviteBanner(deps, code);
};
