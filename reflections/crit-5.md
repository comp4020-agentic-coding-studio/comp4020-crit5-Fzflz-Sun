# Crit 5 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was separating the feeling I wanted to recreate from the
gameplay I needed. PIE HALL 98 began with my childhood memory of *Wheels!*:
bright indoor spaces, coarse pixels, and an unusual sense of scale. The early
prototype captured that atmosphere, but sparse enemies and short encounters
gave me little reason to keep playing.

Rather than spend the remaining effort on more artwork or weapons, I focused
on the combat-reward loop. The current version has a larger connected map,
replenishing enemy waves, three enemy roles, and a paused three-option
upgrade menu. I replaced world upgrade pedestals because walking over to
inspect a reward made progression easy to miss. The single weapon also shoots
down incoming projectiles, adding a defensive decision without another
control. Five minutes is now a survival milestone, not a forced ending.

## What did this work change about who I want to be as a software developer?

I want to judge an agent-assisted implementation by the experience it creates,
not just whether the requested features exist. A larger map can still feel
empty; an upgrade system can work but communicate its reward poorly. My role
is to play, identify the specific problem, and give the coding agent a
concrete behaviour to improve.

The stuttering fixes reinforced this. Fixing contact-related slowdown did not
fully solve sustained firefights; audio handling and whole-game hit-stop
needed a second pass. My follow-up playtest felt much smoother, but that is
not proof of stable performance on every device. Regression tests protect
known failure cases; longer playtests still need to establish pacing, balance,
and performance at the new enemy density. I want to keep implementation,
evidence, and player experience distinct.
