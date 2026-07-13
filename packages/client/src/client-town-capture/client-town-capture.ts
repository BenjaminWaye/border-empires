import { manpowerRegenWeightForSettlementIndex, TOWN_MANPOWER_BY_TIER } from "@border-empires/shared";

type TownPopulationTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";

export type TownCaptureInfo = {
  x: number;
  y: number;
  townName: string;
  populationTier: TownPopulationTier;
  population: number;
  maxPopulation: number;
  empireName: string;
  /** Count of the player's other already-settled towns, used to estimate manpower regen weight. */
  ownedTownCount: number;
  onJumpToTown: () => void;
};

const tierLabel = (tier: TownPopulationTier): string =>
  tier === "METROPOLIS" ? "Monumental City"
    : tier === "GREAT_CITY" ? "Great City"
    : tier === "SETTLEMENT" ? "Settlement"
    : tier === "TOWN" ? "Town"
    : "City";

export const showTownCaptureOverlay = (info: TownCaptureInfo): void => {
  const existing = document.getElementById("town-capture-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "town-capture-overlay";
  overlay.innerHTML = overlayHtml(info);

  injectStyles();
  document.body.appendChild(overlay);

  overlay.style.display = "grid";

  const dismiss = (): void => {
    overlay.remove();
  };

  overlay.querySelector("#town-capture-close")?.addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });
  overlay.querySelector("#town-capture-jump")?.addEventListener("click", () => {
    info.onJumpToTown();
    dismiss();
  });
};

const overlayHtml = (info: TownCaptureInfo): string => {
  const tier = tierLabel(info.populationTier);
  const tierMeta = TOWN_MANPOWER_BY_TIER[info.populationTier];
  const manpowerCapAdded = tierMeta.cap;
  const manpowerRegenAdded = tierMeta.regenPerMinute * manpowerRegenWeightForSettlementIndex(info.ownedTownCount);
  const townName = info.townName || tier;
  const populationLabel = Math.round(info.population).toLocaleString();
  const maxPopulationLabel = Math.round(info.maxPopulation).toLocaleString();

  return `
    <div id="town-capture-backdrop"></div>
    <div id="town-capture-modal">
      <div id="town-capture-hero">${artSvg}
        <div id="town-capture-hero-fade"></div>
        <div id="town-capture-eyebrow">Town Captured</div>
        <div id="town-capture-name">${escapeHtml(townName)}</div>
        <div id="town-capture-meta">${escapeHtml(tier)} &middot; (${info.x}, ${info.y})</div>
      </div>
      <button id="town-capture-close" class="town-capture-close-btn" type="button" aria-label="Close">&#10005;</button>
      <div id="town-capture-body">
        <div id="town-capture-owner">Now belongs to <strong>${escapeHtml(info.empireName)}</strong></div>
        <div id="town-capture-stats">
          <div class="town-capture-stat">
            <div class="town-capture-stat-label">Population</div>
            <div class="town-capture-stat-value">${populationLabel}<span class="town-capture-stat-suffix">/${maxPopulationLabel}</span></div>
          </div>
          <div class="town-capture-stat">
            <div class="town-capture-stat-label">Manpower Cap</div>
            <div class="town-capture-stat-value town-capture-stat-positive">+${manpowerCapAdded.toLocaleString()}</div>
          </div>
          <div class="town-capture-stat">
            <div class="town-capture-stat-label">Manpower Regen</div>
            <div class="town-capture-stat-value town-capture-stat-positive">+${manpowerRegenAdded.toFixed(2)}<span class="town-capture-stat-suffix">/m</span></div>
          </div>
        </div>
        <div id="town-capture-note">Full gold production and these manpower gains begin once the town is settled and connected to supporting territory.</div>
        <button id="town-capture-jump" class="town-capture-jump-btn" type="button">Jump to Town</button>
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
#town-capture-overlay {
  position: fixed; inset: 0; display: none; place-items: center; padding: 16px; z-index: 32;
}
#town-capture-backdrop {
  position: absolute; inset: 0; background: rgba(10, 6, 1, 0.72); backdrop-filter: blur(4px);
}
#town-capture-modal {
  position: relative; display: grid; grid-template-rows: auto auto;
  width: min(520px, calc(100vw - 32px)); border-radius: 20px; overflow: hidden;
  border: 1px solid rgba(230, 178, 106, 0.32);
  background: linear-gradient(180deg, rgba(24,17,10,0.98), rgba(14,10,6,0.98));
  box-shadow: 0 28px 80px rgba(0,0,0,0.5), 0 0 60px rgba(214,150,68,0.14);
  color: #fbf3e6;
  animation: townCaptureEnter 0.4s cubic-bezier(0.16,1,0.3,1) both;
}
#town-capture-hero { position: relative; width: 100%; height: 168px; overflow: hidden; }
#town-capture-hero svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#town-capture-hero-fade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(20,13,6,0) 40%, rgba(15,10,5,0.92) 100%);
}
#town-capture-eyebrow {
  position: absolute; left: 20px; top: 16px; font-size: 11px; font-weight: 800; letter-spacing: 0.18em;
  text-transform: uppercase; color: rgba(255, 214, 148, 0.92);
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}
#town-capture-name {
  position: absolute; left: 20px; bottom: 30px; right: 20px; font-size: 24px; font-weight: 800;
  letter-spacing: -0.02em; line-height: 1.1; text-shadow: 0 2px 10px rgba(0,0,0,0.7);
}
#town-capture-meta {
  position: absolute; left: 20px; bottom: 12px; font-size: 12.5px; font-weight: 600;
  color: rgba(255, 232, 197, 0.86); text-shadow: 0 2px 8px rgba(0,0,0,0.7);
}
.town-capture-close-btn {
  position: absolute; top: 12px; right: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 999px;
  border: 1px solid rgba(255,224,180,0.4); background: rgba(20,13,6,0.56);
  color: #fbf3e6; font-size: 13px; font-weight: 800; line-height: 1; cursor: pointer;
}
.town-capture-close-btn:hover { background: rgba(30,20,10,0.78); }
#town-capture-body { display: grid; gap: 14px; padding: 18px 22px 22px; }
#town-capture-owner {
  font-size: 14px; color: rgba(240, 224, 200, 0.86);
}
#town-capture-owner strong { color: #ffd68f; font-weight: 800; }
#town-capture-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}
.town-capture-stat {
  display: grid; gap: 4px; padding: 10px 12px; border-radius: 12px;
  border: 1px solid rgba(230, 178, 106, 0.2); background: rgba(255, 214, 148, 0.06);
}
.town-capture-stat-label {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: rgba(230, 200, 160, 0.72);
}
.town-capture-stat-value { font-size: 16px; font-weight: 800; color: #fbf3e6; }
.town-capture-stat-suffix { font-size: 11px; font-weight: 600; color: rgba(240,224,200,0.6); margin-left: 1px; }
.town-capture-stat-positive { color: #a9e8a0; }
#town-capture-note {
  font-size: 12.5px; line-height: 1.5; color: rgba(230, 214, 195, 0.7);
}
.town-capture-jump-btn {
  justify-self: start; padding: 10px 18px; border-radius: 12px; border: 1px solid rgba(255,214,148,0.5);
  background: linear-gradient(180deg, rgba(255,214,148,0.22), rgba(214,150,68,0.14));
  color: #ffe6b8; font-size: 13.5px; font-weight: 800; cursor: pointer;
}
.town-capture-jump-btn:hover { background: linear-gradient(180deg, rgba(255,214,148,0.32), rgba(214,150,68,0.22)); }
@media (max-width: 520px) {
  #town-capture-hero { height: 140px; }
  #town-capture-name { font-size: 20px; }
  #town-capture-stats { grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .town-capture-stat { padding: 8px 8px; }
  .town-capture-stat-value { font-size: 14px; }
}
@keyframes townCaptureEnter {
  0% { opacity: 0; transform: scale(0.9) translateY(14px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}`;

const artSvg = `<svg viewBox="0 0 520 168" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tcSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a2413"/>
      <stop offset="55%" stop-color="#7a4a24"/>
      <stop offset="100%" stop-color="#c9863f"/>
    </linearGradient>
    <radialGradient id="tcSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe6a8"/>
      <stop offset="100%" stop-color="#ffbb5c" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="520" height="168" fill="url(#tcSky)"/>
  <circle cx="410" cy="52" r="60" fill="url(#tcSun)"/>
  <circle cx="410" cy="52" r="22" fill="#ffe3a3" opacity="0.9"/>
  <g stroke="#ffe3a3" stroke-width="3" opacity="0.55">
    <line x1="410" y1="18" x2="410" y2="6"/>
    <line x1="410" y1="86" x2="410" y2="98"/>
    <line x1="378" y1="52" x2="366" y2="52"/>
    <line x1="442" y1="52" x2="454" y2="52"/>
    <line x1="386" y1="28" x2="378" y2="20"/>
    <line x1="434" y1="76" x2="442" y2="84"/>
    <line x1="434" y1="28" x2="442" y2="20"/>
    <line x1="386" y1="76" x2="378" y2="84"/>
  </g>
  <path d="M0 118 Q120 96 260 112 T520 100 V168 H0 Z" fill="#2a1a0d" opacity="0.9"/>
  <g fill="#1c110a">
    <rect x="24" y="96" width="34" height="44" />
    <polygon points="20,96 62,96 41,76" />
    <rect x="66" y="108" width="26" height="32" />
    <polygon points="63,108 95,108 79,92" />
    <rect x="118" y="86" width="30" height="54" />
    <polygon points="114,86 152,86 133,64" />
    <rect x="154" y="102" width="22" height="38" />
    <circle cx="165" cy="94" r="9" fill="none" stroke="#1c110a" stroke-width="3"/>
    <rect x="212" y="70" width="20" height="70" />
    <polygon points="207,70 237,70 222,50" />
    <rect x="238" y="98" width="30" height="42" />
    <polygon points="234,98 272,98 253,80" />
    <rect x="300" y="90" width="26" height="50" />
    <polygon points="296,90 330,90 313,70" />
    <rect x="330" y="106" width="22" height="34" />
    <rect x="360" y="94" width="28" height="46" />
    <polygon points="356,94 392,94 374,74" />
  </g>
  <g stroke="#0f0904" stroke-width="3" fill="none" opacity="0.85">
    <path d="M30 96 V70"/>
    <path d="M76 108 V88"/>
    <path d="M340 106 V82"/>
  </g>
  <g fill="#0f0904" opacity="0.5">
    <ellipse cx="30" cy="64" rx="9" ry="5"/>
    <ellipse cx="76" cy="82" rx="8" ry="4"/>
    <ellipse cx="340" cy="76" rx="9" ry="5"/>
  </g>
  <g fill="#0f0904" opacity="0.75">
    <circle cx="222" cy="62" r="5"/>
    <circle cx="165" cy="94" r="2.4"/>
  </g>
  <path d="M0 150 Q140 130 260 146 T520 134 V168 H0 Z" fill="#150c06"/>
</svg>`;
