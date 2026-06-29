## Summary

Bumps 3D overlay opacities across range circles and crystal targeting so they're actually visible.

## Changes

- **Crystal targeting overlay fill**: 12% → 30%
- **Crystal targeting overlay per-tile border**: new LineSegments drawing a colored stroke around each valid target tile (88% opacity, tone-colored)
- **Airport Bombard range circle**: border 40% → 55%, fill 2.5% → 10%
- **Observatory range circle**: border 35% → 55%, fill 2% → 10%
- **Waterworks range circle**: fill 3% → 10%
- **Sweep range circle**: fill 4% → 10%
- Changelog bumped to `2026.06.29.6`.

## Verification

- TypeScript compiles cleanly.
- File-line-limit check passes.
- 757/758 tests pass (1 pre-existing failure in waypoint-silent-capture).
