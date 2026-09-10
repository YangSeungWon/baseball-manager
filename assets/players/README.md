# DUGOUT athlete

Original stylized athlete made in Blender 4.5.13 for this project.

- `athlete.blend`: editable source, 15-bone armature, weighted body, modular gear.
- `../../web/models/athlete.glb`: runtime model; no external textures or model downloads.
- `../../tools/blender/build-player.py`: reproducible authoring/export script.

Run from the repository root:

```sh
blender -b --python tools/blender/build-player.py
```

The GLB contains AthleteRig plus socket-local Cap, Helmet, Glove and Bat assets.
The runtime attaches gear to Head/HandL/HandR and uses independent cloned skeletons.
Team materials and skin tones are runtime variants; the D mark and 17 are prototype details.
Existing game poses drive the shoulders, elbows, hips and knees. This is a first rigged
model, not a motion-captured animation library or a facial-expression rig.

Runtime geometry/material ownership is per ballpark, with sharing between its players.
The .blend source is outside web/ and is not sent to players.
