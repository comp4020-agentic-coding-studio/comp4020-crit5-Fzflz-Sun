# Process overview

## What I built

**PIE HALL 98** — a browser-playable, Canvas-2D pseudo-3D shooter in the style
of mid-90s edutainment raycasters (an original game, not a clone of any real
1998 title): one fixed level of four connected school-hall rooms (Entrance
Hall, Locker Corridor, Lab Classroom, Activity Room) built deliberately
oversized against a small player scale, seven enemies across three kinds
(reframed as mascots and cleaning/vending robots), a "cream disc launcher" for
hitscan fire against slow dodgeable enemy projectiles (now actually rendered,
not just simulated), ammo/health pickups, and a win/loss loop with no menu,
tutorial, or on-screen text — the controls are meant to be discoverable in the
first few seconds of play. Pickups, projectiles, the exit marker, and the
weapon housing are still procedurally drawn at runtime from a single sprite
factory (`src/game/assets.ts`); a small, curated set of real CC0 sprites and
sound effects was added on top for the two wall textures, the door, the three
enemy kinds, the weapon's hand grip, and a hit-splash decal, with async
loading and a procedural fallback if a file fails — see
`THIRD_PARTY_ASSETS.md` for exactly what was used, from where, and under what
license.

## The moments that mattered

1. **The level looked winnable by inspection but hadn't actually been proven
   winnable.** Manually playtesting a 3–5 room, 7-enemy level by hand, over
   and over, to check whether the exit is reachable after every enemy is dead
   is slow and easy to get wrong — a human tester tires and stops trusting
   their own runs. Instead of relying on manual playthroughs alone, I wrote a
   throwaway headless simulation script that imported the game's own
   `createInitialState`/`update` functions directly and drove them with exact
   per-frame synthetic input (turn toward a target, fire when aligned, retreat
   when a dangerous enemy closes in) — the same simulation code the browser
   runs, with no browser timing noise in the loop. Running it surfaced a real
   bug: the player's circular collision radius could catch on a decorative
   wall accent placed diagonally next to the B→C corridor doorway, even though
   the doorway itself was clear, permanently blocking that route. I confirmed
   the fix (moving the accent to a corner clear of every doorway) both in the
   headless sim, reaching a real `phase: 'won'`, and in an actual Playwright
   browser run driving real keyboard input against the built site — so the
   fix is verified against real per-frame timing, not just the synthetic
   harness. The throwaway sim and browser scripts were deleted once both
   confirmations landed; the fix itself is
   [`42a3432`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/42a3432).

2. **The required deterministic combat test needed a synthetic map, not the
   real level.** The spec calls for an automated test proving a shot can only
   damage the nearest visible enemy on the ray, and that a wall in front of an
   enemy blocks it. Testing this against the real 23×15 level would couple the
   test to level geometry that has nothing to do with the rule being checked.
   Instead, `spec/combat.test.ts` builds a minimal open corridor map per case
   and calls `resolveHitscan` directly with hand-placed enemies — nearest-hit,
   occluded, out-of-tolerance, dead-enemy, and out-of-range cases each get
   their own case, independent of `level.ts`. This is why I could relocate a
   level wall in moment 1 without touching or re-verifying this test at all —
   it never depended on that geometry.
   [`b98e41c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/b98e41c).

3. **A quantized render angle can make a genuinely aimed shot miss.** The
   spec calls for a coarse ~32-step render angle rather than continuous
   aiming, for the low-fidelity period feel, but the hitscan itself still
   needs to feel fair with no crosshair. Using the raw continuous angle for
   aim tolerance would let a shot that reads as dead-on-screen still fail,
   since the rendered direction and the fired direction could differ by up to
   half a render step. `HITSCAN_AIM_TOLERANCE` (7°) is set to clear that
   worst case (360°/32/2 = 5.625°) with margin, and the hitscan fires along
   the same quantized angle the frame renders — documented at the constant's
   definition in
   [`b98e41c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/b98e41c#diff-src/game/constants.ts)
   so the two numbers can't drift apart independently later.

4. **Manual playtesting found a real "stuck against the wall" bug the
   automated checks couldn't have caught.** After the level was confirmed
   winnable, I actually played the built site — not just via the headless
   sim — including deliberately walking into a corridor wall at a shallow
   angle the way an imprecise human would, rather than the sim's exact
   angle-aligned approach. Two screenshots taken a second apart, with forward
   held the whole time, showed the exact same wall distance: the player was
   completely stuck. The cause was `moveWithCollision`'s per-axis check
   sampling the full collision radius on the axis *not* being moved, using
   its already-settled position — once that axis merely grazed a
   perpendicular wall, every candidate on the axis actually in motion failed
   the same perpendicular sample. Fixed by easing that perpendicular sample
   in slightly so a graze doesn't block sliding, while the primary-direction
   sample (still full radius) keeps stopping real head-on collision. Verified
   fixed with the same before/after screenshot comparison, forward held the
   same way: the view now keeps advancing instead of freezing.
   [`27c4738`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/27c4738).

5. **Widening the corridors for the tiny-character/huge-room redesign
   introduced a new softlock, and a scripted playtest bot found it, not
   manual play.** The redesign calls for 2-3 tile wide corridors instead of
   single-file passages. `updateDoors()` opened each door cell based on
   distance to that cell's own center, which was fine for a 1-wide doorway
   but left real gaps once a doorway became 3 adjacent door cells: there are
   x-positions directly between two door centers where the player's own
   collision radius stops them further than `DOOR_OPEN_RADIUS` from every
   individual door's center, so the door never opens no matter how squarely
   they approach. I found this by writing a throwaway headless bot that drove
   the real `update()` loop toward a series of waypoints and got stuck dead at
   the A→D corridor mouth for the entire simulated time budget with position
   frozen. Fixed by measuring distance to the nearest point of the door's own
   cell rectangle instead of its center, which makes the trigger uniform
   across the doorway's full width — confirmed by re-running the same bot to
   a real `phase: 'won'` in ~40 simulated seconds, well inside the 5-minute
   budget. `updateDoors()` in `src/game/level.ts`.

6. **The reported "large gray void" bug on tall phone viewports had two
   separate causes, and fixing only the obvious one didn't fix the bug.** The
   first cause was `resizeCanvas()` fitting the canvas against the full
   viewport height without reserving room for the HUD bar or, on touch, the
   on-screen controls — fixed by measuring their real rendered heights via
   `getBoundingClientRect()` and subtracting before fitting. Screenshotting
   the result at 390x844 after that fix still showed a large dead gap,
   because `#touch-controls` was a `position: fixed` overlay anchored
   independently to the viewport bottom, while `#game-stage` (canvas+HUD) was
   centered in the *whole* viewport by `#game-root` — the two blocks had no
   relationship to each other, so the space `resizeCanvas()` had correctly
   reserved for the touch controls just became a gap between them instead. I
   would not have caught this from the layout code alone; only an actual
   screenshot at the mobile viewport showed it. Fixed by making
   `#touch-controls` a normal flex sibling of `#game-stage` so the two dock
   together and get centered as one block — any letterboxing left over (real,
   and unavoidable while keeping the fixed 320x200 / 1.6:1 internal
   resolution) is now split evenly above and below the whole group instead of
   stranded in the middle.

7. **Fixing the square-billboard bug required separating "how big" from "how
   anchored."** Every sprite billboard (walls aside) was being sized as a
   single square and centered on the horizon, which happened to look fine
   only because every procedural sprite canvas was itself roughly square.
   Once real, non-square PNGs (people, robots) were dropped in, they came out
   visibly squashed. The fix computes width from the source image's own
   aspect ratio against a shared reference height (`INTERNAL_HEIGHT /
   transformY`, the same value walls use), and separately anchors character
   sprites' feet to the floor line a wall at that depth would show, rather
   than centering them — pickups/projectiles/particles/the exit marker keep
   the old center-anchor behavior since they read fine either way.
   `drawBillboards` in `src/game/renderer.ts`.

## Known limitations / left as placeholder

- Most visuals are still procedurally-drawn flat-color/geometric-shape
  placeholders generated at runtime (pickups, projectiles, the exit marker,
  the weapon housing, the share card); nothing of the real 1998 game this
  concept was inspired by was reused — no name, logo, maps, sprites, or
  audio. A small set of real CC0 sprites/sounds was added for the two wall
  textures, the door, the enemies, the weapon's hand grip, and its
  hit-splash — see `THIRD_PARTY_ASSETS.md`.
- Audio is minimal: seven short cues (fire, enemy hit, enemy death, player
  hurt, two pickup types, door open), unlocked after the first keyboard/touch
  interaction per browser autoplay policy. No background music.
- The headless playtest bot used to verify winnability (moment 5) is a
  scripted proxy for a human, not a real cold-start playtester; the
  Playwright e2e suite and manual play (moments 1, 4, 6) cover real browser
  timing and real input, but a live human playtest is still worth doing
  before calling the difficulty/pacing tuning final.
