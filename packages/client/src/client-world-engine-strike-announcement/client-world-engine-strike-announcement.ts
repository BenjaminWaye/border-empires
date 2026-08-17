export type WorldEngineStrikeTownPopulationTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
type TownPopulationTier = WorldEngineStrikeTownPopulationTier;

export type WorldEngineStrikeAnnouncementInfo = {
  x: number;
  y: number;
  townName: string;
  populationTier: TownPopulationTier;
  populationLost: number;
  casterName: string;
  targetOwnerName: string;
  onJumpToTarget: () => void;
};

const tierLabel = (tier: TownPopulationTier): string =>
  tier === "METROPOLIS" ? "Monumental City"
    : tier === "GREAT_CITY" ? "Great City"
    : tier === "SETTLEMENT" ? "Settlement"
    : tier === "TOWN" ? "Town"
    : "City";

// Destruction-themed sibling of client-town-capture.ts's "Town Captured"
// overlay — same structure/conventions (own id, own injected <style>, inline
// SVG hero art, dismiss + jump-to button) but grim instead of triumphant,
// shown to every player when a WORLD_ENGINE_STRIKE_ANNOUNCEMENT broadcast
// arrives live (never replayed from 12h history — see client-network.ts).
export const showWorldEngineStrikeOverlay = (info: WorldEngineStrikeAnnouncementInfo): void => {
  const existing = document.getElementById("world-engine-strike-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "world-engine-strike-overlay";
  overlay.innerHTML = overlayHtml(info);

  injectStyles();
  document.body.appendChild(overlay);

  overlay.style.display = "grid";

  const dismiss = (): void => {
    overlay.remove();
  };

  overlay.querySelector("#world-engine-strike-close")?.addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });
  overlay.querySelector("#world-engine-strike-jump")?.addEventListener("click", () => {
    info.onJumpToTarget();
    dismiss();
  });
};

const overlayHtml = (info: WorldEngineStrikeAnnouncementInfo): string => {
  const tier = tierLabel(info.populationTier);
  const townName = info.townName || tier;
  const lossLabel = Math.round(info.populationLost).toLocaleString();

  return `
    <div id="world-engine-strike-backdrop"></div>
    <div id="world-engine-strike-modal">
      <div id="world-engine-strike-hero">${artSvg}
        <div id="world-engine-strike-hero-fade"></div>
        <div id="world-engine-strike-eyebrow">World Engine Strike</div>
        <div id="world-engine-strike-name">${escapeHtml(townName)}</div>
        <div id="world-engine-strike-meta">${escapeHtml(tier)} &middot; (${info.x}, ${info.y})</div>
      </div>
      <button id="world-engine-strike-close" class="world-engine-strike-close-btn" type="button" aria-label="Close">&#10005;</button>
      <div id="world-engine-strike-body">
        <div id="world-engine-strike-owner"><strong>${escapeHtml(info.casterName)}</strong> unleashed the World Engine on <strong>${escapeHtml(info.targetOwnerName)}</strong>'s city</div>
        <div id="world-engine-strike-stats" class="world-engine-strike-stats-single">
          <div class="world-engine-strike-stat">
            <div class="world-engine-strike-stat-label">Lives Lost</div>
            <div class="world-engine-strike-stat-value">${lossLabel}</div>
          </div>
        </div>
        <button id="world-engine-strike-jump" class="world-engine-strike-jump-btn" type="button">Jump to Target</button>
      </div>
    </div>`;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

let injected = false;
const injectStyles = (): void => {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);
};

const styles = `
#world-engine-strike-overlay {
  position: fixed; inset: 0; display: none; place-items: center; padding: 16px; z-index: 32;
}
#world-engine-strike-backdrop {
  position: absolute; inset: 0; background: rgba(6, 3, 2, 0.78); backdrop-filter: blur(4px);
}
#world-engine-strike-modal {
  position: relative; display: grid; grid-template-rows: auto auto;
  width: min(520px, calc(100vw - 32px)); border-radius: 20px; overflow: hidden;
  border: 1px solid rgba(255, 85, 51, 0.32);
  background: linear-gradient(180deg, rgba(21,12,6,0.98), rgba(10,6,4,0.98));
  box-shadow: 0 28px 80px rgba(0,0,0,0.6), 0 0 60px rgba(255,85,51,0.16);
  color: #fbe6e0;
  animation: worldEngineStrikeEnter 0.4s cubic-bezier(0.16,1,0.3,1) both;
}
#world-engine-strike-hero { position: relative; width: 100%; height: 168px; overflow: hidden; }
#world-engine-strike-hero svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#world-engine-strike-hero-fade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(21,10,6,0) 40%, rgba(10,6,4,0.92) 100%);
}
#world-engine-strike-eyebrow {
  position: absolute; left: 20px; top: 16px; font-size: 11px; font-weight: 800; letter-spacing: 0.18em;
  text-transform: uppercase; color: rgba(255, 158, 130, 0.92);
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}
#world-engine-strike-name {
  position: absolute; left: 20px; bottom: 30px; right: 20px; font-size: 24px; font-weight: 800;
  letter-spacing: -0.02em; line-height: 1.1; text-shadow: 0 2px 10px rgba(0,0,0,0.7);
}
#world-engine-strike-meta {
  position: absolute; left: 20px; bottom: 12px; font-size: 12.5px; font-weight: 600;
  color: rgba(255, 214, 197, 0.86); text-shadow: 0 2px 8px rgba(0,0,0,0.7);
}
.world-engine-strike-close-btn {
  position: absolute; top: 12px; right: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 999px;
  border: 1px solid rgba(255,158,130,0.4); background: rgba(21,10,6,0.56);
  color: #fbe6e0; font-size: 13px; font-weight: 800; line-height: 1; cursor: pointer;
}
.world-engine-strike-close-btn:hover { background: rgba(35,16,10,0.78); }
#world-engine-strike-body { display: grid; gap: 14px; padding: 18px 22px 22px; }
#world-engine-strike-owner {
  font-size: 14px; color: rgba(240, 210, 200, 0.86);
}
#world-engine-strike-owner strong { color: #ff9e82; font-weight: 800; }
#world-engine-strike-stats.world-engine-strike-stats-single {
  display: grid; grid-template-columns: 1fr; gap: 10px;
}
.world-engine-strike-stat {
  display: grid; gap: 4px; padding: 10px 12px; border-radius: 12px;
  border: 1px solid rgba(255, 85, 51, 0.24); background: rgba(255, 85, 51, 0.08);
}
.world-engine-strike-stat-label {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: rgba(255, 190, 170, 0.72);
}
.world-engine-strike-stat-value { font-size: 20px; font-weight: 800; color: #ffb199; }
.world-engine-strike-jump-btn {
  justify-self: start; padding: 10px 18px; border-radius: 12px; border: 1px solid rgba(255,158,130,0.5);
  background: linear-gradient(180deg, rgba(255,110,80,0.24), rgba(180,50,30,0.16));
  color: #ffe0d4; font-size: 13.5px; font-weight: 800; cursor: pointer;
}
.world-engine-strike-jump-btn:hover { background: linear-gradient(180deg, rgba(255,110,80,0.34), rgba(180,50,30,0.24)); }
@media (max-width: 520px) {
  #world-engine-strike-hero { height: 140px; }
  #world-engine-strike-name { font-size: 20px; }
  .world-engine-strike-stat-value { font-size: 17px; }
}
@keyframes worldEngineStrikeEnter {
  0% { opacity: 0; transform: scale(0.9) translateY(14px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}`;

// Same 520x168 skyline skeleton as client-town-capture.ts's artSvg, recolored
// to a dark ember/ash palette (echoing the in-world strike FX's #ff5533) with
// collapsed rooflines and rising smoke instead of an intact sunset skyline.
const artSvg = `<svg viewBox="0 0 520 168" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wesSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#160b08"/>
      <stop offset="55%" stop-color="#3a1408"/>
      <stop offset="100%" stop-color="#7a2a12"/>
    </linearGradient>
    <radialGradient id="wesBlast" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffcf9e"/>
      <stop offset="45%" stop-color="#ff5533" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ff5533" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="520" height="168" fill="url(#wesSky)"/>
  <circle cx="360" cy="70" r="90" fill="url(#wesBlast)"/>
  <circle cx="360" cy="70" r="16" fill="#ffe3c2" opacity="0.9"/>
  <g stroke="#4a2213" stroke-width="4" opacity="0.6">
    <path d="M330 30 Q340 8 320 -6" />
    <path d="M300 40 Q296 14 278 4" />
    <path d="M400 46 Q412 20 434 12" />
  </g>
  <path d="M0 118 Q120 100 260 114 T520 104 V168 H0 Z" fill="#150b06" opacity="0.92"/>
  <g fill="#0e0704">
    <rect x="24" y="108" width="34" height="32" transform="rotate(-4 41 124)"/>
    <rect x="66" y="118" width="26" height="22" transform="rotate(3 79 129)"/>
    <polygon points="114,140 152,140 148,96 130,84 108,100"/>
    <rect x="154" y="116" width="22" height="24" transform="rotate(-6 165 128)"/>
    <polygon points="205,140 236,140 228,74 214,66 198,96"/>
    <rect x="238" y="112" width="30" height="28" transform="rotate(5 253 126)"/>
    <polygon points="296,140 330,140 322,92 306,80 292,104"/>
    <rect x="330" y="120" width="22" height="20" transform="rotate(-3 341 130)"/>
    <rect x="360" y="110" width="28" height="30" transform="rotate(4 374 125)"/>
  </g>
  <g stroke="#0a0503" stroke-width="3" fill="none" opacity="0.85">
    <path d="M30 108 V84"/>
    <path d="M340 120 V98"/>
  </g>
  <g fill="#3a2013" opacity="0.55">
    <path d="M132 90 Q124 60 138 34" stroke="#4a2a18" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M216 68 Q206 36 222 8" stroke="#4a2a18" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M308 84 Q300 54 314 26" stroke="#4a2a18" stroke-width="6" fill="none" stroke-linecap="round"/>
  </g>
  <path d="M0 150 Q140 132 260 146 T520 136 V168 H0 Z" fill="#0a0503"/>
</svg>`;
