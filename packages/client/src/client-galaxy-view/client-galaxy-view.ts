import { onAuthStateChanged, type Auth } from "firebase/auth";

import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { renderGalaxyViewHtml, type GalaxyViewPlanet } from "./galaxy-view-html.js";

type GalaxyMeResponse = { planets?: GalaxyViewPlanet[] };
type GalaxyNameResponse = { ok?: boolean; error?: string; planet?: { planetName: string } };

const galaxyStyle = `
  /* Positioned to clear the always-on chrome that already owns the bottom-right
     corner: the desktop minimap (right:12px/bottom:12px, ~292px tall including
     its toolbar+label) and, on mobile, the fixed bottom nav bar (~68px + the
     safe-area inset). Also nudges left when the desktop side panel is open,
     mirroring how #mini-map-wrap itself avoids the side panel. */
  .gx-launcher{position:fixed;right:16px;bottom:320px;z-index:19;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.24);background:radial-gradient(circle at 35% 30%,#334155,#0b1220);color:#f8fafc;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4)}
  #hud.desktop-side-panel-open ~ .gx-launcher{right:464px}
  @media (max-width: 900px) {
    .gx-launcher{right:8px;bottom:calc(68px + max(8px, env(safe-area-inset-bottom)) + 8px);width:44px;height:44px;font-size:20px}
  }
  .gx-overlay{position:fixed;inset:0;z-index:35;display:grid;place-items:center}
  .gx-overlay[hidden]{display:none}
  .gx-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.82)}
  .gx-panel{position:relative;width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 64px);overflow:auto;background:rgba(8,12,24,.96);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:24px}
  .gx-close{position:absolute;top:10px;right:12px;border:0;background:transparent;color:#94a3b8;font-size:22px;cursor:pointer}
  .gx-starfield{position:relative;border-radius:10px;padding:32px 16px;text-align:center;background:radial-gradient(ellipse at center,#0f172a 0%,#020617 70%);overflow:hidden}
  .gx-stars{position:absolute;inset:0;background-image:radial-gradient(1px 1px at 20% 30%,#fff,transparent),radial-gradient(1px 1px at 65% 15%,#fff,transparent),radial-gradient(1.5px 1.5px at 80% 60%,#fff,transparent),radial-gradient(1px 1px at 40% 80%,#fff,transparent),radial-gradient(1px 1px at 90% 40%,#fff,transparent),radial-gradient(1.5px 1.5px at 10% 65%,#fff,transparent);opacity:.6}
  .gx-kicker{position:relative;margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
  .gx-orb{position:relative;width:120px;height:120px;margin:0 auto 16px;border-radius:50%;background:radial-gradient(circle at 32% 28%,#7dd3fc,#0369a1 60%,#0c4a6e);box-shadow:0 0 40px rgba(56,189,248,.45)}
  .gx-planet-name{position:relative;margin:0 0 4px;font-size:24px;font-weight:700;color:#f8fafc}
  .gx-planet-meta{position:relative;margin:0;color:#94a3b8;font-size:13px}
  .gx-christen-copy{position:relative;margin:0 0 16px;color:#cbd5e1;font-size:14px}
  .gx-christen form{position:relative;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .gx-christen input{min-width:0;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:#020617;color:#f8fafc;padding:10px}
  .gx-christen button{border:0;border-radius:6px;background:#38bdf8;color:#082f49;font-weight:700;padding:0 14px}
  .gx-christen-error{position:relative;margin:10px 0 0;color:#fca5a5;font-size:13px}
  .gx-christen-error[hidden]{display:none}
  .gx-switcher{position:relative;margin-top:20px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .gx-switcher-item{border:1px solid rgba(255,255,255,.18);border-radius:16px;background:transparent;color:#cbd5e1;font-size:12px;padding:6px 12px;cursor:pointer}
  .gx-switcher-item.is-active{background:#38bdf8;color:#082f49;border-color:#38bdf8}
`;

const buildPanel = (): { overlay: HTMLElement; body: HTMLElement; launcher: HTMLButtonElement } => {
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "gx-launcher";
  launcher.textContent = "\u{1FA90}";
  launcher.setAttribute("aria-label", "Open your galaxy");
  document.body.append(launcher);

  const overlay = document.createElement("section");
  overlay.className = "gx-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="gx-backdrop" data-galaxy-close></div>
    <div class="gx-panel">
      <button type="button" class="gx-close" data-galaxy-close aria-label="Close">\u00d7</button>
      <div data-galaxy-body></div>
    </div>`;
  document.body.append(overlay);

  const style = document.createElement("style");
  style.textContent = galaxyStyle;
  document.head.append(style);

  return { overlay, body: overlay.querySelector<HTMLElement>("[data-galaxy-body]")!, launcher };
};

export const mountGalaxyView = (deps: { firebaseAuth?: Auth; wsUrl: string }): void => {
  if (typeof window === "undefined") return;

  let planets: GalaxyViewPlanet[] = [];
  let focusedSeasonId = "";
  let panel: { overlay: HTMLElement; body: HTMLElement; launcher: HTMLButtonElement } | undefined;

  const render = (): void => {
    if (!panel) return;
    panel.body.innerHTML = renderGalaxyViewHtml({ planets, focusedSeasonId });
  };

  const christen = async (form: HTMLFormElement): Promise<void> => {
    const container = form.closest<HTMLElement>("[data-galaxy-christen]");
    const seasonId = container?.dataset.seasonId;
    const input = form.querySelector<HTMLInputElement>("[data-galaxy-name-input]");
    const errorEl = container?.querySelector<HTMLElement>("[data-galaxy-christen-error]");
    const user = deps.firebaseAuth?.currentUser;
    if (!seasonId || !input || !user) return;
    const planetName = input.value.trim();
    const showError = (message: string): void => {
      if (!errorEl) return;
      errorEl.hidden = false;
      errorEl.textContent = message;
    };
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/planets/${encodeURIComponent(seasonId)}/name`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ planetName })
      });
      const body = (await response.json().catch(() => undefined)) as GalaxyNameResponse | undefined;
      if (!response.ok || !body?.ok) {
        showError(body?.error ?? "Could not name your planet.");
        return;
      }
      const record = planets.find((planet) => planet.seasonId === seasonId);
      if (record) {
        record.named = true;
        record.planetName = body.planet?.planetName ?? planetName;
      }
      render();
    } catch {
      showError("Could not name your planet. Try again.");
    }
  };

  const ensureMounted = (): void => {
    if (panel) return;
    panel = buildPanel();
    panel.launcher.addEventListener("click", () => {
      panel!.overlay.hidden = false;
    });
    panel.overlay.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-galaxy-close]")) {
        panel!.overlay.hidden = true;
        return;
      }
      const focusButton = target.closest<HTMLElement>("[data-galaxy-focus]");
      if (focusButton?.dataset.galaxyFocus) {
        focusedSeasonId = focusButton.dataset.galaxyFocus;
        render();
      }
    });
    panel.overlay.addEventListener("submit", (event) => {
      const form = (event.target as HTMLElement).closest<HTMLFormElement>("[data-galaxy-christen-form]");
      if (!form) return;
      event.preventDefault();
      void christen(form);
    });
  };

  const load = async (): Promise<void> => {
    const user = deps.firebaseAuth?.currentUser;
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => undefined)) as GalaxyMeResponse | undefined;
      const fetched = body?.planets ?? [];
      // Launcher only mounts once the account owns at least one planet — no
      // empty room for non-winners. `/hq/galaxy/me` returns newest-first, so
      // the newest win is the default focused hero.
      if (fetched.length === 0) return;
      planets = fetched;
      focusedSeasonId = planets[0]!.seasonId;
      ensureMounted();
      render();
    } catch {
      // Network hiccup: the launcher just stays unmounted until the next auth event.
    }
  };

  if (deps.firebaseAuth) onAuthStateChanged(deps.firebaseAuth, () => void load());
  void load();
};
