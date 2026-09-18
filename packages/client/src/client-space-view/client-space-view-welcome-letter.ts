// First-visit-to-Space welcome flow: name your planet, then receive a
// decree letter from the Imperial Court welcoming you as Duke of it.
// Shown once per account (server-synced dismissal via the same discovery
// tip storage client-space-view-intro.ts uses), gated on owning at least
// one Space-eligible planet -- see client-space-view.ts's call site.
//
// "Frontier Sector #001" is hardcoded for now: the galactic layer only has
// one sector today, and seasons/sectors aren't yet numbered in a way that's
// safe to surface here (see the seasonSequence field's own caveats in
// galaxy-view-html.ts). Swap in the real sector id/number once that exists.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { isDiscoveryTipSeen, markDiscoveryTipSeen } from "../client-discovery-tips/client-discovery-tips-storage.js";

export const SPACE_VIEW_WELCOME_TIP_ID = "SPACE_WELCOME_LETTER";

const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

// A small inline flourish divider -- the same ornament borderempires.com's
// /alpha invitation page uses under its "Alpha Invitation" kicker (see
// border-empires-hq's src/pages/Alpha.tsx Flourish()), reproduced here so
// this in-game letter reads as the same "aged decree" object as that page
// rather than another dark steampunk panel.
const flourishSvg = (): string => `
  <svg class="sv-welcome-flourish" viewBox="0 0 100 12" aria-hidden="true" fill="currentColor">
    <path d="M0 6 L60 6" stroke="currentColor" stroke-width="0.8" fill="none" />
    <path d="M60 6 Q66 0 72 6 Q78 12 84 6" fill="none" stroke="currentColor" stroke-width="0.8" />
    <circle cx="88" cy="6" r="1.4" />
    <path d="M92 6 L98 6" stroke="currentColor" stroke-width="0.8" />
    <path d="M98 3 L100 6 L98 9 Z" />
  </svg>
`;

// Exported (alongside letterStepHtml below) so storybook can render the
// real markup/copy directly rather than maintaining a duplicate mock --
// see packages/storybook/src/SpaceViewWelcomeLetter.stories.ts.
export const spaceViewWelcomeNamingStepHtml = (): string => `
  <div class="sv-welcome-backdrop" data-space-view-welcome>
    <div class="sv-welcome-frame">
      <div class="sv-welcome-card" role="dialog" aria-modal="true" aria-labelledby="sv-welcome-title">
        <h2 class="sv-welcome-heading" id="sv-welcome-title">Name Your World</h2>
        <div class="sv-welcome-divider">${flourishSvg()}</div>
        <p class="sv-welcome-copy">Before the Court can recognize your victory, your new dominion needs a name.</p>
        <form data-space-view-welcome-name-form>
          <input
            type="text"
            name="planetName"
            maxlength="40"
            autocomplete="off"
            placeholder="Name your planet"
            data-space-view-welcome-name-input
            required
          />
          <button type="submit" class="sv-welcome-cta">Name it →</button>
        </form>
        <p class="sv-welcome-error" data-space-view-welcome-error hidden></p>
      </div>
    </div>
  </div>
`;

export const spaceViewWelcomeLetterStepHtml = (planetName: string): string => `
  <div class="sv-welcome-backdrop" data-space-view-welcome>
    <div class="sv-welcome-frame">
      <div class="sv-welcome-card sv-welcome-letter" role="dialog" aria-modal="true" aria-labelledby="sv-welcome-letter-title">
        <p class="sv-welcome-kicker" id="sv-welcome-letter-title">By Decree of the Imperial Court</p>
        <div class="sv-welcome-divider">${flourishSvg()}</div>
        <p class="sv-welcome-letter-body">
          To the Duke of Planet ${escapeHtml(planetName)},<br /><br />
          The Court extends its congratulations on your victory in Frontier Sector #001.<br /><br />
          Your achievement has secured your place among the Empire's recognized dominions and opened another passage toward the frontier.<br /><br />
          The Court is pleased to see your administration prosper. We trust that your continued efforts will prove equally valuable to the Empire and to the interests of the Senate.<br /><br />
          Your work has been noticed.<br /><br />
          Serve well, and you will find the Empire a generous ally.
        </p>
        <p class="sv-welcome-signature">The Imperial Court</p>
        <button type="button" class="sv-welcome-cta sv-welcome-dismiss" data-space-view-welcome-dismiss>To your new world →</button>
      </div>
    </div>
  </div>
`;

// Matches the parchment/brass-frame look of borderempires.com's /alpha
// invitation page (border-empires-hq's src/pages/Alpha.tsx +
// src/assets/parchment.jpg, mirrored here as
// packages/client/public/textures/parchment.jpg) rather than the dark
// steampunk-panel look most other Space View overlays use -- this one
// is meant to read as a physical letter, not another HUD panel.
export const spaceViewWelcomeStyle = `
  .sv-welcome-backdrop{position:absolute;inset:0;z-index:11;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(5,3,2,.85);backdrop-filter:blur(2px)}
  .sv-welcome-frame{width:min(480px,100%);max-height:calc(100vh - 96px);overflow:auto;padding:10px;border-radius:14px;background:linear-gradient(180deg,#5a4020,#3a2418 55%,#1a120b);box-shadow:0 24px 64px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4)}
  .sv-welcome-card{background-image:url(/textures/parchment.jpg);background-size:cover;background-position:center;border-radius:8px;padding:28px 26px;box-shadow:inset 0 0 60px rgba(60,30,10,.5);text-align:center;color:#2a1a0d}
  .sv-welcome-heading{margin:0 0 6px;color:#1a0f06;font-family:var(--sp-font-display,"Cinzel",serif);font-size:20px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
  .sv-welcome-divider{display:flex;justify-content:center;margin:0 0 16px;color:#6b3a1e;opacity:.75}
  .sv-welcome-divider svg{width:96px;height:12px}
  .sv-welcome-copy{margin:0 0 18px;color:#3a2418;font-size:13px;line-height:1.5}
  .sv-welcome-card form{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
  .sv-welcome-card input{min-width:0;flex:1 1 200px;border:1px solid rgba(107,58,30,.4);border-radius:6px;background:rgba(255,251,240,.55);color:#2a1a0d;padding:10px;font-family:inherit}
  .sv-welcome-error{margin:12px 0 0;color:#7d231b;font-size:12.5px;font-weight:600}
  .sv-welcome-error[hidden]{display:none}
  .sv-welcome-letter{text-align:left}
  .sv-welcome-kicker{margin:0 0 6px;text-align:center;color:#7d231b;font-family:var(--sp-font-display,"Cinzel",serif);font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
  .sv-welcome-letter .sv-welcome-divider{margin:0 auto 20px}
  .sv-welcome-letter-body{margin:0;color:#2a1a0d;font-size:14px;line-height:1.75}
  .sv-welcome-signature{margin:20px 0 22px;text-align:right;color:#2a1a0d;font-size:22px;font-style:italic;font-family:"Segoe Script","Snell Roundhand","Brush Script MT",cursive;transform:rotate(-3deg)}
  .sv-welcome-cta{width:100%;border:0;border-radius:6px;background:linear-gradient(180deg,#e4be74,#b6863a 55%,#8a611f);color:#1a120b;font-weight:700;letter-spacing:.04em;padding:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 2px 6px rgba(0,0,0,.3);cursor:pointer}
  .sv-welcome-cta:hover{background:linear-gradient(180deg,#f0cd8c,#c99a46 55%,#9c7226)}
`;

export type SpaceViewWelcomeLetterDeps = {
  screen: HTMLElement;
  seasonId: string;
  planetName: string | null;
  named: boolean;
  authEmail: string | null | undefined;
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
};

// Mounts the naming step (if the planet has no name yet) followed by the
// decree letter, or jumps straight to the letter if the planet was already
// named elsewhere (e.g. via the pre-existing galaxy overlay) before this
// tip was ever dismissed. No-ops once the tip has been seen.
export const mountSpaceViewWelcomeLetter = (deps: SpaceViewWelcomeLetterDeps): void => {
  if (isDiscoveryTipSeen(SPACE_VIEW_WELCOME_TIP_ID, deps.authEmail)) return;

  const wrapper = document.createElement("div");
  deps.screen.appendChild(wrapper);

  const dismiss = (): void => {
    markDiscoveryTipSeen(SPACE_VIEW_WELCOME_TIP_ID, deps.authEmail);
    wrapper.remove();
  };

  const showLetter = (planetName: string): void => {
    wrapper.innerHTML = spaceViewWelcomeLetterStepHtml(planetName);
    wrapper.querySelector("[data-space-view-welcome-dismiss]")?.addEventListener("click", dismiss);
  };

  const showNaming = (): void => {
    wrapper.innerHTML = spaceViewWelcomeNamingStepHtml();
    const form = wrapper.querySelector<HTMLFormElement>("[data-space-view-welcome-name-form]");
    const input = wrapper.querySelector<HTMLInputElement>("[data-space-view-welcome-name-input]");
    const errorEl = wrapper.querySelector<HTMLElement>("[data-space-view-welcome-error]");
    const showError = (message: string): void => {
      if (!errorEl) return;
      errorEl.hidden = false;
      errorEl.textContent = message;
    };
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const planetName = input?.value.trim() ?? "";
      if (!planetName) return;
      void (async () => {
        try {
          const token = await deps.getIdToken();
          if (!token) {
            showError("Sign in again to name your planet.");
            return;
          }
          const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/planets/${encodeURIComponent(deps.seasonId)}/name`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ planetName })
          });
          const body = (await response.json().catch(() => undefined)) as { ok?: boolean; error?: string; planet?: { planetName: string } } | undefined;
          if (!response.ok || !body?.ok) {
            showError(body?.error ?? "Could not name your planet. Try again.");
            return;
          }
          showLetter(body.planet?.planetName ?? planetName);
        } catch {
          showError("Could not name your planet. Try again.");
        }
      })();
    });
  };

  if (deps.named && deps.planetName) {
    showLetter(deps.planetName);
  } else {
    showNaming();
  }
};
