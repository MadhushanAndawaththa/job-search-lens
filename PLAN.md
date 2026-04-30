# Job Hunt Visualizer Plan

## Goal

Build a Chrome Manifest V3 extension that stays fully local, helps users avoid re-opening LinkedIn jobs they already reviewed, and highlights user-selected job-title and keyword text in the job details pane.

## Product Rules

- No backend, analytics, telemetry, or external API calls.
- No automated scraping or auto-clicking.
- No injected dashboards or interactive controls inside LinkedIn pages.
- Viewed history is written only after genuine user click or keyboard activation.
- DOM work must rely on targeted observers, not polling loops.

## Current Scope

### Implemented

- MV3 manifest with LinkedIn jobs-only host access.
- Background service worker with selection-only context menu.
- Popup for manual keyword entry, per-keyword color changes, pause toggle, and clearing viewed-job history.
- Content script for job click tracking, viewed-job ghost styling, route-change recovery, and keyword highlighting.
- Shared utility module used by the extension and the automated tests.
- Node-based automated tests for the reusable logic.

### Deferred

- Import/export for keyword lists.
- Configurable history limit in the popup.
- Per-keyword statistics.
- Selector fallback telemetry or diagnostics. This remains intentionally excluded to preserve privacy.

## Architecture

### Runtime Surfaces

- [manifest.json](c:\Job_Search\manifest.json): MV3 configuration and static content-script registration.
- [background.js](c:\Job_Search\background.js): Context menu and keyword persistence.
- [content.js](c:\Job_Search\content.js): LinkedIn page behavior, observers, viewed-job tracking, and highlighting.
- [popup.html](c:\Job_Search\popup.html): Extension popup UI.
- [popup.js](c:\Job_Search\popup.js): Popup state and local storage updates.
- [shared.js](c:\Job_Search\shared.js): Shared normalization, storage-shaping, and matching helpers.

### Storage Schema

- `keywords`: array of `{ id, term, normalized, color }`
- `viewedJobs`: array of LinkedIn job ID strings
- `settings`: `{ paused, historyLimit }`

## Implementation Phases

1. Stabilize shared data contracts so popup, background, and content script all use the same keyword and settings schema.
2. Keep permissions narrow and keep all interactivity inside the extension popup or Chrome context menu.
3. Track viewed jobs from real user interactions only and style them passively.
4. Highlight detail-pane text with idempotent mark tags so LinkedIn markup is not rewritten wholesale.
5. Add automated tests for pure logic and a manual checklist for LinkedIn-specific behavior.

## Testing Strategy

### Automated

- Run `node --test` from the repo root.
- Cover normalization, keyword coercion, duplicate prevention, regex escaping, special-character terms, viewed-history pruning, settings hydration, and job ID extraction.

### Manual

1. Load the unpacked extension in Chrome.
2. Open a LinkedIn jobs page.
3. Select a job title or keyword in the description, right-click, and confirm it is added to the popup list.
4. Change the keyword color in the popup and confirm the highlight color changes on the active job.
5. Click several job cards and verify previously viewed cards become faded after the click.
6. Refresh the page and confirm keywords and viewed-job styling persist.
7. Toggle pause in the popup and confirm highlighting and ghost styling are removed until resumed.
8. Test special terms such as `C++`, `C#`, `Node.js`, and multi-word phrases.

## Definition Of Done

- Automated tests pass locally.
- JavaScript files pass syntax checks.
- Manual LinkedIn verification confirms the three main workflows: add keyword, recolor keyword, track viewed job.
- No added functionality violates the local-first or low-risk behavioral constraints.