import { onAuthStateChanged, type Auth } from "firebase/auth";

import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { renderGalaxyViewHtml, renderEmperorSectionHtml, type GalaxyViewPlanet, type GalaxyEmperorViewModel } from "./galaxy-view-html.js";

type GalaxyMeResponse = { planets?: GalaxyViewPlanet[] };
type GalaxyNameResponse = { ok?: boolean; error?: string; planet?: { planetName: string } };
type GalaxyEmperorResponse = Partial<GalaxyEmperorViewModel> & { ok?: boolean };
type GalaxyEndorseResponse = { ok?: boolean; error?: string; endorsement?: { targetPlayerId: string; createdAt: number } };

const galaxyStyle = `
  /* Positioned to clear the always-on chrome that already owns the bottom-right
     corner: the desktop minimap (right:12px/bottom:12px, ~292px tall including
     its toolbar+label) and, on mobile, the fixed bottom nav bar (~68px + the
     safe-area inset). Also nudges left when the desktop side panel is open,
     mirroring how #mini-map-wrap itself avoids the side panel.
     z-index is chosen relative to #hud's own stacking order (mini-map-wrap:20,
     mobile-sheet:21, mobile-nav:22, side-panel:25, targeting-overlay:27,
     auth-overlay:30) — the launcher sits above regular HUD chrome, and the
     modal below auth-overlay so a re-auth prompt is never hidden behind it.
     These elements are mounted as children of #hud (see ensureMounted below),
     not document.body: #hud has position:fixed, which always creates its own
     stacking context, so a sibling of #hud with any explicit z-index would
     otherwise paint above everything inside #hud regardless of the number
     used, including the login screen. */
  .gx-launcher{position:fixed;right:16px;bottom:320px;z-index:23;width:44px;height:44px;padding:0;margin:0;appearance:none;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(3,7,14,.85);cursor:pointer;pointer-events:auto;font-size:28px;line-height:1;display:grid;place-items:center;color:#94a3b8;transition:color .15s,transform .15s,background .15s}
  .gx-launcher:hover{color:#f1f5f9;background:rgba(11,19,32,.9);transform:scale(1.15)}
  #hud.desktop-side-panel-open ~ .gx-launcher{right:464px}
  @media (max-width: 900px) {
    .gx-launcher{right:8px;bottom:calc(68px + max(8px, env(safe-area-inset-bottom)) + 8px);width:40px;height:40px;font-size:24px}
  }
  .gx-overlay{position:fixed;inset:0;z-index:29;display:grid;place-items:center;pointer-events:auto}
  .gx-overlay[hidden]{display:none}
  .gx-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.82)}
  .gx-panel{position:relative;width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 64px);overflow:auto;background:rgba(8,12,24,.96);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:24px}
  .gx-close{position:absolute;top:10px;right:12px;border:0;background:transparent;color:#94a3b8;font-size:22px;cursor:pointer}
  .gx-starfield{position:relative;border-radius:10px;padding:32px 16px;text-align:center;background:radial-gradient(ellipse at center,#0f172a 0%,#020617 70%);overflow:hidden}
  .gx-stars{position:absolute;inset:0;background-image:radial-gradient(1px 1px at 20% 30%,#fff,transparent),radial-gradient(1px 1px at 65% 15%,#fff,transparent),radial-gradient(1.5px 1.5px at 80% 60%,#fff,transparent),radial-gradient(1px 1px at 40% 80%,#fff,transparent),radial-gradient(1px 1px at 90% 40%,#fff,transparent),radial-gradient(1.5px 1.5px at 10% 65%,#fff,transparent);opacity:.6}
  .gx-kicker{position:relative;margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
  .gx-planet-figure{position:relative;width:132px;height:132px;margin:0 auto 18px;display:grid;place-items:center}
  .gx-ring{position:absolute;width:224px;height:72px;border-radius:50%;border:9px solid transparent;border-top-color:rgba(148,197,255,.55);border-bottom-color:rgba(56,110,168,.32);transform:rotate(-12deg);pointer-events:none}
  .gx-orb{position:relative;width:132px;height:132px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 30% 26%,#a9ecff 0%,#38bdf8 32%,#0d6ab0 62%,#062a45 100%);box-shadow:0 0 46px rgba(56,189,248,.5)}
  .gx-orb-bands{position:absolute;inset:-20%;background:repeating-linear-gradient(98deg, transparent 0 8%, rgba(255,255,255,.18) 8% 11%, transparent 11% 22%, rgba(6,30,50,.34) 22% 27%, transparent 27% 38%);animation:gx-spin 18s linear infinite;mix-blend-mode:overlay}
  .gx-orb-shade{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 30% 24%, rgba(255,255,255,.4), transparent 42%),radial-gradient(circle at 78% 82%, rgba(2,8,16,.6), transparent 55%);pointer-events:none}
  @keyframes gx-spin{to{transform:rotate(360deg)}}
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
  .gx-emperor{position:relative;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,.14);text-align:center}
  .gx-emperor-copy{margin:0 0 8px;color:#cbd5e1;font-size:14px}
  .gx-emperor-countdown{margin:0 0 8px;color:#facc15;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
  .gx-emperor-current{margin:0 0 8px;color:#94a3b8;font-size:13px}
  .gx-emperor form{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .gx-emperor input{min-width:0;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:#020617;color:#f8fafc;padding:10px}
  .gx-emperor button{border:0;border-radius:6px;background:#facc15;color:#082f49;font-weight:700;padding:0 14px}
  .gx-emperor-error{margin:10px 0 0;color:#fca5a5;font-size:13px}
  .gx-emperor-error[hidden]{display:none}
`;

// #hud is `position:fixed` with no explicit z-index, which per the CSS
// stacking rules still makes it its own stacking context — so anything
// mounted as a *sibling* of #hud (e.g. document.body) with an explicit
// z-index would always paint above #hud's entire subtree (including the
// auth/login overlay), no matter what number is used. Mounting inside #hud
// instead makes the launcher/overlay's z-index compare correctly against the
// real overlays declared there. #hud has `pointer-events: none`, so — like
// the other overlays nested inside it (#structure-info-overlay etc.) — our
// elements opt back in via `pointer-events: auto` in the CSS above.
const galaxyMountRoot = (): HTMLElement => document.getElementById("hud") ?? document.body;

const buildPanel = (): { overlay: HTMLElement; body: HTMLElement; launcher: HTMLButtonElement } => {
  const root = galaxyMountRoot();

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "gx-launcher";
  launcher.textContent = "🪐";
  launcher.setAttribute("aria-label", "Open your galaxy");
  root.append(launcher);

  const overlay = document.createElement("section");
  overlay.className = "gx-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="gx-backdrop" data-galaxy-close></div>
    <div class="gx-panel">
      <button type="button" class="gx-close" data-galaxy-close aria-label="Close">\u00d7</button>
      <div data-galaxy-body></div>
    </div>`;
  root.append(overlay);

  const style = document.createElement("style");
  style.textContent = galaxyStyle;
  document.head.append(style);

  return { overlay, body: overlay.querySelector<HTMLElement>("[data-galaxy-body]")!, launcher };
};

export const mountGalaxyView = (deps: { firebaseAuth?: Auth; wsUrl: string }): void => {
  if (typeof window === "undefined") return;

  let planets: GalaxyViewPlanet[] = [];
  let focusedSeasonId = "";
  let emperorModel: GalaxyEmperorViewModel = { emperor: null, windowOpenUntil: null, endorsement: null, isEmperor: false };
  let panel: { overlay: HTMLElement; body: HTMLElement; launcher: HTMLButtonElement } | undefined;

  const render = (): void => {
    if (!panel) return;
    panel.body.innerHTML = renderGalaxyViewHtml({ planets, focusedSeasonId }) + renderEmperorSectionHtml(emperorModel);
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

  const endorse = async (form: HTMLFormElement): Promise<void> => {
    const container = form.closest<HTMLElement>("[data-galaxy-emperor]");
    const input = form.querySelector<HTMLInputElement>("[data-galaxy-endorse-target]");
    const errorEl = container?.querySelector<HTMLElement>("[data-galaxy-endorse-error]");
    const user = deps.firebaseAuth?.currentUser;
    if (!input || !user) return;
    const targetValue = input.value.trim();
    const showError = (message: string): void => {
      if (!errorEl) return;
      errorEl.hidden = false;
      errorEl.textContent = message;
    };
    if (!targetValue) {
      showError("Enter a player email or ID.");
      return;
    }
    const isEmail = targetValue.includes("@");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/endorse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(isEmail ? { targetEmail: targetValue } : { targetAuthUid: targetValue })
      });
      const body = (await response.json().catch(() => undefined)) as GalaxyEndorseResponse | undefined;
      if (!response.ok || !body?.ok || !body.endorsement) {
        showError(body?.error ?? "Could not endorse that player.");
        return;
      }
      emperorModel = { ...emperorModel, endorsement: body.endorsement };
      render();
    } catch {
      showError("Could not endorse that player. Try again.");
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
      const target = event.target as HTMLElement;
      const christenForm = target.closest<HTMLFormElement>("[data-galaxy-christen-form]");
      if (christenForm) {
        event.preventDefault();
        void christen(christenForm);
        return;
      }
      const endorseForm = target.closest<HTMLFormElement>("[data-galaxy-endorse-form]");
      if (endorseForm) {
        event.preventDefault();
        void endorse(endorseForm);
      }
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

  const loadEmperor = async (): Promise<void> => {
    const user = deps.firebaseAuth?.currentUser;
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/emperor`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => undefined)) as GalaxyEmperorResponse | undefined;
      if (!body?.ok) return;
      emperorModel = {
        emperor: body.emperor ?? null,
        windowOpenUntil: body.windowOpenUntil ?? null,
        endorsement: body.endorsement ?? null,
        isEmperor: body.isEmperor ?? false
      };
      render();
    } catch {
      // Network hiccup: the Emperor section just stays hidden until the next auth event.
    }
  };

  if (deps.firebaseAuth) {
    onAuthStateChanged(deps.firebaseAuth, () => {
      void load();
      void loadEmperor();
    });
  }
  void load();
  void loadEmperor();
};
