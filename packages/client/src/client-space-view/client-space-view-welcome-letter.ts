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

const namingStepHtml = (): string => `
  <div class="sv-welcome-backdrop" data-space-view-welcome>
    <div class="sv-welcome-card" role="dialog" aria-modal="true" aria-labelledby="sv-welcome-title">
      <h2 class="sv-welcome-heading" id="sv-welcome-title">🪐 Name Your World</h2>
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
        <button type="submit" class="sv-btn">Name it →</button>
      </form>
      <p class="sv-welcome-error" data-space-view-welcome-error hidden></p>
    </div>
  </div>
`;

const letterStepHtml = (planetName: string): string => `
  <div class="sv-welcome-backdrop" data-space-view-welcome>
    <div class="sv-welcome-card sv-welcome-letter" role="dialog" aria-modal="true" aria-labelledby="sv-welcome-letter-title">
      <p class="sv-welcome-kicker" id="sv-welcome-letter-title">By Decree of the Imperial Court</p>
      <p class="sv-welcome-letter-body">
        To the Duke of Planet ${escapeHtml(planetName)},<br /><br />
        The Court extends its congratulations on your victory in Frontier Sector #001.<br /><br />
        Your achievement has secured your place among the Empire's recognized dominions and opened another passage toward the frontier.<br /><br />
        The Court is pleased to see your administration prosper. We trust that your continued efforts will prove equally valuable to the Empire and to the interests of the Senate.<br /><br />
        Your work has been noticed.<br /><br />
        Serve well, and you will find the Empire a generous ally.
      </p>
      <p class="sv-welcome-signature">— The Imperial Court</p>
      <button type="button" class="sv-btn sv-welcome-dismiss" data-space-view-welcome-dismiss>Take your seat →</button>
    </div>
  </div>
`;

export const spaceViewWelcomeStyle = `
  .sv-welcome-backdrop{position:absolute;inset:0;z-index:11;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(5,3,2,.85);backdrop-filter:blur(2px)}
  .sv-welcome-card{width:min(460px,100%);max-height:calc(100vh - 96px);overflow:auto;background:linear-gradient(180deg,rgba(24,17,10,.98),rgba(14,10,6,.98));border:1px solid rgba(230,178,106,.32);border-radius:16px;padding:28px;box-shadow:0 24px 64px rgba(0,0,0,.5),0 0 48px rgba(214,150,68,.14);text-align:center}
  .sv-welcome-heading{margin:0 0 10px;color:#ffd68f;font-size:17px;letter-spacing:-.01em}
  .sv-welcome-copy{margin:0 0 18px;color:rgba(240,224,200,.86);font-size:13px;line-height:1.5}
  .sv-welcome-card form{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
  .sv-welcome-card input{min-width:0;flex:1 1 200px;border:1px solid rgba(230,178,106,.32);border-radius:6px;background:rgba(5,3,2,.6);color:#fbf3e6;padding:10px}
  .sv-welcome-error{margin:12px 0 0;color:#f2a0a0;font-size:12.5px}
  .sv-welcome-error[hidden]{display:none}
  .sv-welcome-letter{text-align:left}
  .sv-welcome-kicker{margin:0 0 18px;text-align:center;color:#ffd68f;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .sv-welcome-letter-body{margin:0;color:rgba(240,224,200,.9);font-size:13.5px;line-height:1.7;font-style:italic}
  .sv-welcome-signature{margin:18px 0 22px;text-align:right;color:#ffd68f;font-size:13px;font-style:italic}
  .sv-welcome-dismiss{width:100%;border-color:rgba(255,214,148,.5);background:linear-gradient(180deg,rgba(255,214,148,.22),rgba(214,150,68,.14));color:#ffe6b8;font-weight:700;padding:10px}
  .sv-welcome-dismiss:hover{background:linear-gradient(180deg,rgba(255,214,148,.32),rgba(214,150,68,.22))}
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
    wrapper.innerHTML = letterStepHtml(planetName);
    wrapper.querySelector("[data-space-view-welcome-dismiss]")?.addEventListener("click", dismiss);
  };

  const showNaming = (): void => {
    wrapper.innerHTML = namingStepHtml();
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
