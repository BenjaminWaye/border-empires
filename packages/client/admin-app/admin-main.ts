// /admin on play.borderempires.com and staging.borderempires.com: sign in with
// Google, then browse the gateway's read-only admin data for this deployment.
// Access is decided server-side (ADMIN_EMAIL, verified); this page only
// signs in and renders. Separate Vite entry (admin.html) so none of the game
// client loads here.
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type Auth, type User } from "firebase/auth";

import { createClientFirebaseSetup } from "../src/client-app-runtime-env/client-app-runtime-env.js";
import { createAdminApi, type AdminApi } from "./admin-api.js";
import { renderDataView } from "./admin-data-view.js";
import { el } from "./admin-dom.js";
import { resolveAdminEnvironment } from "./admin-environment.js";
import { renderPlayerInsights, type PlayerInsightsResponse } from "./admin-insights.js";
import "./admin.css";

type View = {
  id: string;
  title: string;
  description: string;
  path: (params: URLSearchParams) => string;
  param?: { name: string; hint: string };
  windowDays?: boolean;
};

const VIEWS: View[] = [
  { id: "insights", title: "Player insights", description: "Sign-up funnel, new-player milestones, sessions, per-player timelines.", path: (p) => `/admin/players/insights.json?days=${p.get("days") ?? "7"}`, windowDays: true },
  { id: "players", title: "Players", description: "Every player this season: gold, income, tiles, techs.", path: () => "/admin/players" },
  { id: "ai", title: "AI players", description: "AI economy, territory and last commands.", path: () => "/admin/debug/ai" },
  { id: "decisions", title: "AI decisions", description: "Recent planner decisions (about the last minute).", path: (p) => `/admin/debug/ai/decisions${p.get("playerId") ? `?playerId=${encodeURIComponent(p.get("playerId")!)}` : ""}`, param: { name: "playerId", hint: "ai-2 (optional)" } },
  { id: "metrics", title: "Runtime metrics", description: "Gateway + simulation Prometheus text.", path: () => "/admin/runtime/metrics" },
  { id: "bundle", title: "Debug bundle", description: "Health, recent server events, attack traces.", path: () => "/admin/runtime/debug-bundle" }
];

const root = document.getElementById("admin-root")!;
const environment = resolveAdminEnvironment(window.location.hostname, import.meta.env.VITE_GATEWAY_WS_URL as string | undefined);
const { firebaseAuth, googleProvider } = createClientFirebaseSetup();

const currentRoute = (): { view: View; params: URLSearchParams } => {
  const [id = "insights", query = ""] = window.location.hash.replace(/^#\/?/, "").split("?");
  return { view: VIEWS.find((view) => view.id === id) ?? VIEWS[0]!, params: new URLSearchParams(query) };
};

const header = (user: User | undefined, auth: Auth | undefined): HTMLElement =>
  el("header", {}, [
    el("h1", { text: "Border Empires admin" }),
    el("span", { class: `env env-${environment.label.toLowerCase()}`, text: environment.label }),
    ...(environment.otherAdminUrl ? [el("a", { href: environment.otherAdminUrl, text: environment.label === "Production" ? "switch to staging" : "switch to production" })] : []),
    el("span", { class: "spacer" }),
    ...(user && auth ? [el("span", { class: "meta", text: user.email ?? user.uid }), signOutButton(auth)] : [])
  ]);

const signOutButton = (auth: Auth): HTMLElement => {
  const button = el("button", { text: "sign out" });
  button.addEventListener("click", () => void signOut(auth));
  return button;
};

const renderSignIn = (auth: Auth | undefined, message?: string): void => {
  const button = el("button", { class: "primary", text: "Sign in with Google" });
  const status = el("p", { class: "meta", text: message ?? "Only the game's admin account can see this data." });
  button.addEventListener("click", () => {
    if (!auth || !googleProvider) return;
    status.textContent = "Opening Google sign-in…";
    signInWithPopup(auth, googleProvider).catch((error: unknown) => {
      const code = (error as { code?: string } | undefined)?.code ?? "";
      // Popups are often blocked on mobile / in-app browsers; fall back to a redirect.
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") void signInWithRedirect(auth, googleProvider);
      else status.textContent = `Sign-in failed: ${error instanceof Error ? error.message : String(error)}`;
    });
  });
  root.replaceChildren(header(undefined, auth), el("main", { class: "signin" }, [el("h2", { text: "Admin sign-in" }), button, status]));
};

const renderView = async (api: AdminApi, user: User, auth: Auth): Promise<void> => {
  const { view, params } = currentRoute();
  const nav = el("nav", {}, VIEWS.map((item) => el("a", { href: `#${item.id}`, class: item.id === view.id ? "active" : "", title: item.description, text: item.title })));
  const controls: HTMLElement[] = [];
  if (view.windowDays) {
    const select = el("select", {}, (["1", "7", "30", "90"] as const).map((days) => el("option", { value: days, text: days === "1" ? "24h" : `${days} days` })));
    select.value = params.get("days") ?? "7";
    select.addEventListener("change", () => { window.location.hash = `${view.id}?days=${select.value}`; });
    controls.push(el("label", { class: "meta" }, ["window ", select]));
  }
  if (view.param) {
    const input = el("input", { placeholder: view.param.hint, value: params.get(view.param.name) ?? "" });
    const go = el("button", { text: "load" });
    go.addEventListener("click", () => { window.location.hash = `${view.id}${input.value ? `?${view.param!.name}=${encodeURIComponent(input.value)}` : ""}`; });
    controls.push(el("label", { class: "meta" }, [`${view.param.name} `, input]), go);
  }
  const refresh = el("button", { text: "refresh" });
  refresh.addEventListener("click", () => void renderView(api, user, auth));
  const content = el("div", { class: "content" }, [el("p", { class: "meta", text: "loading…" })]);
  root.replaceChildren(header(user, auth), nav, el("main", {}, [el("div", { class: "toolbar" }, [el("h2", { text: view.title }), ...controls, refresh]), content]));

  const result = await api.get(view.path(params));
  if (currentRoute().view.id !== view.id) return; // navigated away while loading
  if (!result.ok) {
    content.replaceChildren(el("p", { class: "error", text: result.message }));
    return;
  }
  try {
    content.replaceChildren(view.id === "insights" ? renderPlayerInsights(JSON.parse(result.body) as PlayerInsightsResponse) : renderDataView(result.body, result.contentType));
  } catch (error) {
    content.replaceChildren(el("p", { class: "error", text: `Could not render this data: ${error instanceof Error ? error.message : String(error)}` }));
  }
};

if (!firebaseAuth) {
  renderSignIn(undefined, "Firebase isn't configured for this build.");
} else {
  const auth = firebaseAuth;
  let onHashChange: (() => void) | undefined;
  onAuthStateChanged(auth, (user) => {
    if (onHashChange) window.removeEventListener("hashchange", onHashChange);
    if (!user) {
      renderSignIn(auth);
      return;
    }
    const api = createAdminApi(environment.gatewayOrigin, () => user.getIdToken());
    onHashChange = () => void renderView(api, user, auth);
    window.addEventListener("hashchange", onHashChange);
    void renderView(api, user, auth);
  });
}
