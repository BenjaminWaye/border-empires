// Release notes auto-open the Chronicle once per new batch of notes, not once
// per page load. The Chronicle opens on Yours, so the notes' own seen marker
// (CLIENT_CHANGELOG_STORAGE_KEY, set only when the Updates tab is shown) stays
// behind; this separate watermark records which notes already opened it.
import { storageGet, storageSet } from "../client-state/client-storage.js";
import { latestClientChangelogTimestamp } from "./client-changelog.js";

export const CLIENT_CHANGELOG_AUTO_OPENED_KEY = "border-empires-client-changelog-auto-opened-v1";

/** True while the newest release notes have not yet auto-opened the Chronicle in this browser. */
export const changelogAutoOpenPending = (latestAt: number = latestClientChangelogTimestamp()): boolean =>
  (Number(storageGet(CLIENT_CHANGELOG_AUTO_OPENED_KEY)) || 0) < latestAt;

export const recordChangelogAutoOpened = (latestAt: number = latestClientChangelogTimestamp()): void =>
  storageSet(CLIENT_CHANGELOG_AUTO_OPENED_KEY, String(latestAt));
