"""Tighten the saved proposal without shrinking its basins; export a preview GLB.

blender --background <original-study.blend> --python scripts/compact-blender-fish-study.py -- <output.glb> <output.blend>
"""
from pathlib import Path
import sys

import bpy
from mathutils import Vector

export_path, blend_path = map(Path, sys.argv[sys.argv.index("--") + 1:])
proposal = bpy.data.collections["02 Proposed game palette and industrial detailing"]
proposal.hide_render = proposal.hide_viewport = False
meshes = [obj for obj in proposal.objects if obj.type == "MESH"]
# Bake the existing fit into each object before arranging in game tile units.
for obj in meshes:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
bpy.context.view_layer.update()


def center(obj):
    return sum((obj.matrix_world @ Vector(p) for p in obj.bound_box), Vector()) / 8


hut = {"Cube", "Cube.007", "Cone.001", "Cone.002", "Cone.003"}
supplies = {"Cube.002", "Cube.006", "Cube.008", "Cube.009", "Cube.011"}
for obj in meshes:
    p = center(obj)
    if obj.name in hut:
        obj.location += Vector((0.10, -0.12, 0))
    elif obj.name in supplies:
        continue
    else:
        # Move complete basin/hoist assemblies, retaining basket alignment.
        obj.location += Vector((-0.085, 0.041 if p.y > -0.08 else 0.13, 0))

# Replace the scattered, differently oriented blocks with one tidy stack below.
for name in ["Cube.002", "Cube.006", "Cube.008", "Cube.009"]:
    bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
cooler = bpy.data.objects["Cube.011"]
cooler.location += Vector((-0.17, -0.24, 0.042)) - center(cooler)
bpy.context.view_layer.update()

stone = next(mat for mat in bpy.data.materials if mat.name.startswith("Town dark stone"))
iron = next(mat for mat in bpy.data.materials if mat.name.startswith("Town dark iron"))
brass = next(mat for mat in bpy.data.materials if mat.name.startswith("Town dark brass"))


def box(name, point, dimensions, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    for group in list(obj.users_collection):
        group.objects.unlink(obj)
    proposal.objects.link(obj)
    bevel = obj.modifiers.new("Small edge break", "BEVEL")
    bevel.width = 0.0015
    bevel.segments = 1
    return obj


for index in range(4):
    x, y, z = -0.175, -0.12 + (index % 2) * 0.052, 0.024 + (index // 2) * 0.041
    box("Stacked supply case", (x, y, z), (0.16, 0.045, 0.04), stone)
    for band_x in [x - 0.048, x + 0.048]:
        box("Supply case iron band", (band_x, y, z + 0.021), (0.008, 0.047, 0.003), iron)

# A dark roof cap and restrained framing connect the hut to town architecture.
house = bpy.data.objects["Cube.007"]
p = center(house)
box("Control hut iron roof cap", (p.x, p.y, 0.174), (0.218, 0.26, 0.012), iron)
for x in [p.x - 0.1, p.x + 0.1]:
    box("Control hut corner iron", (x, p.y - 0.124, 0.085), (0.009, 0.008, 0.16), iron)
box("Control hut brass lintel", (p.x, p.y - 0.13, 0.13), (0.09, 0.006, 0.007), brass)
box("Control hut door recess", (p.x, p.y - 0.128, 0.065), (0.068, 0.006, 0.105), stone)

bpy.ops.object.select_all(action="DESELECT")
for obj in proposal.objects:
    obj.hide_set(False)
    obj.select_set(True)
export_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(export_path), export_format="GLB", use_selection=True,
    export_apply=True, export_materials="EXPORT", export_cameras=False,
    export_lights=False, export_animations=False)
scene = bpy.context.scene
scene["Compact layout"] = "Basin dimensions retained; supplies stacked; smaller apron supplied by Storybook. Preview only."
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print("COMPACT_FISH_EXPORTED", str(export_path))
