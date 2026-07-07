// Pure render function for the Phase 0 "galaxy" view: your named planet(s),
// centered in a decorative starfield. See docs/agents (galactic meta-layer
// plan) for the full feature context. Stars here are purely cosmetic — no
// other empires are represented yet.
export type GalaxyViewPlanet = {
  seasonId: string;
  seasonSequence: number;
  objectiveName: string;
  crownedAt: number;
  planetName: string | null;
  named: boolean;
};

export type GalaxyViewModel = {
  planets: GalaxyViewPlanet[];
  focusedSeasonId: string;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );

const crownedDateLabel = (crownedAt: number): string =>
  new Date(crownedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

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
    <p class="gx-planet-meta">Crowned via ${escapeHtml(planet.objectiveName)} · ${crownedDateLabel(planet.crownedAt)}</p>
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

export const renderGalaxyViewHtml = (model: GalaxyViewModel): string => {
  const focused = model.planets.find((planet) => planet.seasonId === model.focusedSeasonId) ?? model.planets[0];
  if (!focused) return "";
  return `
    <div class="gx-starfield" data-galaxy-starfield>
      <div class="gx-stars" aria-hidden="true"></div>
      ${focused.named ? namedMedallionHtml(focused) : christenFormHtml(focused)}
      ${switcherHtml(model.planets, focused.seasonId)}
    </div>`;
};
