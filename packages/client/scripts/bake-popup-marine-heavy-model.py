# Builds the HEAVY ARMOUR soldier (popup-marine-heavy-24bone.glb) that every
# soldier of an empire owning a Titanium Weapons Factory wears -- see
# packages/client/src/client-map-3d-popup-marine/popup-marine-gear.ts. The
# same infantryman as the standard marine in thicker plate: stacked square
# pauldrons, a slab chest plate, a high gorget, heavy knee guards and greaves,
# and an enclosed helmet with an orange visor slit. The flat plates take the
# team colour; their polished titanium edging and rivets render as bare metal.
#
# Input is the Meshy-rigged sculpt (Meshy's 24-bone biped template, the same
# one every marine model uses, so every bone name matches). Being a
# humanoid, it takes the CHECKED-IN standard marine's clips
# (popup-marine-titan-24bone.glb) retargeted bone-for-bone by name.
#
# Why retarget through constraints instead of reusing the actions directly:
# Blender stores pose keys RELATIVE to each bone's rest pose, and the two
# sculpts don't share a rest pose (different proportions, different arm
# angle). Copying the old actions onto the new rig would replay the old rest
# deltas on new rest bones -- arms in the wrong place, silently. World-space
# Copy Rotation per bone (plus Copy Location on Hips, the only bone the clips
# translate) reproduces each bone's actual on-screen orientation, then a
# visual bake writes real keys for the new rig.
#
# The rifle: Meshy drops anything held when it builds an A-pose model, so the
# sculpt's hands are empty. The standard marine's right hand and rifle (one
# shell, skinned to RightHand) are grafted on instead, placed in the new
# RightHand bone's rest frame exactly where they sit in the old one's. As the
# retarget copies each bone's world rotation, the rifle then moves through
# every clip precisely as the standard marine's does.
#
# Mesh rebuild and surface classes are the shared steps in
# bake_marine_surface.py -- see its header. This sculpt's plates and edging
# share one neutral grey in the base colour, so its classifier tells them
# apart by Meshy's metallic map instead. Everything else mirrors
# bake-popup-marine-titan-model.py (root-node scale to TARGET_HEIGHT, ACTIONS
# export) -- read that file's comments for the Blender 5.x glTF traps each
# step avoids.
#
# Run (Blender 5.x, or `python -I` with the bpy wheel):
#   blender --background --python bake-popup-marine-heavy-model.py -- \
#     <meshy-rigged.glb> <popup-marine-titan-24bone.glb> <out.glb> [targetTriangleCount]
import os
import sys
import bpy
import bmesh  # after bpy: the bpy wheel only exposes bmesh once bpy is loaded
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bake_marine_surface import (  # noqa: E402
    GLOW,
    GRAPHITE,
    METAL,
    PANEL,
    hsv_columns,
    rebuild_game_mesh,
    surface_metallic,
    surface_rgb,
    write_surface_data,
)

argv = sys.argv[sys.argv.index("--") + 1:]
SRC_RIG = argv[0]
CLIP_SOURCE = argv[1]
OUT = argv[2]
TARGET_TRIS = int(argv[3]) if len(argv) > 3 else 5000
TARGET_HEIGHT = 0.052  # same local-unit convention as the standard marine
# Voxel size as a fraction of the soldier's height; fine enough to keep the
# stacked pauldron layers and the gorget separate at the triangle budget.
VOXEL_DIVISIONS = 200
# Meshy stores the titanium darker than it should read.
METAL_GAIN = 1.3
# The heavier gauntlet is bigger than the standard marine's glove; the
# grafted rifle is scaled up a touch so it doesn't look like a toy in it.
RIFLE_SCALE = 1.15
WEAPON_BONE = "RightHand"

# Only the clips the game plays: the battle stances (MARINE_CLIP_NAMES in
# popup-marine-asset.ts) plus PistolWalk for the muster-transit march.
CLIP_NAMES = ["PistolRun", "PistolIdle", "PistolKneelingIdle", "PistolWalk"]


def armature_and_mesh(objects):
    armature = next(o for o in objects if o.type == "ARMATURE")
    meshes = [o for o in objects if o.type == "MESH" and o.find_armature() == armature]
    return armature, meshes


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def world_height(meshes):
    zs = [(m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices]
    return min(zs), max(zs)


bpy.ops.wm.read_factory_settings(use_empty=True)

# --- Clip source: the checked-in standard marine, at its exported scale. ---
src_objects = import_glb(CLIP_SOURCE)
src_armature, src_meshes = armature_and_mesh(src_objects)
src_mesh = src_meshes[0]
clips = {a.name: a for a in bpy.data.actions if a.name in CLIP_NAMES}
missing = [name for name in CLIP_NAMES if name not in clips]
if missing:
    raise SystemExit(f"clip source is missing {missing}")
for action in clips.values():
    action.use_fake_user = True

# --- Target: the Meshy-rigged heavy soldier. ---
new_objects = import_glb(SRC_RIG)
armature, meshes = armature_and_mesh(new_objects)
if len(meshes) > 1:
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
mesh = meshes[0]
# Meshy's rig export carries a stray unskinned helper sphere; drop it and
# anything else that isn't the body.
for o in new_objects:
    if o.type == "MESH" and o != mesh and o.name in bpy.data.objects:
        bpy.data.objects.remove(o, do_unlink=True)
missing_bones = [b.name for b in src_armature.data.bones if b.name not in armature.data.bones]
if missing_bones:
    raise SystemExit(f"target rig lacks bones {missing_bones} -- not Meshy's 24-bone biped template?")
# Drop whatever clips Meshy baked in; only the retargeted ones ship.
if armature.animation_data:
    armature.animation_data.action = None

# --- Root-node scale + recentre, exactly as the standard bake does (as an
# UNAPPLIED armature-object transform -- see that script for why). Done
# BEFORE retargeting so the world-space Hips copy lands in final units. ---
bpy.context.view_layer.update()
armature.scale = (1, 1, 1)
armature.location = (0, 0, 0)
armature.rotation_mode = "QUATERNION"
armature.rotation_quaternion = (1, 0, 0, 0)
bpy.context.view_layer.update()
local = [v.co for v in mesh.data.vertices]
xs, ys, zs = ([v[i] for v in local] for i in range(3))
scale = TARGET_HEIGHT / (max(zs) - min(zs))
armature.scale = (scale, scale, scale)
armature.location = (-(min(xs) + max(xs)) / 2 * scale, -(min(ys) + max(ys)) / 2 * scale, -min(zs) * scale)
bpy.context.view_layer.update()
src_lo, src_hi = world_height(src_meshes)
print(f"source world height {src_hi - src_lo:.4f}, target root scale {scale:.8f}")

# --- Retarget each clip: constrain, visual-bake, drop constraints. ---
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="POSE")
for pbone in armature.pose.bones:
    rot = pbone.constraints.new("COPY_ROTATION")
    rot.target = src_armature
    rot.subtarget = pbone.name
    rot.target_space = "WORLD"
    rot.owner_space = "WORLD"
    if pbone.name == "Hips":
        loc = pbone.constraints.new("COPY_LOCATION")
        loc.target = src_armature
        loc.subtarget = pbone.name
        loc.target_space = "WORLD"
        loc.owner_space = "WORLD"
bpy.ops.object.mode_set(mode="OBJECT")

src_armature.animation_data_create()
baked = []
for name in CLIP_NAMES:
    action = clips[name]
    src_armature.animation_data.action = action
    src_armature.animation_data.action_slot = src_armature.animation_data.action_suitable_slots[0]
    start, end = (int(round(f)) for f in action.frame_range)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(
        frame_start=start,
        frame_end=end,
        only_selected=True,
        visual_keying=True,
        clear_constraints=False,
        use_current_action=False,
        bake_types={"POSE"},
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    result = armature.animation_data.action
    result.name = f"{name}__baked"
    result.use_fake_user = True
    # Unique slot name per clip -- shared slot names make the exporter bake
    # every clip as the same data (see the standard bake script).
    for slot in result.slots:
        slot.name_display = f"{name}Pose"
    armature.animation_data.action = None
    baked.append((name, result))
    print(f"retargeted {name}: frames {start}-{end}")

for pbone in armature.pose.bones:
    for constraint in list(pbone.constraints):
        pbone.constraints.remove(constraint)
src_armature.animation_data.action = None


def classify_heavy(rgb, metallic):
    """Measured on this sculpt's textures: plates and edging are both neutral
    grey (saturation ~0.03) in the base colour, but the metallic map puts the
    polished titanium edging and rivets above ~0.6 and the matte plates below.
    The undersuit and gloves are dark charcoal; the visor slit is the only
    saturated colour (orange, hue ~30)."""
    hue, sat, value = hsv_columns(rgb)
    classes = np.full(len(rgb), PANEL)
    classes[metallic > 0.6] = METAL
    classes[value < 0.3] = GRAPHITE
    classes[(sat > 0.45) & (value > 0.45) & (hue < 50)] = GLOW
    return classes


def bone_rest_frame(arm, bone_name):
    """World-space (head, rotation) of a bone's rest pose; scale dropped."""
    location, rotation, _scale = (arm.matrix_world @ arm.data.bones[bone_name].matrix_local).decompose()
    return location, rotation


def graft_weapon(game_mesh):
    """Appends the standard marine's RightHand shell (hand + rifle) to
    `game_mesh`, skinned fully to RightHand, at the same place in this rig's
    RightHand rest frame as in the standard marine's. Returns how many
    vertices were added (they are the last ones in the mesh)."""
    for arm in (src_armature, armature):
        arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    hand = src_mesh.vertex_groups[WEAPON_BONE].index
    dominant = {
        v.index
        for v in src_mesh.data.vertices
        if v.groups and max(v.groups, key=lambda g: g.weight).group == hand
    }
    faces = [p.vertices[:] for p in src_mesh.data.polygons if all(i in dominant for i in p.vertices)]
    used = sorted({i for f in faces for i in f})
    src_head, src_rot = bone_rest_frame(src_armature, WEAPON_BONE)
    dst_head, dst_rot = bone_rest_frame(armature, WEAPON_BONE)
    to_mesh = game_mesh.matrix_world.inverted()
    bm = bmesh.new()
    bm.from_mesh(game_mesh.data)
    deform = bm.verts.layers.deform.verify()
    group = game_mesh.vertex_groups[WEAPON_BONE].index
    added = {}
    for i in used:
        world = src_mesh.matrix_world @ src_mesh.data.vertices[i].co
        in_hand = src_rot.inverted() @ (world - src_head)
        vert = bm.verts.new(to_mesh @ (dst_head + dst_rot @ (in_hand * RIFLE_SCALE)))
        vert[deform][group] = 1.0
        added[i] = vert
    for face in faces:
        try:
            bm.faces.new([added[i] for i in face])
        except ValueError:
            pass  # duplicate face in the source shell
    bm.to_mesh(game_mesh.data)
    bm.free()
    game_mesh.data.update()
    for arm in (src_armature, armature):
        arm.data.pose_position = "POSE"
    bpy.context.view_layer.update()
    return len(used)


# --- Rebuild the game mesh, read the surface, graft the rifle, then drop
# the sources. ---
game_mesh = rebuild_game_mesh(mesh, armature, TARGET_TRIS, VOXEL_DIVISIONS)
surface = surface_rgb(game_mesh, mesh)
surface_classes = classify_heavy(surface, surface_metallic(game_mesh, mesh))
grafted = graft_weapon(game_mesh)
print(f"grafted {grafted} rifle/hand verts onto {WEAPON_BONE}")
surface = np.vstack([surface, np.zeros((grafted, 3), np.float32)])
surface_classes = np.concatenate([surface_classes, np.full(grafted, GRAPHITE)])
bpy.data.objects.remove(mesh, do_unlink=True)
game_mesh.name = "char1"
write_surface_data(game_mesh, surface, surface_classes, metal_gain=METAL_GAIN)

# Remove the clip source entirely so only the new rig's actions export.
for o in src_objects:
    if o.name in bpy.data.objects:
        bpy.data.objects.remove(o, do_unlink=True)
for action in list(bpy.data.actions):
    if action not in [a for _, a in baked]:
        action.use_fake_user = False
        bpy.data.actions.remove(action)
for name, action in baked:
    action.name = name
# The game and its asset tests find the rig's root node by the standard
# marine's name -- free only now the clip source is gone.
armature.name = "Armature"

# Bind every clip to this armature's own slot (see the standard bake's
# binding loop for why each one must be bound once).
for name, action in baked:
    armature.animation_data.action = action
    armature.animation_data.action_slot = armature.animation_data.action_suitable_slots[0]
armature.animation_data.action = None

# --- Export. ---
bpy.ops.object.select_all(action="DESELECT")
game_mesh.select_set(True)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_skins=True,
    export_yup=True,
    export_vertex_color="ACTIVE",
    export_normals=True,
    export_texcoords=False,
    export_materials="NONE",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_attributes=True,
)
print("wrote", OUT)
