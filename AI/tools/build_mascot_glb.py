"""Generate lightweight rigged NOVA/LUNA GLB mascots for the VHHT web UI.

Run with Blender:
  blender --background --python AI/tools/build_mascot_glb.py

This is a reproducible web mascot derived from the supplied NOVA/LUNA concept
sheet. It uses layered geometry, emissive details and rigid bone weights so the
silhouette stays recognisable while remaining practical on mobile.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "AI" / "assets" / "models"
OUT.mkdir(parents=True, exist_ok=True)

CLIPS = (
    "idle", "hello", "thinking", "searching", "talking", "happy",
    "confused", "sleeping", "wave", "reading", "typing", "celebrate",
    "dance", "create",
)


def reset_scene():
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.armatures, bpy.data.materials):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)
    # Actions use fake users so Blender keeps them between exports unless they
    # are removed explicitly. Keeping them caused LUNA clips such as idle.001.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def material(name, color, metallic=0.0, roughness=0.42, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission:
        principled.inputs["Emission Color"].default_value = (*emission, 1)
        principled.inputs["Emission Strength"].default_value = strength
    return mat


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def uv_sphere(name, location, scale, mat, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return smooth(obj)


def cone(name, location, scale, mat, rotation=(0, 0, 0), vertices=20):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=1, radius2=0, depth=2, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return smooth(obj)


def cube(name, location, scale, mat, bevel=0.12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Soft edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    return smooth(obj)


def torus(name, location, major, minor, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=8, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return smooth(obj)


def shape_prism(name, location, points, depth, mat, scale=(1, 1, 1), rotation=(0, 0, 0)):
    """Create a tiny extruded front-facing emblem (star, heart, sparkle)."""
    count = len(points)
    verts = [(x, -depth / 2, z) for x, z in points] + [(x, depth / 2, z) for x, z in points]
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    obj.location, obj.rotation_euler, obj.scale = location, rotation, scale
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("Gem bevel", "BEVEL"); bevel.width = .035; bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.data.materials.append(mat)
    return smooth(obj)


def star_points(outer=1.0, inner=.42, rays=4):
    points = []
    for index in range(rays * 2):
        angle = math.pi / 2 + index * math.pi / rays
        radius = outer if index % 2 == 0 else inner
        points.append((math.cos(angle) * radius, math.sin(angle) * radius))
    return points


def heart_points(steps=24):
    points = []
    for index in range(steps):
        t = 2 * math.pi * index / steps
        points.append((math.sin(t) ** 3, (13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))/16))
    return points


def create_rig(character):
    armature = bpy.data.armatures.new(f"{character}_Rig")
    rig = bpy.data.objects.new(f"{character}_Rig", armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bones = {
        "Root": ((0, 0, 0), (0, 0, .6), None),
        "Body": ((0, 0, .6), (0, 0, 1.65), "Root"),
        "Head": ((0, 0, 1.65), (0, 0, 2.7), "Body"),
        "Arm.L": ((-.48, 0, 1.55), (-1.25, 0, 1.35), "Body"),
        "Arm.R": ((.48, 0, 1.55), (1.25, 0, 1.35), "Body"),
        "Leg.L": ((-.25, 0, .72), (-.4, 0, .12), "Root"),
        "Leg.R": ((.25, 0, .72), (.4, 0, .12), "Root"),
        "Tail": ((0, .25, 1.0), (0, .72, .6), "Body"),
        "Eye.L": ((-.31, -.55, 2.22), (-.31, -.75, 2.22), "Head"),
        "Eye.R": ((.31, -.55, 2.22), (.31, -.75, 2.22), "Head"),
        "Mouth": ((0, -.56, 1.96), (0, -.75, 1.96), "Head"),
        "FX": ((0, .2, .75), (0, .2, 1.35), "Root"),
    }
    made = {}
    for name, (head, tail, parent) in bones.items():
        bone = armature.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = made[parent]
        made[name] = bone
    bpy.ops.object.mode_set(mode="POSE")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    rig["vhht_character"] = character
    rig["vhht_animation_clips"] = ",".join(CLIPS)
    return rig


def bind_rigid(obj, rig, bone_name):
    modifier = obj.modifiers.new("NOVA Armature", "ARMATURE")
    modifier.object = rig
    group = obj.vertex_groups.new(name=bone_name)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    obj.parent = rig


def build_character(kind):
    is_luna = kind == "luna"
    primary = material(f"{kind}_primary", (1.0, .36, .66) if is_luna else (.02, .43, 1.0), metallic=.18, roughness=.28)
    accent = material(f"{kind}_accent", (1.0, .62, .79) if is_luna else (.0, .82, 1.0), metallic=.05, roughness=.3, emission=(1.0, .18, .58) if is_luna else (0, .55, 1), strength=1.8)
    white = material(f"{kind}_shell", (1, .93, .97) if is_luna else (.92, .97, 1), metallic=.12, roughness=.24)
    dark = material(f"{kind}_face", (.055, .015, .09) if is_luna else (.01, .025, .12), metallic=.28, roughness=.16)
    eye = material(f"{kind}_eyes", (1.0, .36, .72) if is_luna else (.1, .85, 1.0), roughness=.18, emission=(1.0, .08, .55) if is_luna else (.05, .6, 1), strength=4)
    glow = material(f"{kind}_soft_glow", (1.0, .66, .86) if is_luna else (.25, .92, 1.0), roughness=.1, emission=(1.0, .22, .65) if is_luna else (.0, .7, 1.0), strength=6)
    blush = material(f"{kind}_blush", (1.0, .25, .55), roughness=.3, emission=(1.0, .08, .25), strength=1.6)
    rig = create_rig(kind)
    pieces = []

    def add(obj, bone):
        bind_rigid(obj, rig, bone); pieces.append(obj); return obj

    # Body, neck jewel and head shell.
    add(uv_sphere("Body", (0, 0, 1.15), (.58, .42, .72), white), "Body")
    add(uv_sphere("Collar", (0, -.02, 1.57), (.48, .4, .16), primary), "Body")
    add(shape_prism("ChestCore", (0, -.47, 1.22), heart_points() if is_luna else star_points(), .09, glow, scale=(.20, 1, .23)), "Body")
    add(uv_sphere("HeadShell", (0, 0, 2.18), (1.0, .64, .78), white), "Head")
    add(uv_sphere("FaceScreen", (0, -.57, 2.13), (.76, .12, .5), dark), "Head")
    # Layered emissive face: star/diamond pupils, highlights, cheeks and mouth.
    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        add(shape_prism(f"Eye.{label}", (side*.31, -.705, 2.23), star_points(1, .5, 4), .035, eye, scale=(.15, 1, .19)), f"Eye.{label}")
        add(uv_sphere(f"EyeShine.{label}", (side*.265, -.735, 2.31), (.038, .018, .05), white, 10, 6), f"Eye.{label}")
        add(uv_sphere(f"Cheek.{label}", (side*.49, -.696, 2.02), (.09, .018, .035), blush, 12, 6), "Head")
    add(uv_sphere("Mouth", (0, -.72, 1.96), (.12, .025, .075), blush, 14, 8), "Mouth")
    add(shape_prism("ForeheadGem", (0, -.655, 2.68), star_points(), .055, glow, scale=(.13, 1, .18)), "Head")
    # Cat ears with glowing inner ears.
    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        add(cone(f"Ear.{label}", (side*.58, -.02, 2.88), (.34, .24, .56), white, rotation=(0, side*.12, side*.08)), "Head")
        add(cone(f"EarGlow.{label}", (side*.58, -.18, 2.9), (.19, .08, .36), accent, rotation=(0, side*.12, side*.08)), "Head")
        add(uv_sphere(f"Headphone.{label}", (side*.91, -.02, 2.18), (.2, .18, .3), primary), "Head")
        add(torus(f"HeadphoneRing.{label}", (side*.94, -.11, 2.18), .19, .035, glow, rotation=(math.pi/2, 0, 0)), "Head")
    # Limbs.
    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        add(uv_sphere(f"Arm.{label}", (side*.72, -.02, 1.45), (.23, .22, .55), white), f"Arm.{label}")
        add(uv_sphere(f"Hand.{label}", (side*1.0, -.06, 1.25), (.28, .25, .28), primary), f"Arm.{label}")
        for finger in (-1, 0, 1):
            add(uv_sphere(f"PawGlow.{label}.{finger}", (side*(1.0 + .055*finger), -.29, 1.27 + .07*abs(finger)), (.045, .025, .055), glow, 10, 6), f"Arm.{label}")
        add(uv_sphere(f"Leg.{label}", (side*.3, 0, .55), (.25, .28, .48), white), f"Leg.{label}")
        add(uv_sphere(f"Boot.{label}", (side*.38, -.15, .2), (.33, .4, .22), primary), f"Leg.{label}")
    if is_luna:
        add(cone("Skirt", (0, 0, .98), (.8, .64, .48), primary, rotation=(math.pi, 0, 0), vertices=32), "Body")
        add(cone("SkirtLayer", (0, -.02, .85), (.69, .58, .35), white, rotation=(math.pi, 0, 0), vertices=32), "Body")
        add(torus("SkirtTrim", (0, 0, .58), .68, .06, glow), "Body")
        # Ponytail and bow, clearly distinguishing LUNA's silhouette.
        add(uv_sphere("HairTop", (.52, .25, 2.62), (.4, .35, .42), primary), "Head")
        add(uv_sphere("Ponytail", (.92, .43, 1.92), (.35, .31, .92), primary), "Head")
        add(uv_sphere("PonytailTip", (1.02, .43, 1.24), (.28, .25, .5), accent), "Tail")
        add(uv_sphere("BowCenter", (.48, -.45, 2.78), (.14, .1, .14), accent), "Head")
        add(uv_sphere("Bow.L", (.31, -.43, 2.82), (.22, .08, .16), primary), "Head")
        add(uv_sphere("Bow.R", (.65, -.43, 2.82), (.22, .08, .16), primary), "Head")
        add(shape_prism("HeartHalo", (-.9, -.05, 2.48), heart_points(), .055, glow, scale=(.19, 1, .19)), "FX")
    else:
        # NOVA's cape and energy tail.
        add(cone("Cape", (0, .35, 1.2), (.82, .28, .82), primary, rotation=(math.pi, 0, 0), vertices=32), "Body")
        add(cone("CapeInner", (0, .3, 1.14), (.66, .22, .7), accent, rotation=(math.pi, 0, 0), vertices=32), "Body")
        add(torus("EnergyTail", (0, .52, .72), .58, .09, glow, rotation=(math.pi/2, 0, 0)), "Tail")
        add(shape_prism("OrbitStar", (-.82, -.05, 2.55), star_points(), .055, glow, scale=(.18, 1, .22)), "FX")
    # Two small orbiting motes reinforce the magical-tech look in both variants.
    add(uv_sphere("FXMote.L", (-1.0, .0, 1.65), (.055, .055, .055), glow, 10, 6), "FX")
    add(uv_sphere("FXMote.R", (1.0, .0, 2.25), (.045, .045, .045), glow, 10, 6), "FX")
    create_actions(rig)
    return rig, pieces


def key(pose_bone, frame, rotation=None, location=None, scale=None):
    if rotation is not None:
        pose_bone.rotation_euler = rotation
        pose_bone.keyframe_insert("rotation_euler", frame=frame)
    if location is not None:
        pose_bone.location = location
        pose_bone.keyframe_insert("location", frame=frame)
    if scale is not None:
        pose_bone.scale = scale
        pose_bone.keyframe_insert("scale", frame=frame)


def create_actions(rig):
    p = rig.pose.bones
    specs = {
        "idle": [(1, 0, 0), (30, .09, .03), (60, 0, 0)],
        "hello": [(1, 0, 0), (12, .14, -.12), (24, 0, .12), (36, .1, -.08), (48, 0, 0)],
        "thinking": [(1, 0, -.08), (30, .08, .12), (60, 0, -.08)],
        "searching": [(1, -.08, -.14), (20, .1, .14), (40, -.08, -.14)],
        "talking": [(1, 0, -.035), (10, .04, .035), (20, 0, -.035)],
        "happy": [(1, 0, -.08), (15, .22, .1), (30, 0, -.08)],
        "confused": [(1, 0, -.15), (18, 0, .18), (36, 0, -.15)],
        "sleeping": [(1, -.12, -.08), (45, -.18, -.08), (90, -.12, -.08)],
        "wave": [(1, 0, -.08), (14, .08, .06), (28, 0, -.06), (42, .08, .06), (56, 0, 0)],
        "reading": [(1, -.04, -.08), (40, .02, .06), (80, -.04, -.08)],
        "typing": [(1, 0, -.03), (10, .025, .03), (20, 0, -.03)],
        "celebrate": [(1, 0, -.1), (12, .32, .08), (24, 0, -.08), (36, .24, .06), (48, 0, 0)],
        "dance": [(1, 0, -.22), (15, .12, .22), (30, 0, -.22), (45, .12, .22), (60, 0, -.22)],
        "create": [(1, 0, -.1), (25, .08, .1), (50, 0, -.1)],
    }
    for name, frames in specs.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data_create()
        rig.animation_data.action = action
        for bone in p:
            bone.rotation_euler = (0, 0, 0); bone.location = (0, 0, 0); bone.scale = (1, 1, 1)
        for frame, bob, turn in frames:
            key(p["Root"], frame, location=(0, 0, bob))
            key(p["Head"], frame, rotation=(0, turn, turn*.35))
            key(p["Tail"], frame, rotation=(0, math.sin(frame*.12)*.16, math.sin(frame*.1)*.2))
            key(p["FX"], frame, rotation=(0, 0, frame*.018), scale=(1 + abs(bob)*.6,)*3)
            eye_scale = (1, 1, .08) if name == "sleeping" else ((1.08, 1.08, 1.08) if name in ("happy", "celebrate") else (1, 1, 1))
            key(p["Eye.L"], frame, scale=eye_scale); key(p["Eye.R"], frame, scale=eye_scale)
            mouth_scale = (1, 1, 1.65 if frame % 20 < 10 else .65) if name == "talking" else (1, 1, 1)
            key(p["Mouth"], frame, scale=mouth_scale)
            if name == "hello":
                key(p["Arm.R"], frame, rotation=(0, -turn*.6, -.8 + math.sin(frame*.35)*.35))
            elif name == "thinking":
                key(p["Arm.R"], frame, rotation=(-.15, 0, -.72))
            elif name == "searching":
                key(p["Head"], frame, rotation=(0, turn*1.7, 0))
            elif name == "happy":
                key(p["Arm.L"], frame, rotation=(0, 0, .75)); key(p["Arm.R"], frame, rotation=(0, 0, -.75))
            elif name == "confused":
                key(p["Arm.L"], frame, rotation=(0, 0, .35)); key(p["Arm.R"], frame, rotation=(0, 0, -.35))
            elif name == "sleeping":
                key(p["Body"], frame, rotation=(.18, 0, -.12)); key(p["Arm.L"], frame, rotation=(0, 0, -.2)); key(p["Arm.R"], frame, rotation=(0, 0, .2))
            elif name == "wave":
                key(p["Arm.R"], frame, rotation=(-.1, -.1, -.9 + math.sin(frame*.3)*.4)); key(p["Arm.L"], frame, rotation=(0, 0, .08))
            elif name == "reading":
                key(p["Head"], frame, rotation=(.22, turn*.25, 0)); key(p["Arm.L"], frame, rotation=(-.42, 0, .38)); key(p["Arm.R"], frame, rotation=(-.42, 0, -.38))
            elif name == "typing":
                tap = math.sin(frame*.65)*.18
                key(p["Arm.L"], frame, rotation=(-.5+tap, 0, .28)); key(p["Arm.R"], frame, rotation=(-.5-tap, 0, -.28))
            elif name == "celebrate":
                key(p["Arm.L"], frame, rotation=(0, 0, 1.15)); key(p["Arm.R"], frame, rotation=(0, 0, -1.15))
                key(p["Leg.L"], frame, rotation=(0, .15, -.16)); key(p["Leg.R"], frame, rotation=(0, -.15, .16))
            elif name == "dance":
                key(p["Body"], frame, rotation=(0, turn*.8, -turn)); key(p["Arm.L"], frame, rotation=(0, 0, .65-turn)); key(p["Arm.R"], frame, rotation=(0, 0, -.65-turn))
            elif name == "create":
                key(p["Arm.R"], frame, rotation=(-.2, -.35, -.75)); key(p["Arm.L"], frame, rotation=(0, 0, .18))
            else:
                key(p["Arm.L"], frame, rotation=(0, 0, .04)); key(p["Arm.R"], frame, rotation=(0, 0, -.04))
        for curve in action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = "BEZIER"
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(action.frame_range[0]), action)
        strip.action_frame_start, strip.action_frame_end = action.frame_range
        track.mute = True
    rig.animation_data.action = None


def export_character(kind):
    reset_scene()
    rig, pieces = build_character(kind)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in pieces:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    output = OUT / f"{kind}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="ACTIONS",
        export_materials="EXPORT", export_apply=False,
        export_yup=True, export_cameras=False, export_lights=False,
    )
    print(f"VHHT_EXPORT={output}")


if __name__ == "__main__":
    for character in ("nova", "luna"):
        export_character(character)
