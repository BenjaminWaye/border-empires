"""Blender study; leaves runtime GLBs untouched. Run with Blender --background --python.

Arguments after --: repository, output directory (containing reference-structures.json).
The reference JSON contains actual district geometry exported from createDistrictGeometry.
"""
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

repo, output = map(Path, sys.argv[sys.argv.index("--") + 1:])
output.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.world.color = (0.16, 0.16, 0.16)
scene.view_settings.view_transform = "AgX"


def linear(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb) + (1,)


def material(name, color, roughness=0.64, metalness=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = linear(color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = linear(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metalness
    return mat


# Exact production town palette, with the district material response.
mats = {
    "stone": material("Town stone / #777a80", "#777a80"),
    "stoneLight": material("Town pale stone / #8b8e94", "#8b8e94"),
    "stoneDark": material("Town dark stone / #5d6066", "#5d6066"),
    "iron": material("Town iron / #3a3e46", "#3a3e46", 0.32, 0.76),
    "ironDark": material("Town dark iron / #25282e", "#25282e", 0.38, 0.65),
    "brass": material("Town aged brass / #c9a05a", "#c9a05a", 0.32, 0.76),
    "brassDark": material("Town dark brass / #8b6c3d", "#8b6c3d", 0.38, 0.76),
    "water": material("Town water / #4f8fae", "#4f8fae", 0.16, 0.45),
    "glass": material("Town glass / #56788a", "#56788a", 0.16, 0.65),
}


def collection(name):
    result = bpy.data.collections.new(name)
    scene.collection.children.link(result)
    return result


def move(obj, group):
    for parent in list(obj.users_collection):
        parent.objects.unlink(obj)
    group.objects.link(obj)


def import_glb(name, filename):
    group = collection(name)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(repo / "packages/client/public/models" / filename))
    objects = [o for o in bpy.data.objects if o not in before]
    for obj in objects:
        move(obj, group)
    return group, objects


def fit(group, x):
    meshes = [o for o in group.objects if o.type == "MESH"]
    points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    low = Vector(tuple(min(p[a] for p in points) for a in range(3)))
    high = Vector(tuple(max(p[a] for p in points) for a in range(3)))
    root = bpy.data.objects.new(group.name + " / fitted root", None)
    group.objects.link(root)
    for obj in list(group.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    scale = 0.86 / max(high.x - low.x, high.y - low.y)
    root.scale = (scale,) * 3
    root.location = (x - (low.x + high.x) / 2 * scale, -(low.y + high.y) / 2 * scale, -low.z * scale)
    # Same three-quarter view on both fish models.
    return root


current, _ = import_glb("01 Current game fish tile", "fishing-detailed.glb")
# The current runtime multiplies baked colours by a rough, non-metallic material.
for obj in current.objects:
    if obj.type != "MESH":
        continue
    for face in obj.data.polygons:
        face.use_smooth = False
    obj.data.update()
    attr = obj.data.color_attributes.active_color
    for mat in obj.data.materials:
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Roughness"].default_value = 0.83
        bsdf.inputs["Metallic"].default_value = 0
        # Match the runtime DoubleSide material, including the reflected hoist.
        mat.use_backface_culling = False
        if attr:
            node = mat.node_tree.nodes.new("ShaderNodeVertexColor")
            node.layer_name = attr.name
            mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
fit(current, -0.63)
current.hide_render = True
current.hide_viewport = True

proposal, objects = import_glb("02 Proposed game palette and industrial detailing", "fishing2.glb")
for obj in objects:
    if obj.type != "MESH":
        continue
    basin = obj.name.startswith("Cylinder")
    original_materials = list(obj.data.materials)
    for index, old in enumerate(original_materials):
        name = old.name.split("_")[0]
        if basin:
            key = "water" if "002" in name else "iron"
        else:
            key = {
                "Material": "iron", "Material.001": "stoneLight",
                "Material.003": "stoneDark", "Material.004": "brassDark",
                "Material.005": "stoneDark", "Material.006": "glass",
                "Material.007": "ironDark", "Material.008": "ironDark",
                "Material.009": "stone", "Material.010": "stoneLight", "Fish": "ironDark"
            }.get(name, "iron")
        obj.data.materials[index] = mats[key]
    # Physically small edge breaks catch the key light without softening the silhouette.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)
    bevel = obj.modifiers.new("Small manufactured edge breaks", "BEVEL")
    bevel.width = 0.003
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(32)
    bevel.affect = "EDGES"
    normals = obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
    normals.keep_sharp = True


def xyz(point):
    x, y, z = point
    return (x, -z, y)


def box(name, point, dims, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(point))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (dims[0], dims[2], dims[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mats[mat])
    bevel = obj.modifiers.new("Edge chamfer", "BEVEL")
    bevel.width = 0.002
    bevel.segments = 1
    move(obj, proposal)
    return obj


def ring(name, point, radius, thickness, mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=6, location=xyz(point), major_radius=radius, minor_radius=thickness)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mats[mat])
    move(obj, proposal)
    return obj


for basin_index, z in enumerate([-0.2735, 0.4055]):
    ring(f"Basin {basin_index + 1} / brass rim", (0.332, 0.103, z), 0.22, 0.006, "brass")
    ring(f"Basin {basin_index + 1} / heavy iron footing", (0.332, 0.009, z), 0.22, 0.008, "ironDark")
    for i in range(12):
        a = i * math.tau / 12
        rib = box("Basin radial reinforcing strap", (0.332 + 0.221 * math.cos(a), 0.055, z + 0.221 * math.sin(a)), (0.012, 0.078, 0.012), "brassDark")
        rib.rotation_euler.z = -a
    # Subtle water ripples, deliberately no luminous aether or gameplay signal.
    ring("Still water ripple", (0.332, 0.076, z), 0.13, 0.0012, "water")
    for x in [0.306, 0.358]:
        box("Basin access ladder rail", (x, 0.054, z - 0.212), (0.005, 0.105, 0.006), "iron")
    for i in range(4):
        box("Basin ladder rung", (0.332, 0.018 + i * 0.023, z - 0.218), (0.055, 0.004, 0.006), "brass")

fit(proposal, 0)


def references():
    data = json.loads((output / "reference-structures.json").read_text())
    group = collection("03 Actual production Hydroworks and Manufactory reference")
    for kind, x in [("HYDROWORKS", -0.63), ("MANUFACTORY", 0.63)]:
        for layer, attributes in data[kind].items():
            if layer in ("steam", "halo"):
                continue
            positions = attributes["positions"]
            vertices = [xyz(positions[i:i + 3]) for i in range(0, len(positions), 3)]
            indices = attributes["indices"] or list(range(len(vertices)))
            faces = [indices[i:i + 3] for i in range(0, len(indices), 3)]
            mesh = bpy.data.meshes.new(kind + " / " + layer)
            mesh.from_pydata(vertices, [], faces)
            mesh.update()
            obj = bpy.data.objects.new(mesh.name, mesh)
            group.objects.link(obj)
            obj.location = (x, 1.2, 0)
            response = {"metal": (0.32, 0.76), "glass": (0.16, 0.65)}.get(layer, (0.64, 0.04))
            mat = material(mesh.name + " material", "#ffffff", *response)
            colors = mesh.color_attributes.new(name="Game vertex colours", type="FLOAT_COLOR", domain="POINT")
            rgb = attributes["colors"]
            for i, datum in enumerate(colors.data):
                datum.color = tuple(rgb[i * 3:i * 3 + 3]) + (1,)
            node = mat.node_tree.nodes.new("ShaderNodeVertexColor")
            node.layer_name = colors.name
            mat.node_tree.links.new(node.outputs["Color"], mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
            if layer == "glow":
                bsdf = mat.node_tree.nodes.get("Principled BSDF")
                mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Emission Color"])
                bsdf.inputs["Emission Strength"].default_value = 0.6
            mesh.materials.append(mat)
    return group


reference_group = references()
ground_mat = material("Neutral presentation ground", "#253531", 0.88)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.012))
ground = bpy.context.object
ground.name = "Presentation ground / not game geometry"
ground.data.materials.append(ground_mat)


def area(name, point, energy, size, color):
    data = bpy.data.lights.new(name, "AREA")
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = point
    obj.rotation_euler = (Vector((0, 0, 0.2)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color


area("Warm broad key", (-2, -3, 5), 450, 4, (1, 0.9, 0.76))
area("Cool sky fill", (3, 0, 4), 300, 3, (0.74, 0.86, 1))
area("Soft rear rim", (0, 3, 4), 350, 3, (0.86, 0.94, 1))
bpy.ops.object.camera_add(location=(2.8, -5, 3.7))
camera = bpy.context.object
camera.name = "Study camera"
camera.rotation_euler = (Vector((0, 0.35, 0.1)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 3.05
scene.camera = camera

label_material = material("Presentation lettering", "#e3dfce")
label_bsdf = label_material.node_tree.nodes.get("Principled BSDF")
label_bsdf.inputs["Emission Color"].default_value = linear("#e3dfce")
label_bsdf.inputs["Emission Strength"].default_value = 0.8


def label(group, text, x, y, size=0.044):
    data = bpy.data.curves.new(text, "FONT")
    data.body = text
    data.align_x = "CENTER"
    data.size = size
    data.materials.append(label_material)
    obj = bpy.data.objects.new(text, data)
    group.objects.link(obj)
    obj.parent = camera
    obj.location = (x, y, -1)
    return obj


comparison_labels = collection("Presentation labels / fish comparison")
label(comparison_labels, "FISH BASINS / GAME-PALETTE PROPOSAL", 0, 0.41, 0.037)
label(comparison_labels, "Iron / aged brass / stone / still water", 0, 0.34, 0.026)
context_labels = collection("Presentation labels / production context")
label(context_labels, "HYDROWORKS / PRODUCTION MODEL", -0.63, 0.73)
label(context_labels, "MANUFACTORY / PRODUCTION MODEL", 0.63, 0.73)
label(context_labels, "PROPOSED FISH TILE / SAME GAME PALETTE", 0, -0.015)
context_labels.hide_render = True

# First render the proposed treatment alone. The current asset remains an
# editable, hidden reference collection in the saved file.
reference_group.hide_render = True
camera.location = (0, -4.5, 3.4)
camera.rotation_euler = (Vector((0, 0, 0.12)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.ortho_scale = 1.75
scene.render.filepath = str(output / "fish-material-study.png")
bpy.ops.wm.save_as_mainfile(filepath=str(output / "fish-basin-style-study.blend"))
bpy.ops.render.render(write_still=True)
reference_group.hide_render = False
comparison_labels.hide_render = True
context_labels.hide_render = False
camera.location = (0, -5, 4.6)
camera.rotation_euler = (Vector((0, 0.65, 0.12)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.ortho_scale = 3.2
scene.render.filepath = str(output / "fish-game-context-study.png")
bpy.ops.render.render(write_still=True)
# Opening the .blend shows the comparison immediately in material view.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "CAMERA"
            area.spaces.active.shading.type = "MATERIAL"
comparison_labels.hide_viewport = True
scene["Study scope"] = "Editable proposal only. Runtime GLBs and both game renderers are unchanged."
scene["Reference provenance"] = "Hydroworks and Manufactory meshes exported from createDistrictGeometry; palette from TOWN_COLORS."
bpy.ops.wm.save_as_mainfile(filepath=str(output / "fish-basin-style-study.blend"))
print("STUDY_COMPLETE", str(output))
