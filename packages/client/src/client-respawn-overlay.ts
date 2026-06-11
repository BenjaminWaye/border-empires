import type { ClientState } from "./client-state/client-state.js";
import type { FeedSeverity, FeedType, PlayerRespawnNotice } from "./client-types.js";

type RespawnOverlayDeps = {
  state: Pick<ClientState, "respawnNotice" | "respawnOverlayOpen">;
  overlayEl: HTMLDivElement;
  renderHud: () => void;
  centerOnOwnedTile: () => void;
  pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
  downloadRespawnBugReport: (args: { notice: PlayerRespawnNotice }) => Promise<void>;
};

const reasonLabel = (notice: PlayerRespawnNotice): string => {
  if (notice.reasonCode === "eliminated") return "Your empire no longer had a surviving foothold.";
  if (notice.reasonCode === "auth_recovery") return "Your saved empire loaded without any playable territory.";
  return "Server recovery found your empire in a non-playable state during bootstrap.";
};

const diagnosticsListHtml = (notice: PlayerRespawnNotice): string =>
  [
    `Trigger: ${notice.triggerEvent}`,
    `Previous territory: ${notice.previousTerritoryTiles} tiles`,
    `Previous T/E: ${notice.previousTerritoryStrength}/${notice.previousExposure}`,
    `Eliminated flag: ${notice.wasEliminated ? "true" : "false"}`,
    `Respawn pending: ${notice.respawnPending ? "true" : "false"}`,
    notice.previousHomeTileKey ? `Previous home: ${notice.previousHomeTileKey}` : "",
    notice.spawnTileKey ? `New spawn: ${notice.spawnTileKey}` : ""
  ]
    .filter((line) => line.length > 0)
    .map((line) => `<li>${line}</li>`)
    .join("");

export const renderRespawnOverlay = (deps: RespawnOverlayDeps): void => {
  const { state, overlayEl, renderHud, centerOnOwnedTile, pushFeed, downloadRespawnBugReport } = deps;
  const notice = state.respawnNotice;
  const visible = state.respawnOverlayOpen && Boolean(notice);
  overlayEl.style.display = visible ? "grid" : "none";
  if (!visible || !notice) {
    if (overlayEl.innerHTML) overlayEl.innerHTML = "";
    return;
  }

  overlayEl.innerHTML = `
    <div class="respawn-backdrop" id="respawn-backdrop"></div>
    <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="respawn-title">
      <button id="respawn-close" class="guide-close-btn" type="button" aria-label="Close respawn notice">×</button>
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">Empire recovery notice</div>
        <h2 id="respawn-title" class="respawn-title">${notice.title}</h2>
        <p class="respawn-summary">${notice.summary}</p>
        <section class="respawn-section respawn-reason-card">
          <h3>Reason for respawn</h3>
          <p>${reasonLabel(notice)}</p>
          <p>${notice.detail}</p>
        </section>
        <section class="respawn-section">
          <h3>What the server did</h3>
          <p>
            Respawns are a safety path. If the server sees that your empire no longer has a playable origin, it gives you a fresh settlement instead of leaving you logged in with zero territory and no way to recover.
          </p>
          <p>
            This can be expected after a real elimination, but it can also happen during account recovery or startup repair when saved ownership data does not match a playable empire state.
          </p>
        </section>
        <section class="respawn-section">
          <h3>Diagnostics</h3>
          <ul class="respawn-diagnostics">
            ${diagnosticsListHtml(notice)}
          </ul>
        </section>
        <section class="respawn-section">
          <h3>If you think this was a bug</h3>
          <p>
            The reason for the respawn is written above. If it still looks wrong, download one respawn report with the written reason, the recent client and server event stream, and the debug log bundled together.
          </p>
          <div class="respawn-actions">
            <button id="respawn-center" class="panel-btn" type="button">Center on new capital</button>
            <button id="respawn-download-report" class="panel-btn guide-secondary-btn" type="button">Download respawn report</button>
          </div>
        </section>
      </div>
    </div>
  `;

  const close = (): void => {
    state.respawnOverlayOpen = false;
    renderHud();
  };

  const closeBtn = overlayEl.querySelector("#respawn-close") as HTMLButtonElement | null;
  const backdrop = overlayEl.querySelector("#respawn-backdrop") as HTMLDivElement | null;
  const centerBtn = overlayEl.querySelector("#respawn-center") as HTMLButtonElement | null;
  const downloadReportBtn = overlayEl.querySelector("#respawn-download-report") as HTMLButtonElement | null;

  if (closeBtn) closeBtn.onclick = close;
  if (backdrop) backdrop.onclick = close;
  if (centerBtn) {
    centerBtn.onclick = () => {
      centerOnOwnedTile();
      pushFeed("Centered on your new capital.", "info", "success");
    };
  }
  if (downloadReportBtn) {
    downloadReportBtn.onclick = () => {
      void downloadRespawnBugReport({ notice })
        .then(() => pushFeed("Respawn report downloaded.", "info", "success"))
        .catch((error) => {
          console.error("[respawn-report-download]", error);
          pushFeed("Could not download the respawn report.", "error", "warn");
        });
    };
  }
};
