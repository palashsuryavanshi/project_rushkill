# Project Rushkill

A browser-only first-person shooter: one player fights AI bots aboard a yacht map. This glossary fixes the gameplay vocabulary used across `src/game/`, the HUD, and design discussions.

## Combat

**Weapon**:
A loadout firearm defined by damage, fire rate, magazine size, spread, recoil, and bullet speed. Categories are AR, SMG, Shotgun, and Sniper.
_Avoid_: gun, firearm

**Shot**:
One trigger pull. A shotgun shot contains several pellets but still counts as a single shot for accuracy and hit registration.
_Avoid_: bullet, round

**Pellet**:
One projectile inside a shotgun shot.
_Avoid_: bullet

**Clip**:
The rounds currently loaded in a weapon. Reloading refills the clip from reserve ammo.
_Avoid_: magazine

**Reserve ammo**:
Unloaded rounds available to refill the clip. Infinite in the current design.
_Avoid_: spare ammo, backup ammo

**Spread**:
Angular deviation applied to the aim direction before the hit test. It grows while moving and hip-firing and shrinks while aiming down sights.
_Avoid_: accuracy

**Recoil**:
Upward and sideways camera kick applied per shot that recovers over time.
_Avoid_: kick, climb, punch

**ADS**:
Aiming down sights. Lowers FOV, tightens spread, and slows movement.
_Avoid_: zoom, scope

**Scope**:
The sniper-specific ADS presentation: a full-screen optic overlay instead of a crosshair.
_Avoid_: zoom

**Pending hit**:
A shot whose damage is delayed by projectile travel time. It resolves on impact and is dropped if the target dies first.
_Avoid_: delayed damage, projectile

**Headshot**:
A hit on the head hitbox, multiplying damage by the weapon's headshot multiplier.
_Avoid_: crit, head hit

**Kill**:
Reducing a combatant's HP to zero.
_Avoid_: elimination, frag, takedown

**Shotgun cutoff**:
The 20 m hard range of shotgun pellets. Inside it they deal full damage; beyond it they deal none.
_Avoid_: falloff, damage drop-off

**Sniper falloff**:
The sniper's 20% base-damage loss for every full 30 m beyond the first. Range itself is unlimited.
_Avoid_: damage drop-off, range limit

**Bullet blocker**:
Geometry that stops a round: every solid collider plus the tinted glass panes. Glass blocks bullets but not movement.
_Avoid_: wall, obstacle

**Jump repeat**:
A browser `keydown` repetition while a key is held. Jump intent ignores repeats so one press is one jump.
_Avoid_: auto-bhop, key spam

**Streak**:
Consecutive kills without dying. Drives score bonuses and streak banners.
_Avoid_: combo

## Bots and Navigation

**Bot**:
An AI-controlled combatant with a personality, difficulty, and weapon.
_Avoid_: enemy, NPC, AI player

**Personality**:
A bot's behavioral archetype: assault, sniper, defender, flanker, support, or balanced. It biases movement and preferred engagement range.
_Avoid_: class, role

**Difficulty**:
The tuning preset (recruit, regular, veteran, elite) controlling reaction delay, aim error, vision, and hearing.
_Avoid_: skill

**Awareness**:
A bot's current perception state. The normal flow is unaware → suspicious → alert → engaged, with searching and recovering as detours.
_Avoid_: state, mood

**Suspicious**:
A bot investigating a noise it heard but has not seen.
_Avoid_: curious, investigating

**Alert**:
A bot that has spotted a target and is waiting out its reaction delay before it may fire.
_Avoid_: aware, spotted

**Engaged**:
A bot with a visible target that is actively moving and firing.
_Avoid_: combat, fighting

**Searching**:
A bot that lost sight of its target and is moving to the last known position.
_Avoid_: hunting, chasing

**Recovering**:
A low-HP bot seeking cover for a bounded time.
_Avoid_: retreating, fleeing

**Last known position**:
Where a bot last saw or heard its target.
_Avoid_: LKP, memory position

**Waypoint**:
A named navigation node used by bots to patrol and to pick respawn locations.
_Avoid_: node, path point

**Spawn grace**:
A short post-respawn window in which a bot cannot perceive or fire.
_Avoid_: spawn protection, immunity

## Movement

**Grounded**:
Whether the player is standing on a walkable surface.
_Avoid_: on floor, on ground

**Slide**:
A timed speed burst available while moving above a threshold; it can be chained into a slide hop.
_Avoid_: dash, sprint

**Coyote time**:
A short grace window after leaving the ground in which a jump still succeeds.
_Avoid_: late jump

**Jump buffer**:
A short window that remembers a jump press made just before landing.
_Avoid_: input buffer

## Match and HUD

**Match**:
One timed round with a score limit. It ends when either the time or the score limit is reached.
_Avoid_: game, round

**Score limit**:
The kills required to win a match outright.
_Avoid_: target score, win score

**Respawn**:
Returning to play after a kill. The player waits three seconds; bots wait ten.
_Avoid_: revive, rebirth

**Respawn bar**:
The draining bar shown while the player is dead. It replaces a numeric countdown and empties exactly as the respawn timer reaches zero.
_Avoid_: countdown, timer

**Health regen**:
Player-only healing that starts 4 seconds after the last damage and restores 20 HP per second up to the maximum. New damage restarts the delay; dead players never regenerate.
_Avoid_: auto-heal, passive heal

**Title screen**:
The pre-match presentation with the orbit camera around the yacht.
_Avoid_: main menu, lobby

**Pointer lock**:
Browser mouse capture. Look and fire input are only accepted while the pointer is locked.
_Avoid_: mouse lock, mouse capture

**Killfeed**:
The scrolling list of recent kills shown top-right.
_Avoid_: feed, log

**Hitmarker**:
The brief X shown at the crosshair when a shot connects.
_Avoid_: hit indicator, damage marker

**Floating damage**:
A damage number projected at the hit position in screen space.
_Avoid_: damage number, popup

**Minimap**:
The top-left overhead map showing the player's heading and bot positions.
_Avoid_: radar
