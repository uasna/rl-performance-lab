# Phase 26 — Animated Tactical Playback

Fixes the static tactical maps introduced by the RLA-style UI patch.

## Files changed

- `src/components/rocket-league/SkillAreasLab.tsx`
- `src/components/rocket-league/GameAnalysisPanel.tsx`
- `src/styles.css`

## What changed

- Concept maps now have real play/pause controls.
- Rotation playback starts animated and loops instead of staying frozen.
- The scrubber/progress bar can be clicked to seek.
- Isometric / Top-down toggle now changes the tactical map mode.
- Cars and ball move along pillar-specific tactical routes.
- Match Analysis replay playback now uses requestAnimationFrame and click-to-seek.

## Scope

No hooks, stores, lib logic or types were changed.
