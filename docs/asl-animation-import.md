# ASL animation import: current status

The first-stage local inspection page is `/asl-animation-lab.html`. It supports
single self-contained FBX/GLB files up to 100 MB, animation selection, source
skeleton preview, pause/restart/speed, and a downloadable inspection report.
Files are parsed in the browser, not uploaded to Gemini. External resources in
uploaded files are rejected; export a self-contained GLB or texture-free FBX.

## What is implemented

The Vest preview accepts only bone rotation tracks with matching normalized
bone names, hierarchy and rest rotations/scales. Mixamo name prefixes are
normalized. Translation, scale, facial, missing-bone and incompatible tracks
are reported rather than silently discarded. This is a conservative compatibility
test, not a general Vicon/3D-LEX to Mixamo retargeter. Source skeleton preview
remains available when Vest preview is unavailable.

## Data blocker (checked 2026-11-15)

3D-LEX's published data URL points to OSF project `g7u9c`:
https://osf.io/g7u9c/?view_only=8090319e12aa4fd991d81e369a1cbd88

The API allowed reading the project metadata, but its OSF storage file list and
child component list both returned `data: []`. No ASL sample was downloaded.
The author repository https://github.com/OlineRanum/SAPA directs users to contact
the authors for data access. No message has been sent on the user's behalf.

The paper describes 1,000 ASL signs and retargeted body/hand FBX files, under
CC BY 4.0: https://aclanthology.org/2024.signlang-1.33.pdf
Record attribution and the license supplied with actual files before distribution.

## Next steps requiring real samples

1. Obtain a few FBX files plus gloss labels, rest pose and skeleton documentation.
2. Load a sample in the lab; inspect fingers, wrist orientation and face-relative positions.
3. Implement and validate a source-rig-specific retargeter if the compatibility gate rejects it.
4. After visual and ASL review, register approved clips with source attribution in
   the local ASL dictionary, then extend to roughly 50 common signs.

## Downloaded alternative: Studio Galt (2026-11-15)

Eight ASL FBX samples are now stored in `public/asl-samples/studio-galt/`:
Hello, Please, Bye, Book 2, Apple 1, Baby, Bad, Blue Color.
Source: https://github.com/StudioGalt/Sign-Language-Mocap-Archive
License: CC0-1.0 (upstream license and README are included alongside samples).
The manifest records source URL, pinned commit, source date, file size and SHA-256.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/download-asl-samples.ps1`
to download the selection. Existing files are not overwritten. Run
`node scripts/verify-asl-samples.mjs` to check hashes, FBX parsing and animation tracks.
The lab has a sample picker; no manual file selection is necessary.

These are actual ASL motion files supplied by Studio Galt, not 3D-LEX files.
They include 53 bones with 30 finger bones. They have not been linguistically
reviewed here. The source includes translation/scale tracks and a root locator,
so the conservative Vest compatibility gate may reject them until retargeting.

No new ASL signs or 3D-LEX animations have been added to the translator yet.
Technical test fixtures are synthetic rotations and must never be labeled ASL.
