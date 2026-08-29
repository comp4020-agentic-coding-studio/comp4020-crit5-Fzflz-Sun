# Crit 5 reflection

Session facts, for context before answering the two prompts below: this
deliverable is **PIE HALL 98**, an original Canvas 2D pseudo-3D raycasting
shooter (four oversized school-hall rooms, a single handgun, hitscan-vs-
projectile combat, no menu or on-screen text beyond a minimal HUD). It
started as a tech demo — a static population of seven enemies scattered
across the level with no structure to the fight beyond "walk around and
shoot whatever you see." This session turned it into a short, complete
arcade run: a scripted 16-enemy sequence of room encounters across three
behaviorally distinct enemy kinds, two in-world upgrade choices, kill-driven
scoring/combo/resource sustain, and a results screen — a real
fight -> reward -> grow stronger -> harder fight -> results loop, playable
start to finish in one sitting. Most art is still procedurally generated at
runtime; a small, curated set of real CC0 sprites and sound effects was
layered on top earlier (see `THIRD_PARTY_ASSETS.md`), with async loading and
a procedural fallback if a file fails to load. Full build history is in
`PROCESS.md`; commits `b98e41c`, `42a3432`, `27c4738`, `526fc64`, `b6741ea`,
`d6f4fec`, `6ba841e`, `3fb4fa9`.

## What was the breakthrough that moved the work forward?

The breakthrough was realizing the brief's constraints weren't obstacles to
route around — they were the design. "Keep tank controls," "one handgun, no
inventory," and "no new art" together rule out almost every conventional way
of adding depth to a shooter (strafing for skill expression, a weapon loadout
for build variety, new enemy sprites for variety). The actual design space
left open by those constraints is *structure and behavior*: how encounters
are paced, what each enemy actually does when it sees you, and what a kill
is worth — none of which need a single new pixel or keybind. Once I stopped
trying to work around the constraints and started treating "no new
mechanics, no new art" as the spec, the rest followed in order: a wave
controller (`encounters.ts`) turns a static enemy list into pacing; three
small per-kind update functions (`enemies.ts`) turn "three stat blocks" into
three roles (melee chaser, ranged kiter, telegraphed blocker); and reusing
the existing fire input to also shoot down projectiles turns the same one
button into a second decision point ("clear the shot or take the hit") for
free. Tank controls stayed exactly as specified, just retuned (faster
forward/back, brisker turn, shorter cooldown, more forgiving aim) — the old
build's sluggishness was tuning, not the control scheme itself, and I nearly
missed that distinction before actually diffing the old and new numbers
side by side.

The other real lesson came from chasing what looked like a rendering bug in
the upgrade pedestals: a screenshot showed a faint, washed-out blob where a
pedestal should be, and two rounds of edits to the sprite generator (a
translucent glow, then a fully opaque fill) didn't change what I was looking
at — because pixel-level sampling later showed I'd been reading the door
wall texture two tiles further down the corridor, not the pedestal at all,
which the FOV math confirmed was never in frame at that camera angle in the
first place. Eyeballing a screenshot against a deliberately low-contrast
pastel palette is unreliable; sampling actual pixel values and checking the
math (is the target even inside the field of view?) caught a mistake that
looking harder at the same image never would have.

## What did this work change about who I want to be as a software developer?

It sharpened a preference I already had but hadn't applied this
consistently: constraints are information about where the real problem is,
not a smaller version of the problem I'd rather be solving. It would have
been easy to read "no multi-weapon system, no strafing" as "this game can't
have much depth" and pad the scope elsewhere instead — a menu, a minimap,
extra weapon-adjacent polish nobody asked for. Treating the constraint list
as the actual design brief, and asking "what *is* still allowed to vary" is
a habit I want to keep — it produced a more coherent result (a run with a
real shape) than adding features around the edges would have.

The pedestal investigation also changed how much I trust a screenshot on
this kind of low-contrast, intentionally-restricted palette: from now on,
when a rendering judgment call turns on "does this look right," I'd rather
sample actual pixel values and check the underlying geometry (is the object
even in view?) before concluding something is broken and starting to change
code. Two rounds of edits based on a visual impression that turned out to be
looking at the wrong object was a slower and less certain path to the answer
than the pixel check I should have reached for first.
