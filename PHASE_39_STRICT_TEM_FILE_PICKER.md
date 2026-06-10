# Phase 39 — Strict .Tem File Picker

Fixes the template selector on Windows.

## Problem
The previous dialog mixed `openFile` and `openDirectory`. On Windows, that can behave like a folder picker and hide `.Tem` files, causing the folder to appear empty even when Explorer shows training packs.

## Fix
- `Cambiar plantilla .Tem` is now a strict file picker.
- It only accepts `.Tem` files.
- Folder selection remains separated under `Cambiar MyTraining`.
- The selected `.Tem` is stored as the active template path.

## Expected result
`Cambiar plantilla .Tem` shows `.Tem` files inside `MyTraining`, so the user can select the 15-shot template directly.
