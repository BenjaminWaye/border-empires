// Pure HTML builders for Space View's chrome: an Influence/Production stat
// pair (the only two resources that mean anything at the galactic layer --
// see design doc §4/§5, nothing else applies here), a Settings entry point,
// and the shared launcher/return button. All other season chrome is
// deliberately absent — Space View strips down to just these plus the
// full-bleed 3D canvas.
//
// The launcher button is single-purpose in both directions: it opens Space
// View from the season HUD, and doubles as the "re-enter season" action
// once inside Space View (see updateLauncherForScreen in client-space-view.ts)
// -- so there is no separate "Return to Season" button in the chrome below.
export const spaceViewLauncherHtml = (): string =>
  `<button type="button" class="sv-launcher" data-space-view-launcher title="Open Space View" aria-label="Open Space View">🌌</button>`;

export const spaceViewStatsHtml = (influence: number, production: number): string => `
  <div class="sv-stat"><span class="sv-stat-value">${influence}</span><span class="sv-stat-label">Influence</span></div>
  <div class="sv-stat"><span class="sv-stat-value">${production}</span><span class="sv-stat-label">Production</span></div>
`;

export const spaceViewChromeHtml = (statsHtml: string): string => `
  <div class="sv-top-bar">
    <div class="sv-stats" data-space-view-stats>${statsHtml}</div>
    <div class="sv-actions">
      <button type="button" class="sv-btn" data-space-view-galaxy-view title="Fly back out to the full galaxy view">🌌 Galaxy View</button>
      <button type="button" class="sv-btn" data-space-view-manage-planet>Manage Planet</button>
      <button type="button" class="sv-btn" data-space-view-senate>Senate</button>
      <button type="button" class="sv-btn" data-space-view-fleets>Fleets</button>
      <button type="button" class="sv-btn" data-space-view-settings>Settings</button>
    </div>
  </div>
  <div class="sv-settings-panel" data-space-view-settings-panel hidden></div>
  <div class="sv-settings-panel" data-space-view-senate-panel hidden></div>
  <div class="sv-settings-panel" data-space-view-fleet-panel hidden></div>
  <canvas class="sv-canvas" data-space-view-canvas></canvas>
`;

// Visual language for the whole galactic layer (this chrome, plus the
// Senate/Fleets panel styles and the intro modal): a steampunk brass/copper
// instrument-panel look -- dark aged leather/gunmetal backgrounds, brass
// (#d69644/#c9a227) and amber-glow (#ffd68f) accents, riveted panel corners
// via .sv-riveted, parchment-cream body text (#fbf3e6/#f0e0c8). Each panel
// (Senate, Fleets) keeps its own accent hue on top of this shared base --
// verdigris-copper for the Senate, forge-copper/orange for Fleets -- so they
// stay visually distinct while reading as one coherent instrument cluster.
export const spaceViewStyle = `
  /* bottom:320px clears the desktop minimap the same way the old galaxy
     overlay's launcher did (see the stacking-order comment atop
     client-galaxy-view.ts: minimap is right:12px/bottom:12px, ~292px tall
     including its toolbar+label) -- this button now also serves as that
     overlay's replacement single entry point, so it sits where that one
     used to. */
  .sv-launcher{position:fixed;right:16px;bottom:320px;z-index:24;width:46px;height:46px;padding:0;margin:0;appearance:none;border-radius:50%;border:2px solid rgba(214,150,68,.55);background:radial-gradient(circle at 35% 30%,rgba(60,42,24,.95),rgba(15,10,6,.95));cursor:pointer;pointer-events:auto;font-size:24px;line-height:1;display:grid;place-items:center;color:#ffd68f;transition:color .15s,transform .15s,background .15s,box-shadow .15s;visibility:visible;box-shadow:0 0 0 3px rgba(0,0,0,.4),0 4px 12px rgba(0,0,0,.5)}
  .sv-launcher:hover{color:#fff3dc;background:radial-gradient(circle at 35% 30%,rgba(90,60,30,.95),rgba(20,13,7,.95));transform:scale(1.12);box-shadow:0 0 0 3px rgba(0,0,0,.4),0 0 18px rgba(255,214,148,.35)}
  /* Descendant selector, not the general-sibling "~" the galaxy overlay's
     .gx-launcher rule uses -- .sv-launcher is mounted as a *child* of #hud
     (see ensureMounted in client-space-view.ts), so "~" would never match
     here even though it happens to for .gx-launcher (a pre-existing,
     out-of-scope quirk left alone in this change). */
  #hud.desktop-side-panel-open .sv-launcher{right:464px}
  @media (max-width: 900px) {
    .sv-launcher{right:8px;bottom:calc(68px + max(8px, env(safe-area-inset-bottom)) + 8px);width:42px;height:42px;font-size:22px}
  }
  /* Mounted as a child of #hud (see the stacking-order comment atop
     client-galaxy-view.ts) so its z-index compares correctly against the
     "Manage Planet" galaxy overlay (.gx-overlay, z-index:29) that can be
     opened from within this screen -- 23 sits above the regular HUD chrome
     it's meant to cover (mini-map-wrap:20, mobile-sheet:21, mobile-nav:22)
     but below .sv-launcher (24, bumped up from its old shared tier of 23
     -- see the comment above) so the "return to season" launcher stays
     clickable on top of the full-screen map, and below that overlay,
     side-panel:25, targeting:27 and auth:30, so none of those get buried
     behind Space View either.
     visibility/pointer-events are re-declared here for the same reason
     .gx-overlay re-declares them: #hud sets visibility:hidden and
     pointer-events:none on itself while Space View is open (see
     setScreenVisible below), and both properties are inherited, so a
     descendant needs its own explicit value to opt back in. */
  .sv-screen{position:fixed;inset:0;z-index:23;background:#050302;display:flex;flex-direction:column;visibility:visible;pointer-events:auto}
  .sv-screen[hidden]{display:none}
  .sv-top-bar{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:linear-gradient(180deg,rgba(26,18,11,.92),rgba(15,10,6,.88));border-bottom:2px solid rgba(214,150,68,.32);box-shadow:0 2px 12px rgba(0,0,0,.4);flex-wrap:wrap}
  .sv-stats{display:flex;gap:16px}
  .sv-stat{display:flex;flex-direction:column;align-items:flex-start;line-height:1.2}
  .sv-stat-value{color:#ffd68f;font-size:16px;font-weight:700;text-shadow:0 0 8px rgba(255,214,148,.25)}
  .sv-stat-label{color:#b9926a;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
  .sv-actions{display:flex;gap:8px;flex-wrap:wrap}
  .sv-btn{border:1px solid rgba(214,150,68,.4);background:linear-gradient(180deg,rgba(45,32,18,.85),rgba(24,17,10,.85));color:#f0e0c8;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}
  .sv-btn:hover{border-color:rgba(255,214,148,.65);background:linear-gradient(180deg,rgba(65,46,26,.9),rgba(34,24,14,.9));box-shadow:0 0 10px rgba(214,150,68,.2)}
  .sv-settings-panel{position:absolute;top:56px;right:16px;z-index:3;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;background:linear-gradient(180deg,rgba(22,15,9,.97),rgba(12,8,5,.97));border:1px solid rgba(214,150,68,.3);border-radius:10px;padding:16px;box-shadow:0 18px 48px rgba(0,0,0,.5)}
  .sv-settings-panel[hidden]{display:none}
  .sv-canvas{flex:1;display:block;width:100%;height:100%;touch-action:none}
  /* Small brass "rivet" corner dots -- opt in per-panel with class="... sv-riveted" on a
     positioned (relative/absolute/fixed) container; reused by the Senate/Fleets panels. */
  .sv-riveted{position:relative}
  .sv-riveted::before,.sv-riveted::after{content:"";position:absolute;top:8px;width:5px;height:5px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f3d9a8,#8a5f2c);box-shadow:0 1px 2px rgba(0,0,0,.5)}
  .sv-riveted::before{left:8px}
  .sv-riveted::after{right:8px}
`;
