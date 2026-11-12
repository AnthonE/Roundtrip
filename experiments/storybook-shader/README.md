# Storybook shader

A look test for a different game from ROUNDTRIP: a shader that paints a 3D scene like a
pastel storybook illustration. It lives here only because there is no repo for that game
yet. Nothing in `public/` or `server/` uses it, and it is not deployed.

Open `index.html` in a browser. It has no dependencies and no build step (WebGL 2).

## What makes the look

1. **Mosaic fills.** Every surface is broken into small cells (3D Voronoi), each with a
   slightly different tint and a thin line between them. Cell size is chosen in screen
   pixels and snapped to a power of two in world units, so the cells stick to the surface
   but read the same size near and far.
2. **Soft light.** A wide, pale light ramp with no hard shadows, nudged per cell so
   shading looks tiled instead of smoothly 3D.
3. **Ink outlines.** A full-screen pass draws coloured lines where object, surface
   direction or depth changes. The character gets a heavier line than the scenery.
4. **Paper.** Grain, faint fibres, haze toward the paper colour with distance, and a soft
   irregular border.

## Where things are

Everything is in `index.html`. The shader is the first block of the script:

| Piece | What it does |
| --- | --- |
| `VS` | Vertex shader. Passes the rest-pose position, so cells stay glued to a moving body. |
| `FS_SURFACE` | Runs on every mesh: light, cells, cell lines, haze. Also writes normal, object id and ink weight for the outlines. |
| `FS_POST` | One full-screen pass: ink outlines, paper grain, border. |
| `defMat(...)` | Per-material settings: second colour, cell size, stretch, line colour and strength. |
| `buildGirl(...)` | The skater, modelled by hand from her character sheet: hair, face, charms, coat pattern, skates. |

The scenery (trees, arches, city) is a throwaway demo set built from spheres, tubes and boxes.

## The skater

She is built in code, not loaded from a model file. Her hair, coat, sleeves and trouser
legs are surfaces defined by a formula (`grid`), and every detail on them (eyes, lapels,
pockets, the lavender and teal coat pattern, the watch strap) is a small patch laid just
above that surface (`patch` / `decal`). She has seven rigid parts (torso, head, two arms,
two legs) that `pose()` moves for the skating stride. The **Front view** button swings
the camera round to her face.

## Moving it into a real game

The GLSL is plain WebGL 2 / GLSL ES 3.00. A mesh needs a position, a normal, a base
colour, and four numbers per object: material, object id, animated part and ink weight.
The two demo-only bits to replace are the path formula (`pathX`, `pathDist`) and the
blob shadow under the skater.
