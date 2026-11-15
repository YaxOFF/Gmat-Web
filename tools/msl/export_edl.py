"""Export the SkyCrane and Aeroshell hierarchies of curiosity_rover.blend as two GLB files.

Run with Blender in console mode (the .blend is never saved):

    blender --background curiosity_rover.blend --python tools/msl/export_edl.py -- <out dir>

Each root is moved to the origin only for its export, so each GLB has its root at (0, 0, 0).
The docked offsets (SkyCrane 2.17 m, Aeroshell 0.77 m above the rover) live in the game code.
"""
import sys
from pathlib import Path

import bpy

ROOTS = {"SkyCrane": "skycrane.glb", "Aeroshell": "aeroshell.glb"}

out = Path(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else ".").resolve()
out.mkdir(parents=True, exist_ok=True)

for name, file in ROOTS.items():
    root = bpy.data.objects.get(name)
    if root is None:
        raise SystemExit(f"export_edl: missing object {name}")
    saved = root.location.copy()
    root.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    for o in [root, *root.children_recursive]:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(
        filepath=str(out / file),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_draco_mesh_compression_enable=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_vertex_color="ACTIVE",  # SkyCrane AO lives in the "AO" color attribute
    )
    root.location = saved
    print(f"export_edl: {out / file}")
