# Process overview

## What I built

A browser-playable, Canvas-2D pseudo-3D shooter in the style of mid-90s
shareware raycasters: one fixed level of four connected rooms, seven enemies
across three kinds, hitscan player fire against slow dodgeable enemy
projectiles, ammo/health pickups, and a win/loss loop with no menu, tutorial,
or on-screen text — the controls are meant to be discoverable in the first few
seconds of play.

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

## Known limitations / left as placeholder

- All visuals are procedurally-drawn flat-color placeholders (checkerboard
  wall textures, solid-shape enemies/weapon) — no art assets were downloaded
  or produced, per this deliverable's scope.
