"""Scale the intact saved proposal down, preserving every component relationship.

blender --background <original-study.blend> --python scripts/compact-blender-fish-study.py -- <output.glb> <output.blend>
"""
from pathlib import Path
import sys

import bpy
from mathutils import Matrix

export_path, blend_path = map(Path, sys.argv[sys.argv.index("--") + 1:])
proposal = bpy.data.collections["02 Proposed game palette and industrial detailing"]
proposal.hide_render = proposal.hide_viewport = False
# Scale only assembly roots. Leave child transforms, source hut and supplies intact.
# Applying a scale to each mesh separately would break parent/child relationships.
scale = Matrix.Scale(0.8, 4)
for obj in proposal.objects:
    if obj.parent is None:
        obj.matrix_world = scale @ obj.matrix_world
bpy.context.view_layer.update()
bpy.ops.object.select_all(action="DESELECT")
for obj in proposal.objects:
    obj.hide_set(False)
    obj.select_set(True)
export_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(export_path), export_format="GLB", use_selection=True,
    export_apply=True, export_materials="EXPORT", export_cameras=False,
    export_lights=False, export_animations=False)
bpy.context.scene["Compact layout"] = "Original assembly uniformly scaled to 80%; component relationships preserved. Preview only."
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print("COMPACT_FISH_EXPORTED", str(export_path))
