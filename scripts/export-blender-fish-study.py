"""Export only the editable fish proposal from the open Blender study.

blender --background <study.blend> --python scripts/export-blender-fish-study.py -- <output.glb>
"""
from pathlib import Path
import sys

import bpy

destination = Path(sys.argv[sys.argv.index("--") + 1])
destination.parent.mkdir(parents=True, exist_ok=True)
proposal = bpy.data.collections["02 Proposed game palette and industrial detailing"]
proposal.hide_viewport = False
proposal.hide_render = False
bpy.ops.object.select_all(action="DESELECT")
for obj in proposal.objects:
    obj.hide_set(False)
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(destination), export_format="GLB", use_selection=True,
    export_apply=True, export_materials="EXPORT", export_cameras=False,
    export_lights=False, export_animations=False,
)
print("FISH_PROPOSAL_EXPORTED", str(destination))
