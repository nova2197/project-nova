# Chapter 6 — Image Assets

Drop your AI-generated PNGs in this folder (`frontend/public/assets/ch6/`)
using **exactly these filenames**. The game loads them automatically on the
next browser refresh. Until a file exists, the game draws a styled
code placeholder in its place — so nothing breaks if a file is missing.

Setting reference: **Year 2197. Earth is barely livable — toxic/dead
landscape, but the surviving tech is sleek and high-tech.** Think the
attached monolithic tower: brutalist sci-fi, weathered white/grey panels,
cyan + amber accent lights.

| Filename          | What it shows                                                        | Suggested size      |
|-------------------|----------------------------------------------------------------------|---------------------|
| `scene_bg.png`    | The signal tower exterior on a dead-earth horizon (the main backdrop)| 1200 × 1600 (portrait) |
| `character.png`   | The lone survivor figure (climbing pose), transparent background     | 200 × 400 (PNG, alpha) |
| `doc_blueprint.png`| Tower construction blueprint — must clearly show the BEAM ALTITUDE   | 900 × 1200 |
| `doc_map.png`     | A worn, partly-burnt map showing Sector 7 + a printed SCALE BAR      | 900 × 1200 |
| `doc_manual.png`  | The beam emitter manual page — shows BEAM SPEED + FREQUENCY (Hz)      | 900 × 1200 |

## Important — the documents must contain readable numbers

The puzzle depends on the player reading values off the three documents.
The game overlays the key numbers in code on top of your images (so it works
even with placeholder art), but for the real images please make sure these are
legible if you bake them into the art:

- **Blueprint** → "BEAM REFLECTION ALTITUDE: H km"
- **Map** → a scale like "1 cm : 50 km" and the Sector 7 marker distance
- **Manual** → "BEAM SPEED: 3 × 10⁸ m/s" and "FREQUENCY: f MHz"

(The actual numbers are randomised each playthrough, so keep the art generic —
the live values are drawn by the game.)

## Example generation prompt (scene_bg.png)

> A colossal weathered sci-fi signal tower of stacked white concrete and metal
> panels with cyan and amber lights, standing alone on a barren toxic wasteland
> under a pale hazy sky, year 2197, post-collapse Earth, cinematic, highly
> detailed, vertical composition, concept art.
