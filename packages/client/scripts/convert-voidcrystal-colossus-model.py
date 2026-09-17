# Converts the external Meshy-AI "Voidcrystal Colossus (biped)" FBX export
# set into the single .glb the client loads (client-map-3d-voidcrystal-
# colossus-asset.ts), matching the source-asset-not-checked-in convention
# bake-popup-marine-titan-model.py already uses for a different unit.
#
# Assembled from THREE separate Meshy export batches, each with one
# captured clip on its own copy of the same 28-bone rig:
#   - Animation_Running_withSkin.fbx  ("Running") -- used as the BASE
#     mesh+armature. Its skin (vertex-group/bone weights) is verified
#     correct; the source set's separate Character_output.fbx mesh is NOT
#     used here -- its mesh doesn't actually correspond to its own
#     armature (every export of it, regardless of decimation or pose
#     handling, rendered as a collapsed heap, not a standing figure).
#   - Animation_Attack_withSkin.fbx ("Attack") -- grafted onto the base
#     armature via a straight NLA transplant (its action's fcurves apply
#     directly; same bone names/rest orientation as the base).
#   - Animation_<uuid>_withSkin.fbx ("Walking", the third batch's one FBX,
#     Meshy didn't give this one a readable clip name) -- this file's rest
#     bones come in rotated +90 degrees about X relative to the other two
#     (confirmed by comparing Hips.head_local between imports: e.g.
#     (-0.002, 0.911, -0.118) here vs (-0.002, 0.118, 0.911) for
#     Running/Attack) -- some Meshy export batches declare a different up
#     axis. A straight NLA transplant of ITS action (after just correcting
#     that orientation) onto the base armature produced garbage keyframes
#     -- apparently a Blender 5 action-slot targeting quirk specific to
#     this particular action, not the orientation difference (the
#     orientation-corrected file plays back perfectly on ITS OWN armature
#     standalone). The fix that actually works: constrain the base
#     armature's bones to COPY_ROTATION/COPY_LOCATION from the
#     orientation-corrected walk armature while its action plays, then
#     `nla.bake` the base armature's own resulting world-space motion into
#     a fresh action. This retargets the animation by capturing real
#     playback rather than transplanting keyframe data, which sidesteps
#     whatever the action-slot issue was entirely. If a future batch's
#     clip also fails a straight NLA transplant, reach for this same
#     constrain-then-bake fallback before spending time on it as a
#     transplant bug.
#
# Run:
#   blender --background --python convert-voidcrystal-colossus-model.py -- <src_dir> <out.glb>
#
# Requires the source assets on disk (not checked into the repo) at
# <src_dir> -- merge all three Meshy export batches' FBX files into one
# folder. Running/Attack must keep their exact Meshy names; the third
# batch's walk FBX can be named anything ending in "_withSkin.fbx" that
# isn't Running or Attack (Meshy gives it a UUID, not a readable name) --
# the script finds it by elimination:
#   Meshy_AI_Voidcrystal_Colossus_biped_Animation_Running_withSkin.fbx
#   Meshy_AI_Voidcrystal_Colossus_biped_Animation_Attack_withSkin.fbx
#   Meshy_AI_Voidcrystal_Colossus_biped_Animation_<anything>_withSkin.fbx  (walk)
#   Meshy_AI_Voidcrystal_Colossus_biped_texture_0[.png|_metallic.png|_roughness.png|_normal.png]
import glob
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
SRC_DIR, OUT = argv[0], argv[1]
TEXTURE_SIZE = 1024
DECIMATE_RATIO = 0.3

RUNNING_FBX = os.path.join(SRC_DIR, "Meshy_AI_Voidcrystal_Colossus_biped_Animation_Running_withSkin.fbx")
ATTACK_FBX = os.path.join(SRC_DIR, "Meshy_AI_Voidcrystal_Colossus_biped_Animation_Attack_withSkin.fbx")
WALK_FBX = next(
    p for p in glob.glob(os.path.join(SRC_DIR, "Meshy_AI_Voidcrystal_Colossus_biped_Animation_*_withSkin.fbx"))
    if p not in (RUNNING_FBX, ATTACK_FBX)
)

bpy.ops.wm.read_factory_settings(use_empty=True)

# --- Base: the Running file's own mesh+armature. ---
bpy.ops.import_scene.fbx(filepath=RUNNING_FBX)
main_armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
main_mesh = next(o for o in bpy.data.objects if o.type == "MESH")
main_armature.name = "VoidcrystalColossus"
if main_armature.animation_data and main_armature.animation_data.action:
    main_armature.animation_data.action.name = "Running"

# Decimate now, before importing/attaching any other action, so the
# Armature deform modifier evaluates the clean Running-file rest state.
bpy.context.view_layer.objects.active = main_mesh
decimate = main_mesh.modifiers.new(name="Decimate", type="DECIMATE")
decimate.ratio = DECIMATE_RATIO
bpy.ops.object.modifier_apply(modifier=decimate.name)

# --- Graft Attack via a straight NLA transplant (same rest orientation as
# the base, no correction needed). ---
bpy.ops.import_scene.fbx(filepath=ATTACK_FBX)
attack_armature = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o is not main_armature)
attack_action = attack_armature.animation_data.action if attack_armature.animation_data else None
if attack_action:
    attack_action.name = "Attack"
if not main_armature.animation_data:
    main_armature.animation_data_create()
if attack_action:
    attack_track = main_armature.animation_data.nla_tracks.new()
    attack_track.name = "Attack"
    attack_track.strips.new("Attack", int(attack_action.frame_range[0]), attack_action)
for obj in list(bpy.data.objects):
    if obj.type in ("ARMATURE", "MESH") and obj not in (main_armature, main_mesh):
        bpy.data.objects.remove(obj, do_unlink=True)

# --- Walking: import standalone, correct its +90-X-rotated rest
# orientation, then retarget by constrain-and-bake (see header for why not
# a straight NLA transplant). ---
bpy.ops.import_scene.fbx(filepath=WALK_FBX)
walk_armature = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o is not main_armature)
walk_mesh = next(o for o in bpy.data.objects if o.type == "MESH" and o is not main_mesh)

walk_armature.rotation_euler.x = math.radians(90)
bpy.ops.object.select_all(action="DESELECT")
walk_armature.select_set(True)
walk_mesh.select_set(True)
bpy.context.view_layer.objects.active = walk_armature
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

walk_action = max(bpy.data.actions, key=lambda a: a.frame_range[1] - a.frame_range[0], default=None)
frame_start, frame_end = int(walk_action.frame_range[0]), int(walk_action.frame_range[1])
if walk_armature.animation_data is None:
    walk_armature.animation_data_create()
walk_armature.animation_data.action = walk_action

bpy.ops.object.mode_set(mode="OBJECT")
for bone in main_armature.pose.bones:
    if bone.name not in walk_armature.pose.bones:
        continue
    rot_constraint = bone.constraints.new("COPY_ROTATION")
    rot_constraint.target = walk_armature
    rot_constraint.subtarget = bone.name
    if bone.name == "Hips":
        loc_constraint = bone.constraints.new("COPY_LOCATION")
        loc_constraint.target = walk_armature
        loc_constraint.subtarget = bone.name

bpy.context.scene.frame_start = frame_start
bpy.context.scene.frame_end = frame_end
bpy.ops.object.select_all(action="DESELECT")
main_armature.select_set(True)
bpy.context.view_layer.objects.active = main_armature
bpy.ops.nla.bake(
    frame_start=frame_start,
    frame_end=frame_end,
    only_selected=False,
    visual_keying=True,
    clear_constraints=True,
    clean_curves=False,
    use_current_action=False,
    bake_types={"POSE"},
)
baked_walk_action = main_armature.animation_data.action
baked_walk_action.name = "Walking"
walking_track = main_armature.animation_data.nla_tracks.new()
walking_track.name = "Walking"
walking_track.strips.new("Walking", frame_start, baked_walk_action)
main_armature.animation_data.action = None

for obj in list(bpy.data.objects):
    if obj not in (main_armature, main_mesh):
        bpy.data.objects.remove(obj, do_unlink=True)

# Purge every action except the three real named clips -- the exporter
# otherwise ships orphaned source actions (the walk file's own pre-bake
# action, junk 1-2 frame "base pose" actions from each import) that no
# longer belong to any object in the scene.
KEEP_ACTIONS = {"Attack", "Running", "Walking"}
for action in list(bpy.data.actions):
    if action.name not in KEEP_ACTIONS:
        bpy.data.actions.remove(action, do_unlink=True)


def texture_path(suffix: str) -> str:
    return os.path.join(SRC_DIR, f"Meshy_AI_Voidcrystal_Colossus_biped_texture_0{suffix}.png")


mat = bpy.data.materials.new(name="VoidcrystalColossusMaterial")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

bsdf = nodes.new("ShaderNodeBsdfPrincipled")
output = nodes.new("ShaderNodeOutputMaterial")
links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])


def add_image_texture(path: str, colorspace: str, location: tuple[int, int]):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = colorspace
    if img.size[0] > TEXTURE_SIZE:
        img.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    node = nodes.new("ShaderNodeTexImage")
    node.image = img
    node.location = location
    return node


base_color = add_image_texture(texture_path(""), "sRGB", (-600, 300))
links.new(base_color.outputs["Color"], bsdf.inputs["Base Color"])

metallic = add_image_texture(texture_path("_metallic"), "Non-Color", (-600, 0))
links.new(metallic.outputs["Color"], bsdf.inputs["Metallic"])

roughness = add_image_texture(texture_path("_roughness"), "Non-Color", (-600, -300))
links.new(roughness.outputs["Color"], bsdf.inputs["Roughness"])

normal_tex = add_image_texture(texture_path("_normal"), "Non-Color", (-600, -600))
normal_map = nodes.new("ShaderNodeNormalMap")
normal_map.location = (-300, -600)
links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

main_mesh.data.materials.clear()
main_mesh.data.materials.append(mat)

bpy.ops.object.select_all(action="DESELECT")
main_armature.select_set(True)
main_mesh.select_set(True)
bpy.context.view_layer.objects.active = main_armature

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_nla_strips=True,
    export_yup=True,
    export_apply=False,
    export_texture_dir="",
    export_image_format="JPEG",
    export_jpeg_quality=82,
)
print("EXPORTED", OUT)
