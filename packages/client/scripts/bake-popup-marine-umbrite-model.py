# Builds the UMBRITE heavy trooper (popup-marine-umbrite-24bone.glb) that an
# empire owning an Umbrite Weapons Factory fields in two of its squad's
# slots -- see packages/client/src/client-map-3d-popup-marine/popup-marine-units.ts.
# A marine-sized infantryman in dark-iron and brass plate with an Umbrite
# cannon built onto his right shoulder (violet-black core, orange fissures)
# fed from a drum on his back.
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
# Mesh rebuild and surface classes (iron/brass metal, grey faction panels,
# dark undersuit, glowing violet core and orange visor/fissures) are the
# shared steps in bake_marine_surface.py -- see its header. Everything else
# mirrors bake-popup-marine-titan-model.py (root-node scale to TARGET_HEIGHT,
# ACTIONS export) -- read that file's comments for the Blender 5.x glTF
# traps each step avoids.
#
# Run (Blender 5.x, or `python -I` with the bpy wheel):
#   blender --background --python bake-popup-marine-umbrite-model.py -- \
#     <meshy-rigged.glb> <popup-marine-titan-24bone.glb> <out.glb> [targetTriangleCount]
import os
import sys
import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bake_marine_surface import GLOW, GRAPHITE, METAL, PANEL, hsv_columns, rebuild_game_mesh, surface_rgb, write_surface_data  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
SRC_RIG = argv[0]
CLIP_SOURCE = argv[1]
OUT = argv[2]
TARGET_TRIS = int(argv[3]) if len(argv) > 3 else 6000
TARGET_HEIGHT = 0.052  # same local-unit convention as the standard marine
# Voxel size as a fraction of the trooper's height; fine enough to keep the
# cannon barrel, drum hose and brass bands readable at the triangle budget.
VOXEL_DIVISIONS = 200
# Meshy stores the iron and brass darker than they should read.
METAL_GAIN = 1.35

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
clips = {a.name: a for a in bpy.data.actions if a.name in CLIP_NAMES}
missing = [name for name in CLIP_NAMES if name not in clips]
if missing:
    raise SystemExit(f"clip source is missing {missing}")
for action in clips.values():
    action.use_fake_user = True

# --- Target: the Meshy-rigged Umbrite trooper. ---
new_objects = import_glb(SRC_RIG)
armature, meshes = armature_and_mesh(new_objects)
if len(meshes) > 1:
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
mesh = meshes[0]
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

# Bind every clip to this armature's own slot (see the standard bake's
# binding loop for why each one must be bound once).
for name, action in baked:
    armature.animation_data.action = action
    armature.animation_data.action_slot = armature.animation_data.action_suitable_slots[0]
armature.animation_data.action = None


def classify_trooper(rgb):
    """Measured on the trooper's texture: dark iron is low-saturation grey
    (value ~0.2-0.4), brass a warm yellow (hue ~30-60), the faction panels a
    neutral light grey (value > ~0.55), the undersuit near-black; the cannon
    core glows violet (hue ~230-300) and the visor and fissures orange
    (hue < ~30, bright)."""
    hue, sat, value = hsv_columns(rgb)
    classes = np.full(len(rgb), METAL)
    classes[value < 0.18] = GRAPHITE
    classes[(value > 0.55) & (sat < 0.2)] = PANEL
    violet = (sat > 0.4) & (hue > 230) & (hue < 300)
    orange = (sat > 0.6) & (value > 0.7) & ((hue < 30) | (hue > 340))
    classes[violet | orange] = GLOW
    return classes


# --- Rebuild the game mesh, read the surface, then drop the source. ---
game_mesh = rebuild_game_mesh(mesh, armature, TARGET_TRIS, VOXEL_DIVISIONS)
surface = surface_rgb(game_mesh, mesh)
surface_classes = classify_trooper(surface)
bpy.data.objects.remove(mesh, do_unlink=True)
game_mesh.name = "char1"

# --- Make the shoulder cannon and the back-mounted ammo drum rigid with the
# torso. Meshy's biped rig skins the cannon to the right ARM and the drum to
# the shoulders/arms, so every arm swing would bend and stretch them; both
# are built onto the body, so they ride on the upper spine instead. The
# cannon is what sits above shoulder height on the right side (local -X is
# the trooper's right); the drum is what sits behind the torso (local +Y is
# his back) above the waist. ---
# The voxel rebuild fuses cannon and pauldron into one shell, so a hard cut
# between "rides the spine" and "follows the arm" tears that seam into a
# stretched fan whenever the arm lifts: across a blend band the spine's
# share ramps up, and above it the cannon is fully rigid.
CANNON_BONE = "Spine02"
CANNON_BLEND = (0.72, 0.84)  # fraction of the trooper's height
DRUM_MIN_HEIGHT = 0.5  # fraction of the trooper's height
DRUM_BLEND = (0.25, 0.45)  # fraction of the half-depth behind the torso centre
verts = game_mesh.data.vertices
zs = [v.co.z for v in verts]
xs = [v.co.x for v in verts]
low, high = min(zs), max(zs)
right_edge = min(xs) * 0.4
back = max(v.co.y for v in verts)
cannon_index = game_mesh.vertex_groups[CANNON_BONE].index
cannon = []


def rigid_share(vertex):
    """How much of `vertex` rides the spine: 1 inside the cannon or drum,
    ramping to 0 across their blend bands."""
    height = (vertex.co.z - low) / (high - low)
    cannon_t = (height - CANNON_BLEND[0]) / (CANNON_BLEND[1] - CANNON_BLEND[0]) if vertex.co.x < right_edge else 0.0
    drum_t = (vertex.co.y / back - DRUM_BLEND[0]) / (DRUM_BLEND[1] - DRUM_BLEND[0]) if height > DRUM_MIN_HEIGHT else 0.0
    return max(0.0, min(1.0, max(cannon_t, drum_t)))


for vertex in verts:
    share = rigid_share(vertex)
    if share <= 0:
        continue
    if share >= 1.0 and vertex.co.x < right_edge and (vertex.co.z - low) / (high - low) > CANNON_BLEND[1]:
        cannon.append(vertex)
    for g in list(vertex.groups):
        if g.group == cannon_index:
            continue
        weight = g.weight * (1.0 - share)
        if weight > 1e-4:
            game_mesh.vertex_groups[g.group].add([vertex.index], weight, "REPLACE")
        else:
            game_mesh.vertex_groups[g.group].remove([vertex.index])
    own = next((g.weight for g in vertex.groups if g.group == cannon_index), 0.0)
    game_mesh.vertex_groups[cannon_index].add([vertex.index], own * (1.0 - share) + share, "REPLACE")
print(f"rigid cannon + drum: cannon {len(cannon)} verts fully on {CANNON_BONE}")

# --- A "Muzzle" bone at the cannon's mouth, so the game can pin the muzzle
# flash there (popup-marine-slot.ts) like it pins a marine's to its hand.
# Forward is local -Y; the mouth is the front-most slice of the cannon. ---
MUZZLE_BONE = "Muzzle"
front = min(v.co.y for v in cannon)
depth = max(v.co.y for v in cannon) - front
mouth = [v.co for v in cannon if v.co.y < front + depth * 0.08]
mouth_local = sum(mouth, mouth[0] * 0) / len(mouth)
to_armature = armature.matrix_world.inverted() @ game_mesh.matrix_world
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="EDIT")
muzzle = armature.data.edit_bones.new(MUZZLE_BONE)
muzzle.parent = armature.data.edit_bones[CANNON_BONE]
muzzle.head = to_armature @ mouth_local
muzzle.tail = muzzle.head + (to_armature.to_3x3() @ mouth_local.__class__((0.0, -depth * 0.1, 0.0)))
bpy.ops.object.mode_set(mode="OBJECT")
print(f"muzzle bone at {tuple(round(c, 2) for c in mouth_local)} (mesh local)")
write_surface_data(game_mesh, surface, surface_classes, metal_gain=METAL_GAIN)

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
