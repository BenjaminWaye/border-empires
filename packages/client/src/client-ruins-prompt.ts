// Lightweight one-off modal shown when a PLAYER_UPDATE arrives with
// incomePerMinute === 0, suggesting the player's empire has been eliminated.
// Shown at most once per session; dismissing suppresses it for the rest of
// the session. Reconnecting (yes path) re-triggers the server's preparePlayer
// flow which calls ensurePlayerHasSpawnTerritory and respawns the player if
// they truly have no territory.
//
// Self-contained: mounts on document.body, removes itself on dismiss, and
// does not depend on the HUD render cycle.

let shown = false;

export const maybeShowRuinsPrompt = (): void => {
  if (shown) return;
  if (typeof document === "undefined" || !document.body) return;
  shown = true;

  const overlay = document.createElement("div");
  overlay.setAttribute("role", "presentation");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:9999",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:rgba(8,10,18,0.72)",
    "-webkit-backdrop-filter:blur(2px)",
    "backdrop-filter:blur(2px)"
  ].join(";");

  const card = document.createElement("div");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "ruins-prompt-title");
  card.style.cssText = [
    "max-width:380px",
    "width:calc(100% - 32px)",
    "padding:22px 24px 20px",
    "background:#161b29",
    "color:#e6e9f2",
    "border:1px solid #2a3247",
    "border-radius:10px",
    "box-shadow:0 14px 40px rgba(0,0,0,0.55)",
    "font-family:inherit"
  ].join(";");

  card.innerHTML = `
    <h2 id="ruins-prompt-title" style="margin:0 0 8px;font-size:17px;letter-spacing:0.01em;">
      Maybe your empire is in ruins
    </h2>
    <p style="margin:0 0 18px;color:#9aa6c2;font-size:13px;line-height:1.5;">
      Your gold income has dropped to zero. If your empire has been eliminated,
      you can respawn now to start fresh.
    </p>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button type="button" id="ruins-prompt-dismiss"
        style="padding:8px 14px;background:transparent;border:1px solid #2a3247;color:#9aa6c2;border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px;">
        Dismiss
      </button>
      <button type="button" id="ruins-prompt-respawn"
        style="padding:8px 16px;background:#2a4a8a;border:1px solid #3a5fa8;color:#e6e9f2;border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">
        Respawn now
      </button>
    </div>
  `;

  overlay.appendChild(card);

  const dismiss = (): void => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) dismiss();
  });

  const dismissBtn = card.querySelector<HTMLButtonElement>("#ruins-prompt-dismiss");
  const respawnBtn = card.querySelector<HTMLButtonElement>("#ruins-prompt-respawn");

  if (dismissBtn) dismissBtn.addEventListener("click", dismiss);
  if (respawnBtn) {
    respawnBtn.addEventListener("click", () => {
      window.location.reload();
    });
  }

  document.addEventListener("keydown", function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      dismiss();
      document.removeEventListener("keydown", onKey);
    }
  });

  document.body.appendChild(overlay);
  respawnBtn?.focus();
};
