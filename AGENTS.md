# AGENTS Guide for ding-card-game

This repo is a static web app with optional Firebase Functions. Use this guide for quick orientation, development, and deployment context.

## Project layout
- `public/`: Static site assets (HTML/CSS/JS, manifest, service worker). This is the hosted app root.
- `public/js/app.js`: Main entry point for UI/state wiring.
- `public/js/modules/`: Feature modules (auth, gameplay utilities, rooms, animations).
- `public/css/`: Base and component styles.
- `functions/`: Firebase Cloud Functions (Node.js 20, CommonJS).
- `.github/workflows/`: CI/CD workflows (static hosting + functions deploy).
- `INTERNAL_HOSTING.md`: Source of truth for hosting, deploy workflow, and secrets.
- `FILE_PURPOSES.md`: Per-file purpose map for front-end files.

## Local development
### Static app
1. Copy Firebase config template for local runs:
   - `cp firebase-config.example.js public/firebase-config.js`
   - Fill in values (see `INTERNAL_HOSTING.md`).
2. Serve the `public/` folder with any static server (no build step in repo).

### Functions
- `functions/` is a Firebase Functions project (Node 20, CommonJS).
- Dependencies are already listed in `functions/package.json`.

## Deployment notes
- Static hosting: configured via `firebase.json` and GitHub Actions workflow `.github/workflows/static.yml`.
- `public/firebase-config.js` is generated in CI from secrets and **must not** be committed.
- Functions deploy is handled by `.github/workflows/deploy-functions.yml`.
- If you change hosting/secrets/deploy flow, update `INTERNAL_HOSTING.md`.

## Conventions
- Keep `FILE_PURPOSES.md` aligned when moving/adding front-end files.
- Avoid committing secrets; `public/firebase-config.js` is gitignored.

## Testing
- There are no dedicated test scripts in this repo. If you run manual checks, document them in your PR summary.
