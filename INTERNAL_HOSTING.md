INTERNAL: Hosting + Secrets (non-public)

This file documents how static hosting and secrets are handled for this repo.
If you change hosting, secrets, or the deploy workflow, update this file too.

Hosting (Firebase Hosting)
- Config: firebase.json uses hosting.public = "public" and site = "dingonline".
- Static assets live in: public/
- Deploy workflow: .github/workflows/static.yml
- Deploy target: https://dingonline.web.app (project id from secrets)

Secrets (GitHub Actions)
- FIREBASE_SERVICE_ACCOUNT: JSON service account key with hosting deploy perms.
- FIREBASE_PROJECT_ID: Firebase project id (e.g., dingonline).
- FIREBASE_CONFIG: JSON object string for Firebase web config.
- FIREBASE_VAPID_KEY: Web push VAPID key string.

How firebase-config.js is created
- The workflow writes public/firebase-config.js at deploy time from secrets.
- public/firebase-config.js is ignored via .gitignore and should not be committed.
- public/firebase-config.example.js is the template for local dev.

Local dev (static)
- Copy firebase-config.example.js to public/firebase-config.js and fill values.

Related workflows
- .github/workflows/deploy-functions.yml handles functions only and uses:
  - FIREBASE_SERVICE_ACCOUNT
  - FIREBASE_PROJECT_ID

Keep this file up to date whenever any of the above changes.
