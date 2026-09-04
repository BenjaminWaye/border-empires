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
      <button type="button" class="sv-btn" data-space-view-manage-planet>Manage Planet</button>
      <button type="button" class="sv-btn" data-space-view-settings>Settings</button>
    </div>
  </div>
  <div class="sv-settings-panel" data-space-view-settings-panel hidden></div>
  <canvas class="sv-canvas" data-space-view-canvas></canvas>
`;

export const spaceViewStyle = `
  /* bottom:320px clears the desktop minimap the same way the old galaxy
     overlay's launcher did (see the stacking-order comment atop
     client-galaxy-view.ts: minimap is right:12px/bottom:12px, ~292px tall
     including its toolbar+label) -- this button now also serves as that
     overlay's replacement single entry point, so it sits where that one
     used to. */
  .sv-launcher{position:fixed;right:16px;bottom:320px;z-index:24;width:44px;height:44px;padding:0;margin:0;appearance:none;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(3,7,14,.85);cursor:pointer;pointer-events:auto;font-size:24px;line-height:1;display:grid;place-items:center;color:#94a3b8;transition:color .15s,transform .15s,background .15s;visibility:visible}
  .sv-launcher:hover{color:#f1f5f9;background:rgba(11,19,32,.9);transform:scale(1.15)}
  /* Descendant selector, not the general-sibling "~" the galaxy overlay's
     .gx-launcher rule uses -- .sv-launcher is mounted as a *child* of #hud
     (see ensureMounted in client-space-view.ts), so "~" would never match
     here even though it happens to for .gx-launcher (a pre-existing,
     out-of-scope quirk left alone in this change). */
  #hud.desktop-side-panel-open .sv-launcher{right:464px}
  @media (max-width: 900px) {
    .sv-launcher{right:8px;bottom:calc(68px + max(8px, env(safe-area-inset-bottom)) + 8px);width:40px;height:40px;font-size:22px}
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
  .sv-screen{position:fixed;inset:0;z-index:23;background:#030712;display:flex;flex-direction:column;visibility:visible;pointer-events:auto}
  .sv-screen[hidden]{display:none}
  .sv-top-bar{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:rgba(3,7,14,.72);border-bottom:1px solid rgba(255,255,255,.1);flex-wrap:wrap}
  .sv-stats{display:flex;gap:16px}
  .sv-stat{display:flex;flex-direction:column;align-items:flex-start;line-height:1.2}
  .sv-stat-value{color:#f8fafc;font-size:16px;font-weight:700}
  .sv-stat-label{color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .sv-actions{display:flex;gap:8px}
  .sv-btn{border:1px solid rgba(255,255,255,.18);background:rgba(15,23,42,.7);color:#e2e8f0;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer}
  .sv-btn:hover{background:rgba(30,41,59,.85)}
  .sv-settings-panel{position:absolute;top:56px;right:16px;z-index:3;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;background:rgba(8,12,24,.97);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:16px}
  .sv-settings-panel[hidden]{display:none}
  .sv-canvas{flex:1;display:block;width:100%;height:100%;touch-action:none}
`;
