# Merges the real Titan Vanguard 24-bone Mixamo rig with six real captured
# clips into ONE glb: one skinned mesh (decimated for the
# ~160-on-screen-instance budget), the original armature/skeleton untouched,
# and Walking/Running/Dead (from the Titan Vanguard set) plus
# PistolIdle/PistolKneelingIdle/PistolRun (from Mixamo) as separate named
# AnimationClips.
#
# Root-motion handling: the source clips translate the Hips bone
# substantially (the character actually walks/runs across the capture
# volume) rather than looping in place. The game computes each marine's
# screen position procedurally (popup-marine-timeline.ts), so a clip only
# needs to convey its own CYCLE, not move the mesh -- this script zeroes the
# Hips translation's horizontal channels per clip, keeping the vertical axis
# (the walk bob, and a kneeling pose's genuine height drop).
#
# Every non-obvious step below is annotated with the specific Blender 5.x
# "layered actions" / glTF-exporter behaviour that forced it. All of them
# fail SILENTLY (a clean-looking export with wrong data, no warning), so
# please read those comments before simplifying anything here.
#
# Run:
#   blender --background --python bake-popup-marine-titan-model.py -- <out.glb> [targetTriangleCount]
#
# Requires the source assets on disk (not checked into the repo): the
# Meshy AI "Titan Vanguard" export set and three Mixamo Pistol clips --
# see SRC_DIR/DL_DIR below.
import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
TARGET_TRIS = int(argv[1]) if len(argv) > 1 else 6000
TARGET_HEIGHT = 0.052  # matches the rest of the pop-up-marine pipeline's local-unit convention

SRC_DIR = "/Users/benjaminwaye/Downloads/Meshy_AI_Titan_Vanguard_biped/"
DL_DIR = "/Users/benjaminwaye/Downloads/"
BASE = SRC_DIR + "Meshy_AI_Titan_Vanguard_biped_Character_output.glb"
# (label, path, strip root motion?) -- the Mixamo Pistol clips turned out to
# be real multi-frame animations (idle sway / a run cycle), not the static
# single-frame poses they first appeared to be (see the note on
# imported_actions below for why), and PistolRun/PistolKneelingIdle both
# carry substantial Hips drift, so they get the same in-place treatment as
# Walking/Running/Dead.
CLIPS = [
    ("Walking", SRC_DIR + "Meshy_AI_Titan_Vanguard_biped_Animation_Walking_withSkin.glb", True),
    ("Running", SRC_DIR + "Meshy_AI_Titan_Vanguard_biped_Animation_Running_withSkin.glb", True),
    ("Dead", SRC_DIR + "Meshy_AI_Titan_Vanguard_biped_Animation_Dead_withSkin.glb", True),
    ("PistolIdle", DL_DIR + "Pistol Idle.fbx", True),
    ("PistolKneelingIdle", DL_DIR + "Pistol Kneeling Idle.fbx", True),
    ("PistolRun", DL_DIR + "Pistol Run.fbx", True),
]


def import_any(path: str):
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)

bpy.ops.wm.read_factory_settings(use_empty=True)

# --- Import the base (mesh + skin + armature, no animation). ---
bpy.ops.import_scene.gltf(filepath=BASE)
base_mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
base_armature = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
print("base mesh:", base_mesh.name, "tris(approx polys):", len(base_mesh.data.polygons))
print("base armature bones:", [b.name for b in base_armature.data.bones])

# --- Import each animation source, steal its action, strip its objects. ---
# Blender's FBX importer creates TWO actions per file: a degenerate
# single-frame "...|Armature|clip0|baselayer" placeholder (which is what
# armature.animation_data.action points at -- a trap, confirmed by testing:
# using it exports every FBX-sourced clip as identical rest-pose data with
# no error) and the REAL animation as a separate "...|mixamo.com|LayerN"
# action with the actual frame range. Selecting by widest frame range (not
# by animation_data.action) reliably picks the real one; the glTF-sourced
# clips (Walking/Running/Dead) only ever create one action, so this is a
# no-op for them.
imported_actions = []
for label, path, strip_root_motion in CLIPS:
    before_objs = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    import_any(path)
    new_objs = set(bpy.context.scene.objects) - before_objs
    new_actions = set(bpy.data.actions) - before_actions
    action = max(new_actions, key=lambda a: a.frame_range[1] - a.frame_range[0])
    action.name = label
    action.use_fake_user = True  # survive the source objects being deleted
    # Blender's FBX importer also names every action's slot generically
    # ("Slot"), unlike the glTF importer (which uniquifies per source object
    # name, e.g. "Armature.001") -- confirmed by testing: leaving multiple
    # actions sharing an identically-named slot causes the glTF exporter to
    # bake ALL of them as identical rest-pose data (no error, silent data
    # loss). Renaming each action's slot to something unique per clip avoids
    # the collision.
    for slot in action.slots:
        slot.name_display = f"{label}Pose"
    imported_actions.append((label, action, strip_root_motion))
    for obj in new_objs:
        bpy.data.objects.remove(obj, do_unlink=True)
    for stray in new_actions - {action}:
        stray.use_fake_user = False
        if stray.users == 0:
            bpy.data.actions.remove(stray)
    print(f"imported action {label}: {action.frame_range}")

# --- For EVERY clip: bind it to the BASE armature (not the now-deleted
# source one) to resolve a slot valid in that context -- Blender 5.x's
# "layered actions" model ties each action's channelbag to a per-object
# slot (action_suitable_slots), and an action never explicitly bound to the
# base armature this way exports as an empty/rest-pose track even once
# pushed onto an NLA strip (confirmed by testing: skipping this bind step
# for the single-frame pose actions silently baked them all as identical
# rest-pose data in the export, no error). Binding via the base armature's
# own action_suitable_slots guarantees the slot both this script and the
# exporter read/write is the same one -- do this for every action
# regardless of whether it also needs root-motion stripping. ---
base_armature.animation_data_create()
for label, action, strip_root_motion in imported_actions:
    base_armature.animation_data.action = action
    slot = base_armature.animation_data.action_suitable_slots[0]
    base_armature.animation_data.action_slot = slot

    # Drop OBJECT-level channels (data_path "location"/"rotation_*"/"scale",
    # i.e. anything not under pose.bones[...]). An action on an armature can
    # animate the armature OBJECT as well as its pose bones, and these
    # source clips carry the source armature's own scale (0.01) as an
    # object-level track. Exported, that becomes an animation channel on the
    # root node -- which at runtime overwrites the root-node scale this
    # script sets for TARGET_HEIGHT the instant any clip plays, silently
    # resizing the whole rig ~32x (0.01 vs 0.00031). Clips should only ever
    # drive bones here; the root node's transform is ours.
    dropped_object_level = 0
    for layer in action.layers:
        for strip in layer.strips:
            channelbag = strip.channelbag(slot)
            if channelbag is None:
                continue
            for fcurve in list(channelbag.fcurves):
                if not fcurve.data_path.startswith("pose.bones["):
                    channelbag.fcurves.remove(fcurve)
                    dropped_object_level += 1
    if dropped_object_level:
        print(f"dropped {dropped_object_level} object-level fcurves from {label}")

    if not strip_root_motion:
        continue
    removed = 0
    for layer in action.layers:
        for strip in layer.strips:
            channelbag = strip.channelbag(slot)
            if channelbag is None:
                continue
            for fcurve in list(channelbag.fcurves):
                # Strip horizontal root motion (Hips X/Y translation, in
                # BLENDER'S NATIVE Z-UP SPACE -- Blender's internal index 2
                # (Z, "up") is what export_yup remaps to the exported glTF's
                # Y; internal 0/1 (X/Y, the ground plane) become the
                # exported X/Z. Confirmed empirically: stripping (0,2)
                # left horizontal drift in the exported file; (0,1) is the
                # pair that actually zeroes exported X/Z while preserving
                # the vertical bob) so the character animates a walk/run
                # CYCLE in place -- popup-marine-timeline.ts already drives
                # the marine's actual on-tile position.
                if fcurve.data_path == 'pose.bones["Hips"].location' and fcurve.array_index in (0, 1):
                    channelbag.fcurves.remove(fcurve)
                    removed += 1
    print(f"stripped Hips X/Z translation from {label} ({removed} fcurves)")

# NOTE: no NLA tracks are created. Stacking all 6 clips as simultaneous NLA
# tracks/strips on one armature was the previous approach here, but testing
# showed it made every clip export as identical (rest-pose) data -- Blender
# evidently evaluates/bakes each exported clip through the WHOLE current NLA
# stack rather than isolating one strip at a time, so with every track
# active and none muted/soloed, all clips collapsed to the same result.
# export_animation_mode="ACTIONS" below instead scans every action bound to
# the armature via a compatible slot (already set up in the binding loop
# above) and exports each as its own independent clip, with no NLA
# involved.
base_armature.animation_data.action = None

# --- Decimate the mesh (independent of the armature's animation data). ---
bpy.context.view_layer.objects.active = base_mesh
tri_count = sum(len(p.vertices) - 2 for p in base_mesh.data.polygons)
ratio = max(0.02, min(1.0, TARGET_TRIS / max(1, tri_count)))
print(f"source tris: {tri_count}, decimate ratio: {ratio:.4f}")
decimate = base_mesh.modifiers.new(name="Decimate", type="DECIMATE")
decimate.ratio = ratio
bpy.ops.object.modifier_apply(modifier=decimate.name)
decimated_tris = sum(len(p.vertices) - 2 for p in base_mesh.data.polygons)
print("decimated tris:", decimated_tris)

# --- Rescale/recenter to the pipeline's TARGET_HEIGHT convention, feet at
# y=0.
#
# This is deliberately done as an UNAPPLIED object-level transform on the
# armature (exported as the root node's TRS), NOT baked into the data with
# transform_apply. Baking it was tried first and is subtly broken:
# transform_apply(scale=True) on an armature rescales the bone REST data,
# but it does NOT rescale the location keyframes inside already-imported
# actions. The result exports "cleanly" -- correct mesh height, correct
# bone rest translations, no warnings -- but the moment any clip plays, the
# animation's Hips translation is still at the source's ~166-unit scale
# while the rig is 0.052 units tall, so the character is flung ~1000x its
# own height off-screen and collapses to a speck. (Confirmed at runtime:
# hips.position was [-5.3, -50.1, -3.1] on a 0.052-tall rig.)
#
# Leaving the scale on the root node instead means geometry, bone rest
# data, AND animation translations are all scaled by the same parent
# transform at load time, so they can't drift apart. Children (the mesh and
# the bone hierarchy) inherit it automatically. ---
bbox = [v.co for v in base_mesh.data.vertices]
xs, ys, zs = ([v[i] for v in bbox] for i in range(3))
minx, maxx = min(xs), max(xs)
miny, maxy = min(ys), max(ys)
minz, maxz = min(zs), max(zs)
scale = TARGET_HEIGHT / (maxz - minz)
print(f"source LOCAL bbox height: {maxz - minz:.4f}, root-node scale: {scale:.8f}")
base_armature.scale = (scale, scale, scale)
# Node translation is applied in the PARENT's space (glTF node TRS is
# T * R * S), so the recentering offset is expressed in final units.
base_armature.location = (
    -(minx + maxx) / 2 * scale,
    -(miny + maxy) / 2 * scale,
    -minz * scale,
)
bpy.context.view_layer.update()

# --- Vertex-color "kit" paint pass (this mesh ships with NO material and NO
# texture at all -- textures:0, materials:null in the source glb -- so vertex
# colors are the only shading the marine gets).
#
# Painted per RIG REGION (the dominant vertex group / bone of each vertex)
# rather than by the old raw height+width heuristic, which could only ever
# produce two tints: the whole body came out one flat team-colored silhouette
# with a dark cap. Bones give real anatomy for free -- a hand is a hand at
# any pose -- so armor, under-suit, gloves and boots can each read
# differently.
#
# EVERYTHING HERE IS GREYSCALE ON PURPOSE. popup-marine-overlay-fx.ts's
# material multiplies this vertex color by the marine's own attacker/defender
# color, so a value here is really "how much team color does this part
# show": 0.95 = bright team-colored armor plate, 0.12 = near-black kit that
# barely takes the tint at all. Introducing an actual hue here would fight
# the team tint, and team readability at gameplay zoom matters more than
# literal skin/visor colors (a deliberate call -- see the PR discussion).
# NOTE ON THE RANGE: the glTF exporter treats these as sRGB and writes
# LINEAR values into COLOR_0, which crushes the dark end hard -- a first pass
# authored the kit at 0.10-0.16 and it exported as 0.010-0.022 linear, i.e.
# ~1% of the team color. On screen that is just black: the marine lost its
# tint everywhere except the chest plate. Values are therefore kept in a
# LIFTED, COMPRESSED band (roughly 0.36-0.95, which lands at ~0.11-0.89
# linear) so the darkest kit still reads as dark-team-colored rather than as
# a black hole. Relative ordering is what creates the detail; absolute
# darkness just costs team readability.
REGION_VALUES = {
    # Armor plates: the big surfaces that should carry the team color.
    "LeftShoulder": 0.95, "RightShoulder": 0.95,
    "neck": 0.90,  # despite the name this group is the collar/upper chest
    "Spine02": 0.92,
    # Torso underlayer, a step down so the chest plate reads as separate.
    "Spine": 0.74, "Spine01": 0.76, "Hips": 0.72,
    # Upper limbs: mid-tone pads.
    "LeftArm": 0.78, "RightArm": 0.78,
    "LeftUpLeg": 0.75, "RightUpLeg": 0.75,
    # Lower limbs: darker under-suit, so limbs don't merge into the torso.
    "LeftForeArm": 0.54, "RightForeArm": 0.54,
    "LeftLeg": 0.52, "RightLeg": 0.52,
    # Gloves, and the pistol (the weapon is skinned to RightHand).
    "LeftHand": 0.40, "RightHand": 0.38,
    # Helmet and boots: the darkest equipment -- but still tinted.
    "Head": 0.44, "head_end": 0.44, "headfront": 0.44,
    "LeftFoot": 0.38, "RightFoot": 0.38,
    "LeftToeBase": 0.36, "RightToeBase": 0.36,
}
DEFAULT_VALUE = 0.74  # anything unmapped reads as plain torso rather than vanishing

group_names = {g.index: g.name for g in base_mesh.vertex_groups}


def region_value(vertex) -> float:
    """Greyscale value for a vertex, from the bone it is most weighted to."""
    best = max(vertex.groups, key=lambda g: g.weight, default=None)
    if best is None:
        return DEFAULT_VALUE
    return REGION_VALUES.get(group_names.get(best.group, ""), DEFAULT_VALUE)


vcol = base_mesh.data.vertex_colors.new(name="Col")
painted = {}
for poly in base_mesh.data.polygons:
    for li in poly.loop_indices:
        vi = base_mesh.data.loops[li].vertex_index
        value = region_value(base_mesh.data.vertices[vi])
        painted[value] = painted.get(value, 0) + 1
        vcol.data[li].color = (value, value, value, 1.0)
print("vertex-color paint pass, loops per tint:", dict(sorted(painted.items())))

# --- Export: mesh + armature, skin + vertex colors + all NLA-track clips. ---
bpy.ops.object.select_all(action="DESELECT")
base_mesh.select_set(True)
base_armature.select_set(True)
bpy.context.view_layer.objects.active = base_armature
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_skins=True,
    export_yup=True,
    export_vertex_color="ACTIVE",
    export_normals=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
)
print("wrote", OUT)
