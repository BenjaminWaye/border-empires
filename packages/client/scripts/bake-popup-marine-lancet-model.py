# Builds the LANCET GUARD soldier (popup-marine-lancet-24bone.glb): the
# High-noble Houses' paid ancillary look (docs/cosmetics.md). A tall, slender
# honour guard: a swept-back headdress helmet over a mirror-black faceplate
# split by one vertical slit of light, a high collar, sculpted plates and a
# long coat of hard panels. The plates take the team colour; the faceplate is
# mirror-black metal and the slit glows.
#
# Same pipeline as bake-popup-marine-heavy-model.py -- read its header for
# the rig, the retarget and the Blender 5.x traps -- with two differences:
#
#   - Its own rifle. Not the standard marine's rifle grafted on, but the
#     guard's ornate beam rifle, a separate Meshy model (argv[4]), decimated,
#     coloured from its own texture and skinned fully to RightHand -- laid
#     along the hand bone exactly as the standard marine's rifle is (muzzle
#     out along the bone's +y), a little longer, as a ceremonial piece.
#   - The classifier works on geometry as well as colour. Meshy painted the
#     plates a flat pale grey, the filigree too faint to find, and the slit
#     barely brighter than the faceplate; so the faceplate is the front of the
#     head inside the outline of its dark surface, and the slit is a thin
#     strip of extra geometry laid on the glass (see add_slit).
#
# Like the heavy bake, the clips this writes crumple the armour until
# retarget-popup-marine-heavy-clips.py has been run on the output; run it
# before shipping (it works for any rig on Meshy's 24-bone template).
#
# Source (not checked in): text-to-image 01a20f75-c008-76a5-8bad-df52d3792a96
# (concept), image-to-image 01a20f9d-d6c4-71ce-ba43-a0f8a1c345cc (A-pose
# sheet), image-to-3d 01a20f9e-afda-74cf-8c1d-0be1af30b5a5 (textured mesh),
# rigging 01a20faf-c070-77f1-811e-6ded028f196d (height 2.1 m). Meshy keeps
# task outputs only for a limited time.
#
# Run (Blender 5.x, or `python -I` with the bpy wheel):
#   blender --background --python bake-popup-marine-lancet-model.py -- \
#     <meshy-rigged.glb> <popup-marine-titan-24bone.glb> <out.glb> <meshy-rifle.glb> [targetTriangleCount]
import os
import sys
import bpy
import bmesh  # after bpy: the bpy wheel only exposes bmesh once bpy is loaded
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bake_marine_surface import (  # noqa: E402
    GLOW,
    GRAPHITE,
    METAL,
    PANEL,
    hsv_columns,
    rebuild_game_mesh,
    surface_rgb,
    write_surface_data,
)

argv = sys.argv[sys.argv.index("--") + 1:]
SRC_RIG = argv[0]
CLIP_SOURCE = argv[1]
OUT = argv[2]
RIFLE_SRC = argv[3]
TARGET_TRIS = int(argv[4]) if len(argv) > 4 else 5000
TARGET_HEIGHT = 0.052  # same local-unit convention as the standard marine
# Voxel size as a fraction of the soldier's height: fine enough to keep the
# collar, the headdress and the coat panels apart at the triangle budget.
VOXEL_DIVISIONS = 240
# The faceplate: the front-of-head area that is dark (value below FACE_DARK).
# The slit: a strip SLIT_HALF_WIDTH of the soldier's height either side of
# the faceplate's centre line, SLIT_ROWS quads tall.
FACE_DARK = 0.3
SLIT_HALF_WIDTH = 0.0035
SLIT_ROWS = 6
# How far the strip sits in front of the glass, as a fraction of the height,
# so it never z-fights with the faceplate.
SLIT_LIFT = 0.002
FACEPLATE_RGB = (0.03, 0.03, 0.04)
# The rifle, in the RightHand bone's rest frame (units: the baked soldier's,
# 0.052 tall): its stock end at RIFLE_STOCK_Y along the bone, its length
# RIFLE_LENGTH (the standard marine's hand-and-rifle shell spans about
# 0.0155), RIFLE_TRIS triangles. RIFLE_ROLL turns it about its own barrel so
# the grip hangs below the barrel line in the clips' aiming poses.
WEAPON_BONE = "RightHand"
RIFLE_STOCK_Y = -0.0035
RIFLE_LENGTH = 0.021
RIFLE_TRIS = 700
# Voxels along the rifle's length: fine enough to keep the slim barrel whole.
RIFLE_VOXEL_DIVISIONS = 400
RIFLE_ROLL_DEGREES = 0.0
RIFLE_METAL_GAIN = 1.4
SLIT_RGB = (1.0, 0.97, 0.9)

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

# --- Target: the Meshy-rigged lancet guard. ---
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


def head_front_rest(game_mesh):
    """Rest-pose positions (mesh space: +z up, the character faces -y) and a
    mask of the vertices that sit mainly on the Head bone, in front of the
    head's centre."""
    co = np.array([v.co[:] for v in game_mesh.data.vertices])
    head = game_mesh.vertex_groups["Head"].index
    on_head = np.array([
        bool(v.groups) and max(v.groups, key=lambda g: g.weight).group == head for v in game_mesh.data.vertices
    ])
    centre = co[on_head].mean(axis=0)
    return co, on_head & (co[:, 1] < centre[1]), centre


def classify_lancet(game_mesh, rgb):
    """PANEL everywhere the House colour goes; GRAPHITE for the dark undersuit
    and joints; METAL (near-black, mirror) for the whole faceplate. The slit
    is separate geometry (add_slit), because at the triangle budget a few
    glowing vertices smear across the faceplate instead of drawing a line.

    The faceplate is every front-of-head vertex inside the box spanned by the
    dark front-of-head vertices: the voxel rebuild leaves too few of them for
    their colour alone to give a clean oval."""
    _hue, _sat, value = hsv_columns(rgb)
    classes = np.full(len(rgb), PANEL)
    classes[value < FACE_DARK] = GRAPHITE
    co, front, _centre = head_front_rest(game_mesh)
    dark_front = front & (value < FACE_DARK)
    colours = rgb.copy()
    if dark_front.any():
        lo = co[dark_front].min(axis=0)
        hi = co[dark_front].max(axis=0)
        inside = (co[:, 0] >= lo[0]) & (co[:, 0] <= hi[0]) & (co[:, 2] >= lo[2]) & (co[:, 2] <= hi[2])
        face = front & inside
        classes[face] = METAL
        colours[face] = FACEPLATE_RGB
        print(f"faceplate verts {int(face.sum())} (from {int(dark_front.sum())} dark)")
        return classes, colours, (lo, hi)
    print("no faceplate found")
    return classes, colours, None


def add_slit(game_mesh, source_mesh, face_box):
    """Lays a thin glowing strip down the centre of the faceplate, on the
    full-detail source surface (found by casting rays from in front of the
    face), skinned fully to Head. Returns how many vertices it added (they
    are the last ones in the mesh)."""
    lo, hi = face_box
    data = source_mesh.data
    bvh = BVHTree.FromPolygons([v.co for v in data.vertices], [p.vertices[:] for p in data.polygons])
    height = max(v.co.z for v in data.vertices) - min(v.co.z for v in data.vertices)
    half_width = SLIT_HALF_WIDTH * height
    centre_x = (lo[0] + hi[0]) / 2
    # Inset from the faceplate's top and bottom so the strip ends on the glass.
    z_top = hi[2] - (hi[2] - lo[2]) * 0.12
    z_bottom = lo[2] + (hi[2] - lo[2]) * 0.12
    rows = []
    for i in range(SLIT_ROWS + 1):
        z = z_top + (z_bottom - z_top) * i / SLIT_ROWS
        row = []
        for dx in (-half_width, half_width):
            origin = Vector((centre_x + dx, lo[1] - height, z))
            hit, normal, _index, _dist = bvh.ray_cast(origin, Vector((0, 1, 0)))
            if hit is None:
                return 0
            row.append(hit + normal * SLIT_LIFT * height)
        rows.append(row)
    bm = bmesh.new()
    bm.from_mesh(game_mesh.data)
    deform = bm.verts.layers.deform.verify()
    group = game_mesh.vertex_groups["Head"].index
    made = []
    for row in rows:
        verts = [bm.verts.new(p) for p in row]
        for vert in verts:
            vert[deform][group] = 1.0
        made.append(verts)
    for upper, lower in zip(made, made[1:]):
        bm.faces.new([upper[0], lower[0], lower[1], upper[1]])
    bm.to_mesh(game_mesh.data)
    bm.free()
    game_mesh.data.update()
    return 2 * (SLIT_ROWS + 1)


def graft_rifle(game_mesh, rifle_path):
    """Appends the guard's rifle to `game_mesh`, skinned fully to RightHand.
    Returns (vertex count added, their sRGB colours). The source rifle lies
    along its own x axis, z up; its muzzle is the thinner end."""
    objects = import_glb(rifle_path)
    meshes = [o for o in objects if o.type == "MESH"]
    rifle = meshes[0]
    rifle_src = rifle.copy()
    rifle_src.data = rifle.data.copy()
    bpy.context.collection.objects.link(rifle_src)
    bpy.context.view_layer.objects.active = rifle
    # Meshy's rifle is hundreds of loose shells; decimating that shatters it,
    # so it is voxel-remeshed into one closed shell first, like the body.
    length = max(v.co.x for v in rifle.data.vertices) - min(v.co.x for v in rifle.data.vertices)
    remesh = rifle.modifiers.new(name="Remesh", type="REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = length / RIFLE_VOXEL_DIVISIONS
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    tris = sum(len(p.vertices) - 2 for p in rifle.data.polygons)
    decimate = rifle.modifiers.new(name="Decimate", type="DECIMATE")
    decimate.ratio = min(1.0, RIFLE_TRIS / max(1, tris))
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    rgb = surface_rgb(rifle, rifle_src)
    co = np.array([v.co[:] for v in rifle.data.vertices])
    lo, hi = co[:, 0].min(), co[:, 0].max()
    span = hi - lo
    end_width = lambda sel: np.ptp(co[sel, 2]) if sel.any() else 0.0
    muzzle_at_high_x = end_width(co[:, 0] > hi - span * 0.1) < end_width(co[:, 0] < lo + span * 0.1)
    # Along the bone: 0 at the stock, 1 at the muzzle.
    along = (co[:, 0] - lo) / span if muzzle_at_high_x else (hi - co[:, 0]) / span
    scale = RIFLE_LENGTH / span
    side = co[:, 1] * scale * (1 if muzzle_at_high_x else -1)
    up = (co[:, 2] - (co[:, 2].min() + co[:, 2].max()) / 2) * scale
    roll = np.radians(RIFLE_ROLL_DEGREES)
    in_hand = np.stack([
        side * np.cos(roll) - up * np.sin(roll),
        RIFLE_STOCK_Y + along * RIFLE_LENGTH,
        side * np.sin(roll) + up * np.cos(roll),
    ], axis=1)
    hand_head, hand_rot = (armature.matrix_world @ armature.data.bones[WEAPON_BONE].matrix_local).decompose()[:2]
    to_mesh = game_mesh.matrix_world.inverted()
    bm = bmesh.new()
    bm.from_mesh(game_mesh.data)
    deform = bm.verts.layers.deform.verify()
    group = game_mesh.vertex_groups[WEAPON_BONE].index
    made = []
    for point in in_hand:
        vert = bm.verts.new(to_mesh @ (hand_head + hand_rot @ Vector(point)))
        vert[deform][group] = 1.0
        made.append(vert)
    faces = 0
    source_faces = len(rifle.data.polygons)
    for poly in rifle.data.polygons:
        try:
            bm.faces.new([made[i] for i in poly.vertices])
            faces += 1
        except ValueError:
            pass  # degenerate or duplicate face left by the decimation
    bm.to_mesh(game_mesh.data)
    bm.free()
    game_mesh.data.update()
    for o in objects + [rifle_src]:
        if o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    print(f"rifle: {len(made)} verts, {faces}/{source_faces} faces, muzzle at {'+' if muzzle_at_high_x else '-'}x of the source")
    print(f"rifle in hand frame: min {in_hand.min(axis=0).round(4)} max {in_hand.max(axis=0).round(4)}; source span {span:.3f}")
    return len(made), rgb


def classify_rifle(rgb):
    """Bare metal in its own colour (graphite body, gold filigree), except the
    energy channel along the barrel, which glows."""
    hue, sat, value = hsv_columns(rgb)
    classes = np.full(len(rgb), METAL)
    classes[(sat > 0.35) & (value > 0.45) & (hue > 170) & (hue < 250)] = GLOW
    return classes


# --- Rebuild the game mesh, read the surface, then drop the sources. ---
game_mesh = rebuild_game_mesh(mesh, armature, TARGET_TRIS, VOXEL_DIVISIONS)
armature.data.pose_position = "REST"
bpy.context.view_layer.update()
surface_classes, surface, face_box = classify_lancet(game_mesh, surface_rgb(game_mesh, mesh))
added = add_slit(game_mesh, mesh, face_box) if face_box else 0
print(f"slit strip: {added} verts")
rifle_added, rifle_rgb = graft_rifle(game_mesh, RIFLE_SRC)
surface = np.vstack([surface, np.tile(np.array(SLIT_RGB, np.float32), (added, 1)), rifle_rgb])
surface_classes = np.concatenate([surface_classes, np.full(added, GLOW), classify_rifle(rifle_rgb)])
armature.data.pose_position = "POSE"
bpy.context.view_layer.update()
bpy.data.objects.remove(mesh, do_unlink=True)
game_mesh.name = "char1"
write_surface_data(game_mesh, surface, surface_classes, metal_gain=RIFLE_METAL_GAIN)

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
