# Phase 37 — Force Bulk Match Register

Adds a safer bulk import path for local Rocket League replays.

## Changes
- `Procesar todo + crear partidas` now creates a Match History entry for every pending replay.
- If the parser extracts players/stats, it creates a normal replay match.
- If the parser cannot extract enough stats, it creates a placeholder match instead of silently skipping it.
- Adds a visible `Forzar crear TODAS` button.
- Placeholder matches are tagged with `placeholder`, `bulk-import`, and remain clearly marked as pending deep analysis.

## Why
Some `.replay` files convert to JSON but do not expose enough player stats for the mapper. Before this patch they were skipped, which made the count look stuck. Now they are still registered so the user can see every replay in Match History.
