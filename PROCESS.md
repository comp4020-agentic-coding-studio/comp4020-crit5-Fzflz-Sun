# Process overview

## What I built — current version, 2026-08-30

**PIE HALL 98** is an original browser-playable, Canvas-2D pseudo-3D survival
shooter. The visual starting point was my childhood memory of *Wheels!*:
bright blue/purple indoor spaces, coarse pixels, and small figures inside
oversized rooms. It is an interpretation of that feeling, not a remake or a
reuse of that game's assets. The renderer uses raycasting and flat sprites
at 320×200; movement is continuous, with a 32-step viewing direction for the
deliberately rough look. Forward/backward movement, turning, and one handgun
remain the controls — no jumping, strafing, mouse-look, reload, or weapon
inventory.

The current loop is **fight -> collect resources -> choose an upgrade ->
survive the next wave**, rather than the earlier fixed-content exit run:

- A fixed 43×31 indoor map has eight zones, a central hall, loop corridors,
  cover, automatic doors, and 16 predefined spawn anchors. The map is not
  procedurally randomized, and zones share the existing art set.
- Enemies keep arriving during each 45-second combat phase. A timed cleanup
  phase then stops spawning and removes remaining enemies after 15 seconds
  without kill credit, so one distant enemy cannot hold up progression.
  Grunts chase at close range, Scouts keep their distance and shoot, and
  Brutes telegraph slower, heavier attacks. The player's shot can also
  destroy an incoming projectile.
- Between waves, the world pauses for a three-option menu: choose one leveled
  upgrade, then continue after a three-second countdown. Nine upgrade kinds
  cover fire rate, damage/knockback, piercing, resource drops, movement,
  health, armour, projectile interception, and the score multiplier.
- Kills build score and a no-damage streak multiplier, with periodic ammo
  and health drops. Five minutes triggers a milestone banner, not a win
  screen. Death or choosing End Run produces the results screen.
- Title, instructions, pause, save/load, and confirmation screens surround
  the run. Three browser-local save slots preserve logical progress for
  Continue/Load Game; menus pause the survival clock and combat.

The art remains deliberately small in scope: a curated CC0 set supplies the
wall/door textures, three enemy kinds, five-frame handgun, and seven sound
cues; pickups, projectiles, and other simple effects use procedural sprites.
The handgun frames are drawn with nearest-neighbour integer scaling. Sprite
loading has a procedural fallback. Sources, authors, licenses, and edits are
recorded in `THIRD_PARTY_ASSETS.md`.

## The moments that mattered

The first seven moments below record earlier builds. Their room counts,
exit-based win condition, and old tuning values are historical evidence,
not descriptions of the current endless mode. Later sections explain what
changed and why.

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

2. **The deterministic combat test needed a synthetic map, not the
   real level.** The original combat rule was that a shot could only
   damage the nearest visible enemy on the ray, and that a wall in front of an
   enemy blocked it. Testing this against the then-current 23×15 level would
   couple the test to geometry unrelated to the rule being checked.
   Instead, `spec/combat.test.ts` builds a minimal open corridor map per case
   and calls `resolveHitscan` directly with hand-placed enemies — nearest-hit,
   occluded, out-of-tolerance, dead-enemy, and out-of-range cases each get
   their own case, independent of `level.ts`. This is why I could relocate a
   level wall in moment 1 without touching or re-verifying this test at all —
   it never depended on that geometry.
   [`b98e41c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/b98e41c).

3. **A quantized render angle can make a genuinely aimed shot miss.** The
   visual design uses a coarse ~32-step render angle rather than continuous
   viewing, for the low-fidelity period feel, but the hitscan itself still
   needs to feel fair with no crosshair. Using the raw continuous angle for
   aim tolerance would let a shot that reads as dead-on-screen still fail,
   since the rendered direction and the fired direction could differ by up to
   half a render step. `HITSCAN_AIM_TOLERANCE` was initially 7° to clear that
   worst case (360°/32/2 = 5.625°) with margin, and the hitscan fires along
   the same quantized angle the frame renders — documented at the constant's
   definition in
   [`b98e41c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/b98e41c#diff-src/game/constants.ts)
   so the two numbers can't drift apart independently later. The current
   base tolerance is 9.5° after the subsequent responsiveness pass.

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

## Earlier iteration — from tech demo to a short arcade run (superseded)

This is the intermediate 16-enemy version, before the infinite-survival
redesign. Its implementation is preserved in
[`5de48a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/5de48a5);
`encounters.ts`, world upgrade pedestals, and the exit-based ending described
here have since been replaced. The following records the decisions and
verification from that stage, not a claim about the current build.

The previous version was a playable raycaster with a static population of
seven enemies scattered across the level and no structure to the fight beyond
"walk around and shoot whatever you see." This pass turned it into a scripted
arcade run with a real beginning, middle, and end, while keeping the chosen
design limits for that pass (tank controls, one handgun, no new art,
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

Recorded verification for the intermediate arcade iteration: the then-existing
check suite (`pnpm check` — 44 unit/spec tests across encounter progression,
the simultaneous-enemy cap, scoring/combo,
resource drops, PIERCE, and projectile destruction — plus typecheck, build,
lint) and the Playwright e2e suite (`pnpm test:e2e`) both passed. A scripted
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

## 2026-08-29 — separating retro feel from unintended stutter

Playtesting exposed two different problems: severe stutter when touching an
enemy, then a remaining interruption during sustained shooting. Calling both
"a rendering problem" would have hidden the distinction. Working with coding
agents, I used those repeatable situations to narrow the investigation and
then checked the result by playing again.

The first pass introduced cooldown-gated contact damage and an explicit hurt
event, instead of treating every overlapping frame as a fresh damage/sound
event. Entity separation gained a non-zero fallback for exact overlap. Audio
was pooled and rate-limited, while death particles moved from the expensive
billboard stripe renderer to a capped, single-rectangle draw path. Regression
tests cover contact cooldowns, separation, audio events, spawn safety, and
particle draw-call budgets.
[`5de48a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/5de48a5).

That improved contact but did not fully solve repeated firefights. The next
pass replaced active audio-element seeking with one shared Web Audio context
and decoded sound buffers, shortened the firing cue, and deduplicated
same-frame sounds. It also removed the global hit-stop early return: brief
enemy/world freezes remain, but player movement, firing cooldown, weapon
animation, and elapsed time keep advancing. The fire animation now has its
own timer, so a fire-rate upgrade cannot skip its opening frames. Projectiles
received a cheaper per-entity draw path too. Tests specifically protect those
behaviours.
[`d363b8c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/d363b8c).

My follow-up playtest feedback was that the stutter was almost gone. That is
a qualitative observation, not a measured frame-rate guarantee, especially
after the later increase in enemy density. The useful lesson was that an
intentional "impact" effect can feel like a bug when it interrupts the very
controls the player is trying to use.

## 2026-08-30 — from short encounters to endless survival

The fixed encounter sequence still left too little to do. I wanted a reason
to keep fighting without spending the remaining effort on more bespoke art
or a weapon collection. The redesign therefore changed structure and rewards:
`director.ts` replaced `encounters.ts`, the map grew to eight loop-connected
zones, and enemies are replenished during timed waves rather than drawn from
a fixed total population. Difficulty comes from spawn pace, density, and
enemy mix, then plateaus instead of scaling health or damage forever.

The original upgrade pedestals also made the reward easy to miss: the player
had to walk over and inspect them. Replacing them with a paused three-choice
menu makes the decision explicit and separates combat from choosing how to
grow. `upgrades.ts` holds nine leveled effects with ceilings. Existing ammo
and health pickups still belong in the world; permanent ability choices no
longer do.

Making a run open-ended also required a way to leave and return. Explicit
screen states coordinate the title, pause, instructions, save/load,
confirmation, upgrade, and results screens. `save.ts` stores versioned
logical run state in three localStorage slots, including upgrades, enemies,
wave progress, door states, and RNG state. Audio objects, projectiles,
particles, and other transient effects are rebuilt or cleared on load, so
this is continuation of progress, not an exact frame-by-frame replay.
Dead enemies and old pickups are cleaned up rather than retained for the
whole run. These changes landed together in
[`ce69e01`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/ce69e01).

A larger map with conservative spawning could still feel empty. The next
tuning pass raised the active-enemy budgets to 24/32/40/48/56 across the first
five waves, kept a separate hard-ceiling constant of 64 and a ranged budget
of 16, and shortened spawn intervals from 1.0 seconds toward a 0.4-second
floor. These are configured budgets, not a claim that every wave always
reaches those populations. Each wave now queues an opening burst, limited by
available safe-distance anchors, with visible anchors preferred for that
burst; enemies still appear after their short telegraph. Ordinary kills can
also yield periodic health drops, rather than health depending only on Brutes.
[`4da80b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Fzflz-Sun/commit/4da80b4).

## Current verification and remaining limits

- During this documentation update on 2026-08-30, `pnpm check` passed against
  gameplay revision `4da80b4`: type checking, production build, TypeScript/CSS
  lint, and **101 tests across 14 files**. These cover combat, scoring,
  contact/separation, wave transitions and sampled spawn caps, map
  reachability, audio-event handling, selective hit-stop, weapon animation,
  draw-call budgets, and shipped asset-size limits.
- `pnpm check:evidence` also passed: the reflection filename is correct and
  all seven distinct commit citations in this process document resolve
  locally. `git diff --check` found no whitespace errors.
- The repository also contains Playwright checks for title/start, pause,
  save/load, ending a run, one live wave/upgrade cycle, touch controls, and
  layout. They were not rerun for this documentation-only change. Earlier
  browser passes recorded above or in commit messages apply to their own
  revisions; they are not evidence of a fresh run after the density change.
  Some browser-test descriptions still assume the earlier sparse opening.
- A bounded-array test or asset-size budget is not a 15–30 minute browser
  soak test or a frame-time measurement. The higher-density version still
  needs that longer playtest and balancing feedback from a new player.
- "Endless" describes continued waves, not endless new content: the map and
  default RNG seed are fixed, the enemy set is three kinds, and difficulty
  and upgrade levels cap out. When too few upgrades remain eligible, the
  current menu fills spare options with kinds that may already be maxed;
  selecting one does not promise further growth. That late-run reward case
  remains a limitation.
- Saves are local to the browser, with no cloud sync, and transient combat
  effects do not survive loading. Corrupt-save and nested-menu edge cases
  need broader coverage than the existing basic save/load browser scenario.
- The small shared art set and seven sound cues are intentional scope
  limits. There is no background music, and no claim that the eight map
  zones have eight independently authored visual themes.
