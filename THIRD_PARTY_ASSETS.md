# Third-party assets

Everything in this game is still procedurally generated at runtime by
default (`src/game/assets.ts`). A small, deliberately curated subset of real
art and sound has been layered on top — every real sprite falls back to its
procedural equivalent if the PNG fails to load, and every sound is optional
(the game is fully playable muted). This file records, for every third-party
file actually shipped in `public/`, where it came from, its license, and
exactly what was done to it. All sources are CC0 (public domain); crediting
them here is done anyway as good practice, not because CC0 requires it.

## Images — `public/sprites/`

**Source:** [LAB](https://mutantleg.itch.io/lab) by **Mutantleg**, itch.io. The
downloadable texture pack bundled with the game (`lab_texture.zip`) ships a
`readme.txt` stating "all these gfx is hereby public domain (CC0)". Three
files from the pack's `wall/` and `door/` folders were used.

| File used | Source file | Modifications |
|---|---|---|
| `wall-a.png` | `LAB/wall/tile087.png` (a vertical vent/locker panel) | Recolored via 3-band luminance quantization to the game's fixed palette (ink outline, slate-blue mid-tone, ice highlight). No resize — source was already 64×64, matching the wall-texture slot's native size. |
| `wall-b.png` | `LAB/wall/tile065.png` (a brick pattern) | Same pipeline, recolored to ink/slate-blue/lavender so the two wall kinds stay visually distinct at a glance. |
| `door.png` | `LAB/door/door0.png` (a double door) | Same pipeline, recolored to ink/peach/cyan — matching the peach body and cyan "window" the procedural door placeholder already used. |

**Source:** [Front-facing robot and pixel characters](https://opengameart.org/content/front-facing-robot-and-pixel-characters)
by **Bigelowed**, OpenGameArt.org, CC0.
Two files from this submission were used: `pixl-ppl.png` and
`arcade-shootemup-battle-robots.png`.

| File used | Source file / region | Modifications |
|---|---|---|
| `enemy-grunt-idle-0.png`, `enemy-grunt-idle-1.png`, `enemy-grunt-hit.png` | `pixl-ppl.png`, row 0 / column 4 (blue-shirt humanoid), 30×99px cell | Cropped to the character cell, trimmed to its alpha bounding box, recolored via 4-band luminance quantization to the game's fixed palette (cyan mid-tone for idle, lavender for the hit frame, ink outline), downscaled with nearest-neighbor to 17×56. A second idle frame was produced by a vertical shift-and-repad ("bob") of the same crop, matching the existing procedural sprites' own idle-bob convention — the source art has no walk-cycle frames of its own (the author's notes say these characters "waddle" rather than animate). |
| `enemy-scout-idle-0.png`, `enemy-scout-idle-1.png`, `enemy-scout-hit.png` | `pixl-ppl.png`, row 0 / column 6 (grey hooded humanoid), 30×99px cell | Same pipeline as the grunt above, recolored to peach mid-tone (cyan for scout is reserved for the grunt's accent, so scout uses the peach band to keep the three enemy kinds visually distinct at a glance). |
| `enemy-brute-idle-0.png` | `arcade-shootemup-battle-robots.png`, column 1 (intact robot, head+body composited from one column crop) | Cropped, recolored to cream mid-tone, downscaled to ~27×72. |
| `enemy-brute-idle-1.png` | Same sheet, column 2 (robot with a faint damage crack) | Same pipeline; used as the second idle frame instead of a synthetic bob, since the source art already provides a natural subtle-variation frame. |
| `enemy-brute-hit.png` | Same sheet, column 3 (shattered/damaged robot) | Same pipeline, recolored with the mid-band forced to lavender (matching the hit-flash convention the procedural sprites already use). |
| `weapon-hit-splash.png` | Same sheet, a small circular accessory/joint piece | Cropped, recolored to cream, used as a muzzle impact-spark decal layered over the (still procedural) weapon housing on fire. |

**Source:** [Lo Fi First Person Hand](https://opengameart.org/content/lo-fi-first-person-hand)
by **Ragnar Random**, OpenGameArt.org, CC0.

| File used | Source file / region | Modifications |
|---|---|---|
| `weapon-hand-open.png`, `weapon-hand-fist.png` | `lofifirstpersonhand.png`, open-hand and fist poses | Split into the two individual poses, outline recolored to the game's ink color (skin tone left as-is, not palette-quantized, since it's a small accent layered on the weapon rather than a main character). Used as an overlay so the weapon reads as gripped by a hand, without altering the disc-launcher housing itself. |

## Audio — `public/audio/`

**Source:** [Digital Audio](https://kenney.nl/assets/digital-audio) by
**Kenney** (kenney.nl), CC0.

| File used | Source file | Used for |
|---|---|---|
| `fire.ogg` | `zapTwoTone.ogg` | Firing the disc launcher |
| `enemy-death.ogg` | `lowDown.ogg` | An enemy's health reaching zero |
| `pickup-ammo.ogg` | `highUp.ogg` | Collecting an ammo pickup |
| `pickup-health.ogg` | `powerUp8.ogg` | Collecting a health pickup |
| `door-open.ogg` | `phaseJump1.ogg` | A door opening |

**Source:** [Impact Sounds](https://kenney.nl/assets/impact-sounds) by
**Kenney** (kenney.nl), CC0.

| File used | Source file | Used for |
|---|---|---|
| `enemy-hit.ogg` | `impactSoft_medium_000.ogg` | A hitscan shot landing on an enemy |
| `player-hurt.ogg` | `impactPunch_medium_004.ogg` | The player taking projectile damage |

No modifications were made to any audio file beyond renaming (all are used
as-is, still their original format and encoding).

## Not used

The source folder these were selected from also contained an unrelated
"old-school FPS wall textures" pack whose original author/license could not be
verified (no readme, no traceable listing page), so it was left out entirely —
`LAB`'s explicitly-CC0 pack was used for walls and the door instead. A
splash/slime SFX pack and a procedural music pack from the same source folder
were also evaluated but not included, to keep this integration a small,
targeted subset rather than a bulk asset-pack import: no background music was
added.
