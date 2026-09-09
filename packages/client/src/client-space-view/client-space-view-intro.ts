// First-visit briefing modal for Space View: what the galactic meta-layer
// actually is and what to do here, shown once (persisted via the same
// server-synced hint storage discovery tips use -- see
// client-discovery-tips-storage.ts's isDiscoveryTipSeen/markDiscoveryTipSeen,
// called directly with a dedicated "GALAXY_INTRO" id rather than going
// through the small corner-toast component, since this needs real
// paragraph-length content a toast can't hold).
export const SPACE_VIEW_INTRO_TIP_ID = "GALAXY_INTRO";

type IntroSection = { icon: string; title: string; body: string };

const INTRO_SECTIONS: IntroSection[] = [
  {
    icon: "🌌",
    title: "What this is",
    body: "Winning a Sector campaign earns your empire a permanent Planet or Outpost here, in the galaxy above the seasons. This layer persists forever -- nothing here resets when a season ends."
  },
  {
    icon: "⚙️",
    title: "Your economy",
    body: "Every held world trickles Influence and Production once per Cycle (one real week). Production builds Fleets and arms your Garrisons. Influence funds the Senate and your empire's upkeep -- let it run dry and your weakest world's Stability starts to crumble."
  },
  {
    icon: "🏛️",
    title: "The Senate",
    body: "Raise EMBARGO or CONTEST against a rival, or vote on proposals already in motion. Your vote's weight comes from your total Dominion across every world you hold."
  },
  {
    icon: "🚀",
    title: "Fleets",
    body: "Assemble Scouts, Raiders, Battleline, Dreadnoughts, and Tankers. Send them to raid a rival's Stability, garrison one at home for defense, or scout ahead to reveal what a target is hiding. Building a fleet takes real time -- bigger fleets take longer."
  },
  {
    icon: "🛡️",
    title: "Defense",
    body: "Invest Production into a territory's Garrison to blunt incoming raids. A pulsing red ring means a raid is already inbound -- you won't know who's coming or what they're bringing until it lands."
  },
  {
    icon: "🧭",
    title: "Finding your way",
    body: "Click any system to fly there and orbit/zoom freely around it. Click it again to descend into its Sector. Click empty space, or the Galaxy View button, to pull back out to the stars."
  }
];

const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

export const spaceViewIntroHtml = (): string => `
  <div class="sv-intro-backdrop" data-space-view-intro>
    <div class="sv-intro-card" role="dialog" aria-modal="true" aria-labelledby="sv-intro-title">
      <h2 class="sv-intro-heading" id="sv-intro-title">📜 Voyager's Briefing: The Galactic Frontier</h2>
      <div class="sv-intro-sections">
        ${INTRO_SECTIONS.map(
          (s) => `
          <div class="sv-intro-section">
            <span class="sv-intro-icon">${s.icon}</span>
            <div>
              <div class="sv-intro-section-title">${escapeHtml(s.title)}</div>
              <p class="sv-intro-section-body">${escapeHtml(s.body)}</p>
            </div>
          </div>`
        ).join("")}
      </div>
      <button type="button" class="sv-btn sv-intro-dismiss" data-space-view-intro-dismiss>Chart a course →</button>
    </div>
  </div>
`;

export const spaceViewIntroStyle = `
  .sv-intro-backdrop{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(5,3,2,.8);backdrop-filter:blur(2px)}
  .sv-intro-card{width:min(560px,100%);max-height:calc(100vh - 96px);overflow:auto;background:linear-gradient(180deg,rgba(24,17,10,.98),rgba(14,10,6,.98));border:1px solid rgba(230,178,106,.32);border-radius:16px;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,.5),0 0 48px rgba(214,150,68,.14)}
  .sv-intro-heading{margin:0 0 16px;color:#ffd68f;font-size:17px;letter-spacing:-.01em}
  .sv-intro-sections{display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
  .sv-intro-section{display:flex;gap:12px;align-items:flex-start}
  .sv-intro-icon{font-size:20px;line-height:1.4}
  .sv-intro-section-title{color:#fbf3e6;font-weight:700;font-size:13px;margin-bottom:2px}
  .sv-intro-section-body{margin:0;color:rgba(240,224,200,.86);font-size:12.5px;line-height:1.5}
  .sv-intro-dismiss{width:100%;border-color:rgba(255,214,148,.5);background:linear-gradient(180deg,rgba(255,214,148,.22),rgba(214,150,68,.14));color:#ffe6b8;font-weight:700;padding:10px}
  .sv-intro-dismiss:hover{background:linear-gradient(180deg,rgba(255,214,148,.32),rgba(214,150,68,.22))}
`;
