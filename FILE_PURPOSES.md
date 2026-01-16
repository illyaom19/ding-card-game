# File Purpose Map

This document summarizes the intent of the key front-end files for DING Online.

## Public HTML & Assets
- `public/index.html`: Primary HTML shell that defines the app layout and loads styles/scripts.
- `public/icon.svg`: App icon used for favicon and PWA metadata.
- `public/manifest.json`: PWA manifest metadata for installability.
- `public/sw.js`: Service worker for offline caching and push notifications.

## Stylesheets
- `public/css/main.css`: Entry stylesheet that composes the base and component styles.
- `public/css/base.css`: Global variables, layout structure, and shared typography rules.
- `public/css/components.css`: Component-level styling for panels, buttons, cards, chat, and UI widgets.
- `public/css/flair.css`: Username flair effects and animations.

## Development artifacts
- `dev/`: Local-only samples and prototypes used for design/layout checks; not part of hosted app output.
- `dev/chat-sample.html`: Static sample page showing the chat widget layout with voice messages.
- `dev/flair-sample.html`: Design scratchpad for experimenting with nickname flair visuals.

## JavaScript
- `public/js/app.js`: Application entry point that wires state, UI rendering, and module behavior.
- `public/js/modules/gameplay-utils.js`: Deck construction and core card rule helpers for gameplay.
- `public/js/modules/animations.js`: Animation utilities for card transitions, swap announcements, and popups.
- `public/js/modules/auth.js`: Authentication UI wiring and sign-in/out handlers.
- `public/js/modules/flair-designs.js`: Username flair design catalog and helpers.
- `public/js/modules/rooms.js`: Room code utilities, naming helpers, and share link builder.
