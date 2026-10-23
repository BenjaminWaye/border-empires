# Shared steps for baking a Meshy-made battle unit (a weapons factory's
# specialist -- see packages/client/src/client-map-3d-popup-marine/
# popup-marine-units.ts) into the game's marine format. Imported by
# bake-popup-marine-titanium-model.py and bake-popup-marine-umbrite-model.py;
# a new factory's unit bake reuses it and supplies only its own surface
# classifier.
#
#   rebuild_game_mesh   Meshy meshes are millions of triangles in hundreds of
#                       loose shells; decimating that to the instance budget
#                       shatters it, so the body is voxel-remeshed into one
#                       closed shell, decimated, and the rig's skin weights are
#                       copied back from the full-detail mesh.
#   surface_rgb         reads Meshy's base-colour texture at the full-detail
#                       surface point nearest each game-mesh vertex (surface,
#                       not source vertices: big flat panels have few
#                       vertices but a lot of area).
#   write_surface_data  writes COLOR_0 and the custom _MASK attribute from
#                       per-vertex classes. The game's shader
#                       (popup-marine-metal-material.ts) reads them as:
#                         PANEL     COLOR_0 bright grey -> team colour
#                         GRAPHITE  COLOR_0 dark grey   -> dark team colour
#                         METAL     COLOR_0 = the metal's own sampled colour,
#                                   _MASK.x = 1 -> reflective bare metal
#                         GLOW      COLOR_0 = the glow's own sampled colour,
#                                   _MASK.y = 1 -> emissive
# Export with export_attributes=True so _MASK reaches the .glb.
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

METAL, PANEL, GRAPHITE, GLOW = range(4)
CLASS_NAMES = {METAL: "metal", PANEL: "panel", GRAPHITE: "graphite", GLOW: "glow"}
# Team-colour share COLOR_0 carries for the painted classes (see the
# standard bake for the sRGB/linear band these values sit in).
PANEL_TINT = 0.95
GRAPHITE_TINT = 0.38
# Half-width, in texels, of the box filter each texture read averages over,
# so a vertex reads its surface's colour rather than one speckled texel.
TEXEL_FILTER = 3


def hsv_columns(rgb):
    """(hue in degrees, saturation, value) columns of an (n, 3) sRGB array."""
    value = rgb.max(axis=1)
    low = rgb.min(axis=1)
    delta = value - low
    sat = delta / np.maximum(value, 1e-6)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    safe = np.maximum(delta, 1e-6)
    hue = np.where(value == r, ((g - b) / safe) % 6, np.where(value == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60
    return np.where(delta > 0, hue, 0.0), sat, value


def rebuild_game_mesh(source_mesh, armature, target_tris, voxel_divisions):
    """One closed, decimated copy of `source_mesh` skinned like it. The source
    is left in place (callers still sample its texture) and must be removed by
    the caller afterwards.

    The armature is held in its REST pose throughout: after a retarget or a
    clip bind it still carries the last pose it evaluated, and the weight
    transfer reads the source mesh as evaluated -- a posed source mapped
    onto the rest-pose copy hands every vertex the wrong bones (the first
    Umbrite bake came out shredded in every clip)."""
    pose_position = armature.data.pose_position
    armature.data.pose_position = "REST"
    bpy.context.view_layer.update()
    mesh = source_mesh.copy()
    mesh.data = source_mesh.data.copy()
    bpy.context.collection.objects.link(mesh)
    for modifier in list(mesh.modifiers):
        mesh.modifiers.remove(modifier)
    mesh.vertex_groups.clear()
    local_height = max(v.co.z for v in mesh.data.vertices) - min(v.co.z for v in mesh.data.vertices)
    bpy.context.view_layer.objects.active = mesh
    remesh = mesh.modifiers.new(name="Remesh", type="REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = local_height / voxel_divisions
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    voxel_tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    decimate = mesh.modifiers.new(name="Decimate", type="DECIMATE")
    decimate.ratio = min(1.0, target_tris / max(1, voxel_tris))
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    print(f"voxel tris {voxel_tris} -> {sum(len(p.vertices) - 2 for p in mesh.data.polygons)}")
    for group in source_mesh.vertex_groups:
        mesh.vertex_groups.new(name=group.name)
    transfer = mesh.modifiers.new(name="Weights", type="DATA_TRANSFER")
    transfer.object = source_mesh
    transfer.use_vert_data = True
    transfer.data_types_verts = {"VGROUP_WEIGHTS"}
    transfer.vert_mapping = "POLYINTERP_NEAREST"
    transfer.layers_vgroup_select_src = "ALL"
    transfer.layers_vgroup_select_dst = "NAME"
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    skin = mesh.modifiers.new(name="Armature", type="ARMATURE")
    skin.object = armature
    mesh.data.materials.clear()
    armature.data.pose_position = pose_position
    bpy.context.view_layer.update()
    return mesh


def _base_colour_pixels(obj):
    material = obj.data.materials[0]
    image = next(
        node.image
        for node in material.node_tree.nodes
        if node.type == "TEX_IMAGE" and any(link.to_socket.name == "Base Color" for link in node.outputs[0].links)
    )
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)[:, :, :3]


def surface_rgb(target, source):
    """(n, 3) sRGB base colour of the SOURCE surface nearest each TARGET vertex."""
    pixels = _base_colour_pixels(source)
    height, width = pixels.shape[:2]
    data = source.data
    data.calc_loop_triangles()
    uv_layer = data.uv_layers.active.data
    tris = list(data.loop_triangles)
    bvh = BVHTree.FromPolygons([v.co for v in data.vertices], [t.vertices for t in tris])
    rgb = np.zeros((len(target.data.vertices), 3), np.float32)
    for index, vertex in enumerate(target.data.vertices):
        hit, _normal, tri_index, _dist = bvh.find_nearest(vertex.co)
        if hit is None:
            continue
        tri = tris[tri_index]
        corners = [data.vertices[v].co for v in tri.vertices]
        uvs = [Vector((*uv_layer[li].uv, 0.0)) for li in tri.loops]
        uv = barycentric_transform(hit, *corners, *uvs)
        px = int(uv.x % 1.0 * width)
        py = int(uv.y % 1.0 * height)
        patch = pixels[max(0, py - TEXEL_FILTER):py + TEXEL_FILTER + 1, max(0, px - TEXEL_FILTER):px + TEXEL_FILTER + 1]
        rgb[index] = patch.reshape(-1, 3).mean(axis=0)
    return rgb


def write_surface_data(mesh, rgb, classes, metal_gain=1.0, glow_gain=1.0):
    """COLOR_0 + _MASK from per-vertex classes (see the module header).
    `metal_gain`/`glow_gain` brighten the sampled metal/glow colours, which
    Meshy's textures store darker than they should read under the game's
    lighting."""
    share = np.bincount(classes, minlength=4) / max(1, len(classes))
    print("surface classes: " + " ".join(f"{CLASS_NAMES[c]} {share[c]:.2f}" for c in range(4)))
    colours = []
    for colour, cls in zip(rgb, classes):
        if cls == PANEL:
            colours.append((PANEL_TINT,) * 3)
        elif cls == GRAPHITE:
            colours.append((GRAPHITE_TINT,) * 3)
        else:
            gain = metal_gain if cls == METAL else glow_gain
            colours.append(tuple(min(1.0, float(c) * gain) for c in colour))
    for layer in list(mesh.data.color_attributes):
        mesh.data.color_attributes.remove(layer)
    vcol = mesh.data.vertex_colors.new(name="Col")
    for poly in mesh.data.polygons:
        for li in poly.loop_indices:
            vcol.data[li].color = (*colours[mesh.data.loops[li].vertex_index], 1.0)
    mask = mesh.data.attributes.new(name="_MASK", type="FLOAT_VECTOR", domain="POINT")
    for index, cls in enumerate(classes):
        mask.data[index].vector = (1.0 if cls == METAL else 0.0, 1.0 if cls == GLOW else 0.0, 0.0)
