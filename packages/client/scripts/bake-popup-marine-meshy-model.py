# Authoring script for the EXPERIMENTAL Meshy-AI-sculpt-based pop-up-marine
# model (packages/client/public/models/popup-marine-meshy.glb) -- an
# alternative to the procedurally-authored model baked by
# bake-popup-marine-model.mjs. See popup-marine-asset.ts's
# POPUP_MARINE_USE_MESHY_MODEL toggle for how the runtime picks between the
# two; this file does NOT touch or overwrite the procedural model or its
# bake script.
#
# Unlike bake-popup-marine-model.mjs (a small Node/Three.js script, no
# external tooling), this one is a Blender (4.0+) headless Python script,
# because the source asset is a single 79,644-triangle unrigged, untextured
# sculpt with no bones and no per-part segmentation -- turning that into a
# game-ready skinned mesh needs real mesh decimation and skin-weight solving
# tools, not just primitive construction. Blender's Decimate modifier and
# its heat-diffusion "Automatic Weights" armature parenting
# (bpy.ops.object.parent_set(type='ARMATURE_AUTO')) do that job far better
# than a hand-rolled nearest-bone heuristic would on unstructured topology.
#
# Run from the repo root with a source .glb path and an output path:
#
#   blender --background --python packages/client/scripts/bake-popup-marine-meshy-model.py -- \
#     <source.glb> packages/client/public/models/popup-marine-meshy.glb [targetTriangleCount]
#
# Requires numpy importable by Blender's bundled Python (Blender's glTF
# import/export addon depends on it) -- if Blender reports
# `ModuleNotFoundError: No module named 'numpy'`, install it for the same
# Python version Blender embeds, e.g. `python3.12 -m pip install --break-system-packages numpy`.
#
# What this does, in order:
#   1. Imports the source glTF/glb (single merged Mesh, no skeleton, no
#      material/UVs -- confirmed via a throwaway Three.js/GLTFLoader
#      inspection of the source asset).
#   2. Decimates it (Blender's Decimate modifier, collapse mode) down to
#      `targetTriangleCount` (default 3200) triangles and recomputes
#      normals. This game can render up to ~160 of these marines at once
#      (up to 16 concurrent battles x ~5 marines/side x 2 sides) as
#      individual SkinnedMeshes, so the source's 79,644 triangles (~12.7M
#      tris on screen at 160 instances) is not viable -- ~3,200 keeps total
#      on-screen triangles in the ~0.5M range at full instance load, in
#      line with the previous procedural model's much lower but
#      already-adequate polycount.
#   3. Rescales/recenters the decimated mesh so its height matches the
#      procedural model's ~0.052 local-unit height and its feet sit at
#      y=0 (ground), matching bake-popup-marine-model.mjs's coordinate
#      convention (see popup-marine-pose.ts / popup-marine-timeline.ts for
#      what depends on that scale).
#   4. Paints a per-vertex "equipment" tint (glTF COLOR_0): near-black for
#      the helmet-top region and the outer arm/hand extremities, near-white
#      everywhere else -- mirroring MARINE_VERTEX_TINT's team-tintable-armor
#      vs. dark-neutral-equipment split in bake-popup-marine-model.mjs, but
#      as a height/reach heuristic instead of a per-part list, since this
#      mesh has no part segmentation to key off of.
#   5. Builds a 7-bone armature using the SAME bone names and parent
#      hierarchy as MARINE_BONE_NAMES in popup-marine-pose.ts (hips -> spine
#      -> {armR_upper -> armR_lower, armL}, hips -> {legL, legR}), positioned
#      from the decimated mesh's own bounding-box proportions. Every edit
#      bone is given the SAME head->tail direction and roll (straight up,
#      roll 0) -- deliberately, not by accident: Blender computes each bone's
#      rest orientation from its own head/tail/roll independent of its
#      parent, so giving every bone an identical direction makes every
#      bone's rest rotation RELATIVE TO ITS PARENT the identity quaternion
#      once exported, matching the procedural rig's convention (plain
#      position-only Bones, zero rest rotation). That's what lets
#      popup-marine-pose.ts's existing `bone.rotation.x` bends keep meaning
#      "hinge about the left-right axis" on this model with no changes to
#      that file.
#   6. Parents the mesh to the armature with Blender's automatic (heat
#      diffusion) skin weighting -- smooth multi-bone blending at joint
#      boundaries, not rigid single-bone binding; this is the main reason
#      to go through Blender rather than a position-only heuristic binder,
#      since the source is one continuous blob with no per-part seams to
#      bind cleanly along.
#   7. Exports the mesh + armature (with skin + vertex colors) to a binary
#      .glb via Blender's built-in glTF exporter.
#
# See the PR description for this model's verification results (a
# geometric bend-test comparing bind-pose vs. posed triangle-edge lengths,
# run via a throwaway Three.js script since no GPU-capable browser
# automation was available in the authoring environment) and the honest
# recommendation on whether it's ready to replace the procedural model.
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC = argv[0]
OUT = argv[1]
TARGET_TRIS = int(argv[2]) if len(argv) > 2 else 3200
TARGET_HEIGHT = 0.052  # matches bake-popup-marine-model.mjs's overall marine height

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

mesh_obj = next((o for o in bpy.context.scene.objects if o.type == "MESH"), None)
if mesh_obj is None:
    raise RuntimeError(f"no mesh found in {SRC}")

bpy.context.view_layer.objects.active = mesh_obj
mesh_obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

tri_count = sum(len(p.vertices) - 2 for p in mesh_obj.data.polygons)
ratio = max(0.005, min(1.0, TARGET_TRIS / max(1, tri_count)))
print(f"source tris: {tri_count}, decimate ratio: {ratio:.4f}")

decimate = mesh_obj.modifiers.new(name="Decimate", type="DECIMATE")
decimate.ratio = ratio
bpy.ops.object.modifier_apply(modifier=decimate.name)

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")

decimated_tris = sum(len(p.vertices) - 2 for p in mesh_obj.data.polygons)
print("decimated tris:", decimated_tris)

# Rescale/recenter to the procedural model's convention: height ==
# TARGET_HEIGHT, feet at y=0 (up, pre glTF Y-up export conversion this is
# Blender's Z axis), centered on X/Y.
bbox = [mesh_obj.matrix_world @ Vector(c) for c in mesh_obj.bound_box]
xs, ys, zs = ([v[i] for v in bbox] for i in range(3))
minx, maxx = min(xs), max(xs)
miny, maxy = min(ys), max(ys)
minz, maxz = min(zs), max(zs)
scale = TARGET_HEIGHT / (maxz - minz)

mesh_obj.scale = (scale, scale, scale)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
mesh_obj.location = (-(minx + maxx) / 2 * scale, -(miny + maxy) / 2 * scale, -minz * scale)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

bbox = [mesh_obj.matrix_world @ Vector(c) for c in mesh_obj.bound_box]
xs, ys, zs = ([v[i] for v in bbox] for i in range(3))
width, depth, height = max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)
depth_center = (max(ys) + min(ys)) / 2
ground_z = min(zs)
print(f"post-scale W/D/H: {width:.4f} {depth:.4f} {height:.4f}")

# --- Vertex-color "equipment" heuristic (see header comment 4). ---
vertex_colors = mesh_obj.data.vertex_colors.new(name="Col")
EQUIPMENT_TINT = (0.16, 0.16, 0.18, 1.0)  # dark neutral -- matches helmet/rifle/backpack in the procedural model
ARMOR_TINT = (0.92, 0.92, 0.92, 1.0)  # near-white -- team-tinted at runtime, matches chest/pauldron there
helmet_top_z = ground_z + 0.86 * height
for poly in mesh_obj.data.polygons:
    for loop_index in poly.loop_indices:
        vertex_index = mesh_obj.data.loops[loop_index].vertex_index
        world_co = mesh_obj.matrix_world @ mesh_obj.data.vertices[vertex_index].co
        is_equipment = world_co.z > helmet_top_z or abs(world_co.x) > 0.42 * width
        vertex_colors.data[loop_index].color = EQUIPMENT_TINT if is_equipment else ARMOR_TINT

# --- Armature: 7 bones, same names/hierarchy as MARINE_BONE_NAMES in
# popup-marine-pose.ts (see header comment 5 for the identity-rest-rotation
# trick). Positions are fractions of the decimated mesh's own bounding box.
BONE_POSITIONS = {
    "hips": (0, 0, ground_z + 0.38 * height),
    "spine": (0, 0, ground_z + 0.60 * height),
    "legL": (-0.20 * width, 0, ground_z + 0.38 * height),
    "legR": (0.20 * width, 0, ground_z + 0.38 * height),
    "armL": (-0.40 * width, depth_center, ground_z + 0.62 * height),
    "armR_upper": (0.40 * width, depth_center, ground_z + 0.63 * height),
    "armR_lower": (0.36 * width, depth_center + 0.10 * depth, ground_z + 0.44 * height),
}
BONE_PARENTS = {
    "hips": None, "spine": "hips",
    "armR_upper": "spine", "armR_lower": "armR_upper", "armL": "spine",
    "legL": "hips", "legR": "hips",
}

armature_data = bpy.data.armatures.new("MarineArmature")
armature_obj = bpy.data.objects.new("MarineArmature", armature_data)
bpy.context.scene.collection.objects.link(armature_obj)
bpy.context.view_layer.objects.active = armature_obj
bpy.ops.object.mode_set(mode="EDIT")
TAIL_LENGTH = 0.01  # arbitrary, direction-only -- see header comment 5
edit_bones = {}
for name, position in BONE_POSITIONS.items():
    edit_bone = armature_data.edit_bones.new(name)
    edit_bone.head = Vector(position)
    edit_bone.tail = Vector(position) + Vector((0, 0, TAIL_LENGTH))
    edit_bone.roll = 0
    edit_bones[name] = edit_bone
for name, parent in BONE_PARENTS.items():
    if parent:
        edit_bones[name].parent = edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")

# --- Skin: parent mesh to armature with automatic (heat-diffusion) weights.
bpy.ops.object.select_all(action="DESELECT")
mesh_obj.select_set(True)
armature_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

# --- Export: mesh + armature, skin + vertex colors, binary .glb.
bpy.ops.object.select_all(action="DESELECT")
mesh_obj.select_set(True)
armature_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_skins=True,
    export_yup=True,
    export_colors=True,
    export_normals=True,
)
print("wrote", OUT)
