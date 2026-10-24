# Re-targets the standard marine's clips (popup-marine-titan-24bone.glb) onto the
# heavy armour's rig (popup-marine-heavy-24bone.glb) by editing the heavy .glb's
# animation data in place. Needs only numpy -- no Blender and no Meshy source.
#
# Why: bake-popup-marine-heavy-model.py copied each bone's WORLD rotation from
# the standard marine onto the heavy rig. A bone's skinning effect is its
# rotation RELATIVE TO ITS OWN REST POSE, and the two sculpts' rest poses (and
# bone frames) differ, so copying absolute orientations crumpled the armour in
# every clip -- fine in the rest pose, hunched and collapsed once a clip played.
#
# What this does instead, per frame of each Pistol* clip:
#   delta[b]      = std_world_pose[b] * inverse(std_world_rest[b])
#   heavy_world[b] = delta[b] * heavy_world_rest[b]
#   heavy_local[b] = inverse(heavy_world[parent]) * heavy_world[b]
# i.e. every bone makes the same world-space move away from its rest pose that
# the standard marine's bone makes. The Hips translation (the only bone the
# clips move) is the standard marine's move away from its rest height, scaled
# by the ratio of the two rigs' world-space hip heights.
#
# Arm bones get one extra step: the heavy sculpt holds its arms differently at
# rest than the standard marine (wider A-pose), so before applying the delta
# each arm bone is first swung to point where the standard marine's rest bone
# points. Otherwise the same delta lifts the heavy arms overhead.
#
# Only rotation tracks and the Hips translation track are replaced; the mesh and
# the scale tracks are kept. The new tracks are APPENDED as fresh accessors, all
# on the clip's full-length frame times, because the old bake stored bones it
# saw as unmoving as 2-key tracks that cannot hold a per-frame result.
#
# Run: python3 -I retarget-popup-marine-heavy-clips.py \
#        <popup-marine-titan-24bone.glb> <heavy-in.glb> <heavy-out.glb>
import json
import struct
import sys

import numpy as np


def load_glb(path):
    data = bytearray(open(path, "rb").read())
    json_len = struct.unpack("<I", data[12:16])[0]
    doc = json.loads(bytes(data[20:20 + json_len]))
    bin_off = 20 + json_len + 8
    return data, doc, bin_off


def read_accessor(data, doc, bin_off, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    assert acc["componentType"] == 5126 and "byteStride" not in view
    width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[acc["type"]]
    start = bin_off + view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return np.frombuffer(bytes(data[start:start + acc["count"] * width * 4]), dtype="<f4").reshape(acc["count"], width).astype(np.float64)


def append_accessor(rig, values):
    """Adds `values` (N x 3 or N x 4 floats) to the end of the binary chunk as
    a new bufferView + accessor and returns the accessor's index."""
    raw = values.astype("<f4").tobytes()
    rig.extra += b"\0" * (-len(rig.extra) % 4)
    view = {"buffer": 0, "byteOffset": rig.bin_len + len(rig.extra), "byteLength": len(raw)}
    rig.extra += raw
    rig.doc["bufferViews"].append(view)
    rig.doc["accessors"].append({
        "bufferView": len(rig.doc["bufferViews"]) - 1,
        "componentType": 5126,
        "count": len(values),
        "type": "VEC4" if values.shape[1] == 4 else "VEC3",
    })
    return len(rig.doc["accessors"]) - 1


# Quaternions are xyzw, like glTF.
def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ])


def qinv(q):
    return np.array([-q[0], -q[1], -q[2], q[3]]) / np.dot(q, q)


def slerp(a, b, t):
    dot = np.dot(a, b)
    if dot < 0:
        b, dot = -b, -dot
    if dot > 0.9995:
        out = a + t * (b - a)
    else:
        theta = np.arccos(dot)
        out = (np.sin((1 - t) * theta) * a + np.sin(t * theta) * b) / np.sin(theta)
    return out / np.linalg.norm(out)


ARM_BONES = {"LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand"}


def rotate(q, v):
    return qmul(qmul(q, np.array([v[0], v[1], v[2], 0.0])), qinv(q))[:3]


def swing(frm, to):
    """Smallest rotation taking unit vector `frm` onto unit vector `to`."""
    w = 1.0 + float(np.dot(frm, to))
    if w < 1e-6:  # opposite: any perpendicular axis
        axis = np.cross(frm, [1.0, 0.0, 0.0])
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(frm, [0.0, 1.0, 0.0])
        axis /= np.linalg.norm(axis)
        return np.array([axis[0], axis[1], axis[2], 0.0])
    q = np.array([*np.cross(frm, to), w])
    return q / np.linalg.norm(q)


class Rig:
    def __init__(self, path):
        self.data, self.doc, self.bin_off = load_glb(path)
        self.bin_len = struct.unpack("<I", self.data[self.bin_off - 8:self.bin_off - 4])[0]
        self.extra = b""
        nodes = self.doc["nodes"]
        self.by_name = {n.get("name"): i for i, n in enumerate(nodes)}
        self.parent = {}
        for i, n in enumerate(nodes):
            for c in n.get("children", []):
                self.parent[c] = i
        self.joints = self.doc["skins"][0]["joints"]
        self.rest_rot = {i: np.array(nodes[i].get("rotation", [0, 0, 0, 1]), dtype=float) for i in range(len(nodes))}
        self.rest_pos = {i: np.array(nodes[i].get("translation", [0, 0, 0]), dtype=float) for i in range(len(nodes))}
        armature = self.by_name["Armature"]
        self.armature_scale = nodes[armature].get("scale", [1, 1, 1])[0]
        self.hips = self.by_name["Hips"]
        # Bones in parent-first order: Hips and everything below it.
        order = []
        stack = [self.hips]
        while stack:
            n = stack.pop(0)
            order.append(n)
            stack.extend(nodes[n].get("children", []))
        self.order = [n for n in order if n in set(self.joints)]
        self.world_rest = {}
        for n in self.order:
            self.world_rest[n] = self._world(n, self.rest_rot)

    def _world(self, n, local, cache=None):
        chain = []
        while n in self.parent:
            chain.append(n)
            n = self.parent[n]
        q = local[n] if n in local else self.rest_rot[n]
        for c in reversed(chain):
            q = qmul(q, local[c])
        return q

    def clip(self, name):
        return next(a for a in self.doc["animations"] if a["name"] == name)

    def tracks(self, clip, path):
        out = {}
        for ch in clip["channels"]:
            if ch["target"]["path"] != path:
                continue
            sampler = clip["samplers"][ch["sampler"]]
            out[ch["target"]["node"]] = (sampler["input"], sampler["output"])
        return out


def sample_rot(rig, tracks, node, t):
    if node not in tracks:
        return rig.rest_rot[node]
    times = read_accessor(rig.data, rig.doc, rig.bin_off, tracks[node][0])[:, 0]
    vals = read_accessor(rig.data, rig.doc, rig.bin_off, tracks[node][1])
    t = min(max(t, times[0]), times[-1])
    i = int(np.searchsorted(times, t, side="right") - 1)
    i = min(i, len(times) - 2)
    span = times[i + 1] - times[i]
    return slerp(vals[i], vals[i + 1], 0.0 if span <= 0 else (t - times[i]) / span)


def sample_vec(rig, track, t):
    times = read_accessor(rig.data, rig.doc, rig.bin_off, track[0])[:, 0]
    vals = read_accessor(rig.data, rig.doc, rig.bin_off, track[1])
    t = min(max(t, times[0]), times[-1])
    i = min(int(np.searchsorted(times, t, side="right") - 1), len(times) - 2)
    span = times[i + 1] - times[i]
    f = 0.0 if span <= 0 else (t - times[i]) / span
    return vals[i] * (1 - f) + vals[i + 1] * f


def main(std_path, heavy_in, heavy_out):
    std, hv = Rig(std_path), Rig(heavy_in)
    # World-space hip height ratio (rig scales differ too).
    std_h = std.rest_pos[std.hips][1] * std.armature_scale
    hv_h = hv.rest_pos[hv.hips][1] * hv.armature_scale
    height_ratio = hv_h / std_h
    # Standard hips delta (armature-local units) -> heavy armature-local units.
    trans_scale = std.armature_scale * height_ratio / hv.armature_scale
    print(f"hip height ratio {height_ratio:.3f}, translation scale {trans_scale:.3f}")

    name_to_std = {n.get("name"): i for i, n in enumerate(std.doc["nodes"])}
    hv_to_std = {i: name_to_std[hv.doc["nodes"][i]["name"]] for i in hv.order}
    # Per arm bone: swing from the heavy's rest bone direction (local +Y, in
    # world space) to the standard marine's.
    align = {}
    for n in hv.order:
        if hv.doc["nodes"][n]["name"] in ARM_BONES:
            to = rotate(std.world_rest[hv_to_std[n]], [0, 1, 0])
            align[n] = swing(rotate(hv.world_rest[n], [0, 1, 0]), to)

    for hv_clip in hv.doc["animations"]:
        name = hv_clip["name"]
        std_clip = std.clip(name)
        s_rot, s_pos = std.tracks(std_clip, "rotation"), std.tracks(std_clip, "translation")
        h_rot, h_pos = hv.tracks(hv_clip, "rotation"), hv.tracks(hv_clip, "translation")
        times = read_accessor(hv.data, hv.doc, hv.bin_off, h_rot[hv.hips][0])[:, 0]
        frames = {n: np.zeros((len(times), 4)) for n in hv.order}
        hips_t = np.zeros((len(times), 3))
        std_hips_rest_t = std.rest_pos[std.hips]
        for f, t in enumerate(times):
            local_std = {n: sample_rot(std, s_rot, n, t) for n in std.joints}
            local_std[std.by_name["Armature"]] = std.rest_rot[std.by_name["Armature"]]
            heavy_world = {}
            for n in hv.order:
                sn = hv_to_std[n]
                world_pose = std._world(sn, {**std.rest_rot, **local_std})
                delta = qmul(world_pose, qinv(std.world_rest[sn]))
                rest = qmul(align[n], hv.world_rest[n]) if n in align else hv.world_rest[n]
                heavy_world[n] = qmul(delta, rest)
            for n in hv.order:
                parent = hv.parent[n]
                parent_world = heavy_world[parent] if parent in heavy_world else hv.world_rest.get(parent, hv._world(parent, hv.rest_rot))
                local = qmul(qinv(parent_world), heavy_world[n])
                if f > 0 and np.dot(local, frames[n][f - 1]) < 0:
                    local = -local
                frames[n][f] = local / np.linalg.norm(local)
            std_t = sample_vec(std, s_pos[std.hips], t) if std.hips in s_pos else std_hips_rest_t
            hips_t[f] = hv.rest_pos[hv.hips] + (std_t - std_hips_rest_t) * trans_scale
        frame_times = h_rot[hv.hips][0]
        sampler_of = {ch["target"]["node"]: hv_clip["samplers"][ch["sampler"]] for ch in hv_clip["channels"] if ch["target"]["path"] == "rotation"}
        for n in hv.order:
            sampler_of[n]["input"] = frame_times
            sampler_of[n]["output"] = append_accessor(hv, frames[n])
        pos_sampler = next(hv_clip["samplers"][ch["sampler"]] for ch in hv_clip["channels"] if ch["target"]["path"] == "translation" and ch["target"]["node"] == hv.hips)
        pos_sampler["input"] = frame_times
        pos_sampler["output"] = append_accessor(hv, hips_t)
        print(f"{name}: {len(times)} frames, hips y {hips_t[:, 1].min():.1f}..{hips_t[:, 1].max():.1f}")

    hv.doc["buffers"][0]["byteLength"] = hv.bin_len + len(hv.extra)
    json_bytes = json.dumps(hv.doc, separators=(",", ":")).encode()
    json_bytes += b" " * (-len(json_bytes) % 4)
    bin_body = bytes(hv.data[hv.bin_off:hv.bin_off + hv.bin_len]) + hv.extra
    bin_body += b"\0" * (-len(bin_body) % 4)
    bin_chunk = struct.pack("<I", len(bin_body)) + b"BIN\0" + bin_body
    out = b"glTF" + struct.pack("<II", 2, 12 + 8 + len(json_bytes) + len(bin_chunk))
    out += struct.pack("<I", len(json_bytes)) + b"JSON" + json_bytes + bin_chunk
    open(heavy_out, "wb").write(out)


if __name__ == "__main__":
    main(*sys.argv[1:4])
