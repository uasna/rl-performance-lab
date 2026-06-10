# Phase 44 — Ball Archetype Mutation

## Goal
Move from safe byte-for-byte cloning to the smallest useful mutation that Rocket League may still accept as a playable training pack.

## What changes
- Mutates only shot slot #1.
- Mutates only `Objects[0].Rounds[0].SerializedArchetypes[0]`.
- Requires the string to identify as `Archetypes.Ball.Ball_GameEditor`.
- Updates only textual JSON fields inside that ball archetype:
  - `StartLocationX`
  - `StartLocationY`
  - `StartLocationZ`
  - `VelocityStartSpeed`
  - `VelocityStartRotationY`
- Leaves the other 14 shots untouched.
- Leaves car/spawn/camera archetypes untouched.
- Leaves count fields and the rounds array shape untouched.

## Safety
If no safe ball archetype fields are found, the installer falls back to the Phase 40 clone-first behavior.
If RocketRP cannot serialize or reread the generated `.Tem`, the installer falls back to a clone.
Rollback remains limited to RLA-generated files only.

## Manual validation
After installing the generated pack:
1. Open Rocket League.
2. Go to Training → Custom → Created.
3. Confirm the generated pack shows `0/15`, not `0/0`.
4. Play the pack.
5. Check whether the first shot is different while the other shots stay as the original dummy shots.
