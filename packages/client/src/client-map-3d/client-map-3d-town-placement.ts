import type { CaptureAftermathFx3D } from "../client-capture-aftermath/client-map-3d-capture-aftermath-fx.js";
import { LARGE_CONTACT_SHADOW_RADIUS_TILES, type ContactShadowOverlay } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import type { TownOverlay, TownTier } from "../client-map-3d-town-overlay.js";
import type { VillageEffects } from "../client-map-3d-village-fx.js";
import type { TownTierUpgradeFxEntry } from "../client-town-tier-upgrade-fx/client-town-tier-upgrade-fx.js";
import { shouldShowTownSmoke } from "../client-town-growth/client-town-growth.js";
import { townIdentityForTile } from "../client-town-identity.js";
import type { Tile } from "../client-types.js";

type TownSite = {
  readonly tile: Tile | undefined;
  readonly tileKey: string;
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
  readonly wx: number;
  readonly wy: number;
};

type TownPlacement = {
  readonly townOverlay: Pick<TownOverlay, "addInstanceWithUpgrade">;
  readonly contactShadowOverlay: Pick<ContactShadowOverlay, "addShadow">;
  readonly captureAftermathFx: Pick<CaptureAftermathFx3D, "addTownCaptureShock">;
  readonly villageEffects: Pick<VillageEffects, "addOwnedVillage">;
  readonly upgrades: ReadonlyMap<string, TownTierUpgradeFxEntry>;
  readonly demoTierAt: (x: number, y: number) => TownTier | undefined;
  readonly spawnCaptureText: (x: number, z: number, surfaceY: number, text: string) => void;
};

export const addTownForTile = ({ tile, tileKey, x, z, surfaceY, wx, wy }: TownSite, placement: TownPlacement): void => {
  const tier = townIdentityForTile(tile)?.populationTier ?? placement.demoTierAt(wx, wy);
  if (!tier) return;
  placement.townOverlay.addInstanceWithUpgrade(x, z, surfaceY, tier, wx, wy, placement.upgrades.get(tileKey));
  // The town foundation can span 0.92 tiles, enough to hide the default shadow.
  placement.contactShadowOverlay.addShadow(x, z, surfaceY, LARGE_CONTACT_SHADOW_RADIUS_TILES);
  const seed = wx * 17 + wy * 31;
  if (tile && shouldShowTownSmoke(tile)) placement.villageEffects.addOwnedVillage(x, z, surfaceY, seed);
  // Capture shock also applies to newly captured frontier towns without growth smoke.
  placement.captureAftermathFx.addTownCaptureShock(tile, tileKey, x, z, surfaceY, seed, (text) => placement.spawnCaptureText(x, z, surfaceY, text));
};
