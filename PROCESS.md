# Process overview

## What I built

**PIE HALL 98** — a browser-playable, Canvas-2D pseudo-3D shooter in the style
of mid-90s edutainment raycasters (an original game, not a clone of any real
1998 title): one fixed level of four connected school-hall rooms (Entrance
Hall, Locker Corridor, Lab Classroom, Activity Room) built deliberately
oversized against a small player scale, a single handgun for hitscan fire
against slow dodgeable enemy projectiles, ammo/health pickups, and a full
fight -> reward -> grow stronger -> harder fight -> results loop completable
in one sitting, well under 5 minutes. Three enemy kinds (reframed as mascots
and cleaning/vending robots) with genuinely different behavior — a fast
melee-only chaser, a distance-keeping ranged kiter, and a slow telegraphed
route-blocker — arrive across a scripted 16-enemy sequence of room encounters
(a one-enemy tutorial, then two escalating two-wave rooms) rather than as a
static level population, and the player picks one of two meaningfully
different upgrades after each of the first two rooms from in-world pedestals,
not a menu. Pickups, projectiles, and the exit marker are still procedurally drawn at
runtime from a single sprite factory (`src/game/assets.ts`); a small, curated
set of real CC0 sprites and sound effects was added on top for the two wall
textures, the door, the three enemy kinds, and a self-contained 5-frame
handgun (idle plus a 4-frame fire animation, hand and muzzle flash included
in the source art itself), with async loading and a procedural fallback if a
file fails — see `THIRD_PARTY_ASSETS.md` for exactly what was used, from
where, and under what license.

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

## 2026-08-28 — from tech demo to a short arcade run

The previous version was a playable raycaster with a static population of
seven enemies scattered across the level and no structure to the fight beyond
"walk around and shoot whatever you see." This pass turned it into a scripted
arcade run with a real beginning, middle, and end, while keeping every hard
constraint from the original brief (tank controls, one handgun, no new art,
the existing bright pastel palette and handgun animation untouched):

- **Controls retuned, not redesigned.** Tank-style forward/backward/turn is
  kept (no strafing, mouse-look, jumping, or reload was added), but every
  number governing responsiveness moved: forward 1.95 tiles/s, backward 1.55,
  turn 160°/s, fire cooldown 0.28s, hitscan aim tolerance 9.5°, knockback
  0.23 tiles. The old build felt sluggish because these were all lower;
  raising them (`src/game/constants.ts`) is the entire "control" fix.
- **Static enemy placement replaced with room encounters.** `src/game/
  encounters.ts` now drives a `tutorial -> upgrade1 -> freeRoam -> roomB
  (2 waves) -> upgrade2 -> freeRoamToC -> roomC (2 waves) -> done` state
  machine: 1 tutorial enemy + 3 + 4 + 4 + 4 across the two real rooms (16
  total), capped at 3 simultaneous alive enemies with spawns trickled in and
  briefly telegraphed, a gate that seals shut for the duration of each room's
  fight, and a short pause between each room's two waves.
- **The three enemy kinds now do genuinely different things** (`src/game/
  enemies.ts`), not three stat blocks: Grunt is a 1-HP melee-only chaser with
  no ranged attack at all; Scout holds a preferred distance band and pokes
  with fast, low-damage shots; Brute is slow, barely chases, and visibly winds
  up before a low-frequency, higher-damage shot. Difficulty comes from
  handling a mix of these at once, not from raised HP.
- **Kills now feel like something happened**: a ~45-60ms hit-stop (longer for
  a Brute), a bigger particle burst, a HUD score pop, and a rising kill-sound
  pitch on an unbroken streak — all built from the sounds/particles already in
  the project, no new assets.
- **Score, combo, and resource sustain moved onto the kill loop.** Base scores
  100/150/250 (Grunt/Scout/Brute) times a streak multiplier that climbs 1→4
  and resets to x1 only on taking damage (no time decay); every 3rd kill drops
  a small deterministic ammo pickup and every Brute death drops a deterministic
  health pickup — fixed map pickups were reduced accordingly since kills are
  now the primary sustain source.
- **Two real upgrade choices**, each offered as a pair of differently-colored
  world pedestals (not a popup) after Room B and Room C clear: RAPID
  (-25% cooldown) vs IMPACT (more damage, stronger knockback) after the first
  room; PIERCE (one shot passes through the first enemy hit, no double-hit)
  vs SALVAGE (bigger deterministic ammo/health drops) after the second.
  Walking onto one grants it and clears both from the world; proximity shows
  a one-line HUD description first.
- **The existing fire button now also shoots down incoming projectiles**
  (`resolveHitscan` in `src/game/combat.ts`) — no new keybind. Destroying a
  projectile is checked before hitting an enemy and uses a more forgiving 14°
  tolerance than landing a hit (9.5°), with its own cyan/white burst and
  sound, and a one-time hint the first time a ranged enemy appears.
- **A results screen** (`#end-overlay` in `index.html`, `hud.ts`) now appears
  once the player reaches the exit after Room C clears: completion time,
  score, kill count, best combo, both upgrades chosen, and a deterministic
  S/A/B/C grade from time + score + damage taken. Restarting (`Enter`/`R`)
  fully rebuilds state via `createInitialState()` — no leftover upgrades,
  score, or combo from the previous run.

Verification: the full existing check suite (`pnpm check` — 44 unit/spec
tests across encounter progression, the simultaneous-enemy cap, scoring/combo,
resource drops, PIERCE, and projectile destruction — plus typecheck, build,
lint) and the Playwright e2e suite (`pnpm test:e2e`) both pass. A scripted
autopilot drove the actual built site in a real browser end to end (real
`requestAnimationFrame`/keyboard-event timing, not a headless simulation) and
reached the results screen with all 16 enemies cleared and a grade of A,
confirming the full loop and the results screen both work under real
per-frame timing. That run finished in about a minute of in-game clock time,
which is not a human-pacing estimate — a bot with near-perfect aim and
pathing plays much faster than the 3.5-4.5 minute target assumes for a person
who aims, occasionally misses, and looks around a room; no live human
playtest was recorded this session, so the target pacing window is the
design intent, not a directly measured result. All scaffolding written to
verify this behavior (a headless playtest bot, a live-browser autopilot
script, and their temporary state-inspection hooks) was deleted once each
check passed — none of it shipped.

## Known limitations / left as placeholder

- Most visuals are still procedurally-drawn flat-color/geometric-shape
  placeholders generated at runtime (pickups, projectiles, the exit marker,
  the share card); nothing of the real 1998 game this concept was inspired by
  was reused — no name, logo, maps, sprites, or audio. A small set of real
  CC0 sprites/sounds was added for the two wall textures, the door, the
  enemies, and the weapon — see `THIRD_PARTY_ASSETS.md`.
- Audio is minimal: seven short cues (fire, enemy hit, enemy death, player
  hurt, two pickup types, door open), unlocked after the first keyboard/touch
  interaction per browser autoplay policy. No background music.
- Every automated playthrough check (headless and in-browser) has been a
  scripted proxy for a human, not a real cold-start playtester; the
  Playwright e2e suite and manual play (moments 1, 4, 6) cover real browser
  timing and real input, but a live human playtest is still worth doing
  before calling the wave/upgrade balance and the 3.5-4.5 minute pacing
  target final.
