# Phase 43 — SerializedArchetypes Mapper

This phase does not mutate Rocket League training shots. It adds a diagnostic report focused on the actual structure exposed by RocketRP:

- `Objects[0].Rounds[n].TimeLimit`
- `Objects[0].Rounds[n].SerializedArchetypes[]`

Phase 42 showed that no direct numeric/vector geometry fields are present in the decoded JSON. Therefore, shot geometry is likely represented inside `SerializedArchetypes` strings or another packed structure. This phase writes:

`phase43-serialized-archetypes-map.json`

The report includes:

- per-round `SerializedArchetypes` count
- string lengths and hashes
- encoding hints
- first/last string samples
- base64 preview attempt where applicable
- shot #1 vs shot #2 string diffs

Safety rules:

- Does not install experimental geometry.
- Keeps fallback clone behavior.
- Does not touch manual packs.
- Only writes diagnostics inside the RLA draft folder.

Next phase should only mutate after this report identifies a clear safe field/segment.
