# Builds the TITANIUM-ARMOUR marine (popup-marine-titanium-24bone.glb) worn
# by squads of an empire that owns a Titanium Weapons Factory -- see
# packages/client/src/client-map-3d-popup-marine/popup-marine-armor.ts.
#
# Input is a Meshy-rigged heavier-plated sculpt (Meshy's biped auto-rig, the
# same 24-bone template the standard Titan Vanguard marine was rigged with,
# so every bone name matches). Its animation comes from the CHECKED-IN
# standard marine (popup-marine-titan-24bone.glb) rather than re-downloading
# the Mixamo sources bake-popup-marine-titan-model.py needs: each clip is
# retargeted bone-for-bone by name.
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
# Everything after the retarget mirrors bake-popup-marine-titan-model.py
# (decimate, root-node scale to TARGET_HEIGHT, greyscale per-bone vertex
# paint, ACTIONS export) -- read that file's comments for the Blender 5.x
# glTF traps each step avoids.
#
# Run (Blender 5.x, or `python -I` with the bpy wheel):
#   blender --background --python bake-popup-marine-titanium-model.py -- \
#     <meshy-rigged.glb> <popup-marine-titan-24bone.glb> <out.glb> [targetTriangleCount]
import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
SRC_RIG = argv[0]
CLIP_SOURCE = argv[1]
OUT = argv[2]
TARGET_TRIS = int(argv[3]) if len(argv) > 3 else 6000
TARGET_HEIGHT = 0.052  # same local-unit convention as the standard marine

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

# --- Target: the Meshy-rigged titanium sculpt. ---
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

# --- Decimate. ---
bpy.context.view_layer.objects.active = mesh
tri_count = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
ratio = max(0.02, min(1.0, TARGET_TRIS / max(1, tri_count)))
decimate = mesh.modifiers.new(name="Decimate", type="DECIMATE")
decimate.ratio = ratio
bpy.ops.object.modifier_apply(modifier=decimate.name)
print(f"tris {tri_count} -> {sum(len(p.vertices) - 2 for p in mesh.data.polygons)}")

# Meshy ships a textured PBR material; the game shades marines purely by
# vertex colour x team tint (popup-marine-slot.ts), so drop it.
mesh.data.materials.clear()

# --- Greyscale per-bone paint: "how much team colour shows" (see the
# standard bake for the sRGB/linear band these values sit in). Titanium
# reads as MORE plate than the standard kit: limbs and helmet step up so the
# armour covers the body, with joints/gloves/boots left darker for contrast.
REGION_VALUES = {
    "LeftShoulder": 0.97, "RightShoulder": 0.97,
    "neck": 0.92, "Spine02": 0.95,
    "Spine": 0.80, "Spine01": 0.82, "Hips": 0.76,
    "LeftArm": 0.88, "RightArm": 0.88,
    "LeftUpLeg": 0.84, "RightUpLeg": 0.84,
    "LeftForeArm": 0.72, "RightForeArm": 0.72,
    "LeftLeg": 0.70, "RightLeg": 0.70,
    "LeftHand": 0.42, "RightHand": 0.40,
    "Head": 0.66, "head_end": 0.66, "headfront": 0.66,
    "LeftFoot": 0.44, "RightFoot": 0.44,
    "LeftToeBase": 0.40, "RightToeBase": 0.40,
}
DEFAULT_VALUE = 0.80
group_names = {g.index: g.name for g in mesh.vertex_groups}


def region_value(vertex) -> float:
    best = max(vertex.groups, key=lambda g: g.weight, default=None)
    if best is None:
        return DEFAULT_VALUE
    return REGION_VALUES.get(group_names.get(best.group, ""), DEFAULT_VALUE)


for layer in list(mesh.data.color_attributes):
    mesh.data.color_attributes.remove(layer)
vcol = mesh.data.vertex_colors.new(name="Col")
for poly in mesh.data.polygons:
    for li in poly.loop_indices:
        value = region_value(mesh.data.vertices[mesh.data.loops[li].vertex_index])
        vcol.data[li].color = (value, value, value, 1.0)

# --- Export. ---
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
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
)
print("wrote", OUT)
