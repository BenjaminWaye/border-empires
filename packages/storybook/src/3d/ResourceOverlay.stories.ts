import type { Meta, StoryObj } from "@storybook/html-vite";
import { createResourceOverlay, type ResourceKind } from "@client/client-map-3d-resource-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  resources: ResourceKind[];
  cameraDistance: number;
  spacing: number;
};

const KINDS: ReadonlyArray<ResourceKind> = ["FARM", "WOOD", "IRON", "GEMS", "FISH", "FUR"];

// The resource overlay picks a 0/1/2 variant from the (worldTileX,
// worldTileY) hash internally; there's no direct variant override on
// the public API. To force a specific variant in stories, search for a
// worldTileX (with worldTileY = 0) that hashes to the target variant.
// Hash matches the implementation in client-map-3d-resource-overlay.ts.
const variantHash = (worldX: number, worldZ: number, salt: number): number => {
  const h = ((worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)) >>> 0;
  return h % 3;
};

const worldXForVariant = (resource: ResourceKind, variant: 0 | 1 | 2): number => {
  const salt = resource.length * 31;
  for (let wx = 0; wx < 200; wx += 1) {
    if (variantHash(wx, 0, salt) === variant) return wx;
  }
  return 0;
};

const renderRow = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a2014" });
  const overlay = createResourceOverlay(stage.scene, Math.max(args.resources.length, 1));
  args.resources.forEach((res, idx) => {
    const x = (idx - (args.resources.length - 1) / 2) * args.spacing;
    overlay.addInstance(x, 0, 0, res, Math.round(x), 0);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

// Renders one resource three times in a row, one tile per variant
// (0/1/2). Each tile uses a worldTileX that hashes to the target
// variant so the layout is forced rather than left to chance.
const renderVariants = (resource: ResourceKind, cameraDistance: number, spacing = 1.4): HTMLElement => {
  const stage = createStage({ cameraDistance, background: "#1a2014" });
  const overlay = createResourceOverlay(stage.scene, 3);
  const variants: ReadonlyArray<0 | 1 | 2> = [0, 1, 2];
  variants.forEach((v, idx) => {
    const x = (idx - 1) * spacing;
    overlay.addInstance(x, 0, 0, resource, worldXForVariant(resource, v), 0);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/ResourceOverlay",
  argTypes: {
    resources: { control: "check", options: KINDS as unknown as string[] },
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.8, max: 2.5, step: 0.1 } }
  },
  args: { resources: [...KINDS], cameraDistance: 8, spacing: 1.2 },
  render: renderRow
};

export default meta;
type Story = StoryObj<Args>;

// Single-variant overview stories.
export const AllKinds: Story = {};
export const Farm: Story = { args: { resources: ["FARM"], cameraDistance: 3 } };
export const Wood: Story = { args: { resources: ["WOOD"], cameraDistance: 3 } };
export const Iron: Story = { args: { resources: ["IRON"], cameraDistance: 3 } };
export const Gems: Story = { args: { resources: ["GEMS"], cameraDistance: 3 } };
export const Fish: Story = { args: { resources: ["FISH"], cameraDistance: 3 } };
export const Fur: Story = { args: { resources: ["FUR"], cameraDistance: 3 } };

// Per-resource Variants stories: shows all 3 layout variants
// side-by-side. The variant comes from a (worldX, 0) hash internally,
// so we search for a worldX that produces each target variant.
export const FarmVariants: Story = { render: () => renderVariants("FARM", 6) };
export const WoodVariants: Story = { render: () => renderVariants("WOOD", 6) };
export const IronVariants: Story = { render: () => renderVariants("IRON", 6) };
export const GemsVariants: Story = { render: () => renderVariants("GEMS", 6) };
export const FishVariants: Story = { render: () => renderVariants("FISH", 6) };
export const FurVariants: Story = { render: () => renderVariants("FUR", 6) };

// 6 resources × 3 variants in a single 6-column grid.
export const AllVariants: Story = {
  render: () => {
    const stage = createStage({ cameraDistance: 18, background: "#1a2014" });
    const overlay = createResourceOverlay(stage.scene, 21);
    const variants: ReadonlyArray<0 | 1 | 2> = [0, 1, 2];
    KINDS.forEach((res, ix) => {
      variants.forEach((v, iv) => {
        const x = (ix - (KINDS.length - 1) / 2) * 1.5;
        const z = (iv - 1) * 1.5;
        overlay.addInstance(x, z, 0, res, worldXForVariant(res, v), 0);
      });
    });
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose]);
  }
};
