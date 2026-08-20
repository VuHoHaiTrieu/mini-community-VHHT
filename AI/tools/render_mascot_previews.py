"""Render transparent preview PNGs from the generated GLB files."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
MODELS=ROOT/'AI'/'assets'/'models'
ASSETS=ROOT/'AI'/'assets'

def look_at(camera,target):
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()

for name in ('nova','luna'):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(MODELS/f'{name}.glb'))
    bpy.ops.object.camera_add(location=(0,-8.4,2.05));camera=bpy.context.object;look_at(camera,(0,0,1.55));bpy.context.scene.camera=camera
    bpy.ops.object.light_add(type='AREA',location=(-3,-4,6));bpy.context.object.data.energy=850;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=5
    bpy.ops.object.light_add(type='AREA',location=(4,-2,3));bpy.context.object.data.energy=650;bpy.context.object.data.color=(.25,.75,1) if name=='nova' else (1,.25,.65);bpy.context.object.data.size=4
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True;scene.render.filepath=str(ASSETS/f'{name}-character-preview.png')
    scene.view_settings.look='AgX - Medium High Contrast';bpy.ops.render.render(write_still=True)
    print(f'VHHT_PREVIEW={scene.render.filepath}')
