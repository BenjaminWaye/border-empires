// Pure render function for the Phase 0 "galaxy" view: your named planet(s),
// centered in a decorative starfield. See docs/agents (galactic meta-layer
// plan) for the full feature context. Stars here are purely cosmetic — no
// other empires are represented yet.
export type GalaxyViewPlanet = {
  seasonId: string;
  seasonSequence: number;
  objectiveName: string;
  // Optional rather than required: seasons persisted before this field
  // existed (an old SeasonArchiveRow) have no specialization computed yet,
  // and a client build newer than a not-yet-redeployed gateway would
  // otherwise render "undefined". Absent renders no badge at all.
  specialization?: string;
  crownedAt: number;
  planetName: string | null;
  named: boolean;
  // Galactic meta-layer v1 (docs/galactic-campaign-design.md §7): 0-100,
  // absent when the gateway has no galaxyEconomyStore wired up yet (older
  // deploys / v0-only servers) — renders no Stability readout in that case.
  stability?: number;
};

// Galactic meta-layer v0 Outpost/Stipend tiers (docs/galactic-campaign-design.md
// §3): a minor permanent holding (Outpost, specialized like a Planet) or a
// one-time Inf/Prod payout with no territory (Stipend). Kept deliberately
// simple for v0 — a flat list below the hero planet/switcher, not a second
// starfield hero.
export type GalaxyViewOutpost = {
  seasonId: string;
  seasonSequence: number;
  specialization?: string;
  awardedAt: number;
  stability?: number;
};

export type GalaxyViewStipend = {
  seasonId: string;
  seasonSequence: number;
  influence: number;
  production: number;
  awardedAt: number;
};

// Galactic meta-layer v1 (docs/galactic-campaign-design.md §4): the player's
// current Influence/Production balance, absent under the same "gateway not
// wired up yet" condition as GalaxyViewPlanet.stability above.
export type GalaxyViewEconomy = { influence: number; production: number };

export type GalaxyViewModel = {
  planets: GalaxyViewPlanet[];
  focusedSeasonId: string;
  outposts?: GalaxyViewOutpost[];
  stipends?: GalaxyViewStipend[];
  economy?: GalaxyViewEconomy;
};

// Phase 1: the "Emperor" (winner of the most recently ended season) can
// endorse another player during a one-hour post-season window. See
// apps/realtime-gateway/src/galaxy-endorsement-routes for the server side.
export type GalaxyEmperorViewModel = {
  emperor: { playerId: string; endedSeasonId: string; crownedAt: number } | null;
  windowOpenUntil: number | null;
  endorsement: { targetPlayerId: string; createdAt: number } | null;
  isEmperor: boolean;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );

const crownedDateLabel = (crownedAt: number): string =>
  new Date(crownedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// Display names for GalaxySpecialization (@border-empires/sim-protocol's
// GALAXY_SPECIALIZATION_NAME) — kept as a local copy rather than a runtime
// dependency on sim-protocol (which would drag its client-protocol/zod
// dependency graph into the client bundle just for a label lookup), but
// pinned against the real source of truth by galaxy-view-html.test.ts so the
// two cannot silently drift. Falls back to the raw value for a
// specialization id introduced server-side before the client knows its label.
export const SPECIALIZATION_LABEL: Record<string, string> = {
  INDUSTRIAL: "Industrial",
  TRADE: "Trade",
  EXTRACTION: "Extraction",
  LOGISTICS: "Logistics",
  CAPITAL: "Capital"
};

// Minimal Stability readout (§7): a number + a filled bar, no color coding
// or drain/recovery detail — that's downstream of this slice (Defense
// Campaigns aren't built yet, so there's nothing more to explain here).
const stabilityHtml = (stability: number | undefined): string => {
  if (stability === undefined) return "";
  const clamped = Math.max(0, Math.min(100, stability));
  return `
    <div class="gx-stability" data-galaxy-stability title="Stability ${clamped}/100">
      <span class="gx-stability-label">Stability ${clamped}</span>
      <span class="gx-stability-bar"><span class="gx-stability-fill" style="width:${clamped}%"></span></span>
    </div>`;
};

const economyHtml = (economy: GalaxyViewEconomy | undefined): string => {
  if (!economy) return "";
  return `
    <div class="gx-economy" data-galaxy-economy>
      <span class="gx-economy-item" data-galaxy-influence>${economy.influence} Inf</span>
      <span class="gx-economy-item" data-galaxy-production>${economy.production} Prod</span>
    </div>`;
};

const specializationBadgeHtml = (specialization: string | undefined): string => {
  if (!specialization) return "";
  const label = SPECIALIZATION_LABEL[specialization] ?? specialization;
  return `<p class="gx-specialization" data-galaxy-specialization>${escapeHtml(label)} World</p>`;
};

// Purely decorative rotating planet figure (bands spin via CSS animation;
// the ring and shading layers stay static for a simple "gas giant" look).
// Shared by both the unnamed and named states so a world always feels like a
// real place, even before it has a name.
const planetFigureHtml = (): string => `
  <div class="gx-planet-figure" aria-hidden="true">
    <div class="gx-ring"></div>
    <div class="gx-orb">
      <div class="gx-orb-bands"></div>
      <div class="gx-orb-shade"></div>
    </div>
  </div>`;

const christenFormHtml = (planet: GalaxyViewPlanet): string => `
  <div class="gx-christen" data-galaxy-christen data-season-id="${escapeHtml(planet.seasonId)}">
    <p class="gx-kicker">Unnamed World</p>
    ${planetFigureHtml()}
    ${specializationBadgeHtml(planet.specialization)}
    <p class="gx-christen-copy">You won this season's crown. Name your planet — this cannot be changed later.</p>
    <form data-galaxy-christen-form>
      <input
        type="text"
        name="planetName"
        maxlength="24"
        minlength="2"
        placeholder="Name your planet"
        data-galaxy-name-input
        required
      />
      <button type="submit" data-galaxy-christen-submit>Christen Planet</button>
    </form>
    <p class="gx-christen-error" data-galaxy-christen-error hidden></p>
  </div>`;

const namedMedallionHtml = (planet: GalaxyViewPlanet): string => `
  <div class="gx-planet" data-galaxy-planet>
    <p class="gx-kicker">Your World</p>
    ${planetFigureHtml()}
    <p class="gx-planet-name">${escapeHtml(planet.planetName ?? "")}</p>
    ${specializationBadgeHtml(planet.specialization)}
    <p class="gx-planet-meta">Crowned via ${escapeHtml(planet.objectiveName)} · ${crownedDateLabel(planet.crownedAt)}</p>
    ${stabilityHtml(planet.stability)}
  </div>`;

const switcherHtml = (planets: GalaxyViewPlanet[], focusedSeasonId: string): string => {
  if (planets.length <= 1) return "";
  const rows = planets
    .map((planet) => {
      const label = planet.planetName ?? `Season ${planet.seasonSequence}`;
      const active = planet.seasonId === focusedSeasonId;
      return `
        <button type="button" class="gx-switcher-item${active ? " is-active" : ""}" data-galaxy-focus="${escapeHtml(planet.seasonId)}">
          ${escapeHtml(label)}
        </button>`;
    })
    .join("");
  return `<nav class="gx-switcher" role="tablist" aria-label="Your planets">${rows}</nav>`;
};

// Formats the time remaining until the endorsement window closes as m:ss.
// Reads the current time internally (like crownedDateLabel reads locale
// formatting internally) — callers just re-render on an interval to keep it
// ticking.
const endorseCountdownLabel = (windowOpenUntil: number): string => {
  const remainingMs = Math.max(0, windowOpenUntil - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Empty when there is no active Emperor window, or the viewer isn't the
// Emperor — non-Emperors and players outside the post-season window see
// nothing here.
export const renderEmperorSectionHtml = (model: GalaxyEmperorViewModel): string => {
  if (!model.emperor || !model.isEmperor) return "";
  const countdown = model.windowOpenUntil !== null ? endorseCountdownLabel(model.windowOpenUntil) : "0:00";
  const currentPickHtml = model.endorsement
    ? `<p class="gx-emperor-current" data-galaxy-endorse-current>Currently endorsing: ${escapeHtml(model.endorsement.targetPlayerId)}</p>`
    : "";
  return `
    <div class="gx-emperor" data-galaxy-emperor>
      <p class="gx-kicker">Emperor's Endorsement</p>
      <p class="gx-emperor-copy">You reign as Emperor. Endorse a player to grant them Imperial Ward charges next season.</p>
      <p class="gx-emperor-countdown" data-galaxy-endorse-countdown>Window closes in ${escapeHtml(countdown)}</p>
      ${currentPickHtml}
      <form data-galaxy-endorse-form>
        <input
          type="text"
          name="endorseTarget"
          placeholder="player email or ID"
          data-galaxy-endorse-target
          required
        />
        <button type="submit" data-galaxy-endorse-submit>${model.endorsement ? "Change Endorsement" : "Endorse"}</button>
      </form>
      <p class="gx-emperor-error" data-galaxy-endorse-error hidden></p>
    </div>`;
};

const outpostRowHtml = (outpost: GalaxyViewOutpost): string => `
  <li class="gx-holding-row" data-galaxy-outpost>
    <span>Season ${outpost.seasonSequence} Outpost</span>
    ${specializationBadgeHtml(outpost.specialization)}
    ${stabilityHtml(outpost.stability)}
  </li>`;

const stipendRowHtml = (stipend: GalaxyViewStipend): string => `
  <li class="gx-holding-row" data-galaxy-stipend>
    Season ${stipend.seasonSequence}: a stipend of ${stipend.influence} Inf / ${stipend.production} Prod
  </li>`;

// Deliberately simple v0 rendering — no starfield hero, just a flat list
// under the Planet section. Empty when there are none of either.
const outpostsAndStipendsHtml = (outposts: GalaxyViewOutpost[], stipends: GalaxyViewStipend[]): string => {
  if (outposts.length === 0 && stipends.length === 0) return "";
  const rows = [...outposts.map(outpostRowHtml), ...stipends.map(stipendRowHtml)].join("");
  return `
    <div class="gx-holdings" data-galaxy-holdings>
      <p class="gx-kicker">Other Holdings</p>
      <ul class="gx-holding-list">${rows}</ul>
    </div>`;
};

export const renderGalaxyViewHtml = (model: GalaxyViewModel): string => {
  const outposts = model.outposts ?? [];
  const stipends = model.stipends ?? [];
  const economy = economyHtml(model.economy);
  const focused = model.planets.find((planet) => planet.seasonId === model.focusedSeasonId) ?? model.planets[0];
  if (!focused) return economy + outpostsAndStipendsHtml(outposts, stipends);
  return `
    <div class="gx-starfield" data-galaxy-starfield>
      <div class="gx-stars" aria-hidden="true"></div>
      ${focused.named ? namedMedallionHtml(focused) : christenFormHtml(focused)}
      ${switcherHtml(model.planets, focused.seasonId)}
    </div>
    ${economy}
    ${outpostsAndStipendsHtml(outposts, stipends)}`;
};
