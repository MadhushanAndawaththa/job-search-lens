# Job Search Lens — PRD / Work Log

## Original Problem Statement
> "this is a linkedin focused extension that has some function that work all sites. focus on all areas of improvements and Just identify and report. all suggestions are sound good should implement all but when it comes to these implement them if there is a better option" — (theme-init.js localStorage, background.js context menu).

## Product
Local-only Chrome MV3 extension. Highlights saved keywords on any website; on LinkedIn Jobs it also dims viewed/saved/applied cards and injects company size + follower stats inline.

## Architecture (unchanged)
- `manifest.json` — MV3, content script on http/https.
- `background.js` — service worker, context-menu "Add to Highlighter".
- `shared.js` — pure storage / keyword / regex helpers (Node+browser).
- `dom-heuristics.js` — LinkedIn job list/card detection.
- `content.js` — highlight engine + LinkedIn dim/stats orchestration.
- `popup.html` + `popup.js` + `theme-init.js` — interactive UI.

## Work Completed — 2026-01 Review Pass
Full audit + implementation of every actionable finding from the review.

### High-priority fixes
- **`tabs` → `activeTab`** in manifest (smaller install warning).
- **URL polling gated to LinkedIn** (`installNavigationHooks`): non-LinkedIn pages no longer run a 200 ms `setInterval` for the lifetime of the tab.
- **`createHighlightSignature` replaced** with O(1) `contentVersion` dirty-counter bumped by mutation observers / storage listeners. Eliminates per-tick `textContent` allocation across the entire page.

### Medium-priority fixes
- Removed dead `viewedJobs` storage key, `coerceViewedJobs`, `pruneViewedJobs` (+ the corresponding test).
- Theme: dropped `chrome.storage.local` writes/reads for theme. `localStorage` is now the single source of truth (kept for synchronous pre-paint read in `theme-init.js`). Drift removed without losing anti-FOUC behavior.
- Consolidated the two `chrome.runtime.onMessage` listeners in `content.js` into one switch.
- Cached `OWNED_MUTATION_SELECTOR` as a module constant.
- Context menu: kept top-level `createContextMenu()` (needed for MV3 SW restarts) but removed `onInstalled` + `onStartup` duplicates and replaced destructive `remove`-then-`create` with idempotent `create` (swallowing the harmless duplicate-id `lastError`). Race eliminated.
- Manifest: added `version_name`, explicit `content_security_policy`.

### Accessibility
- `Esc` now closes the open color popover and returns focus to the swatch button.
- Color swatch buttons get `aria-haspopup`, `aria-expanded`, descriptive labels.
- Color popovers expose `role="group"` with `aria-label`.
- Keyword search input gets `aria-label`; keyword list gets `aria-label`.
- Form palette no longer rebuilds entire DOM on each click — `aria-pressed` toggled in place.

### Low-priority polish
- `splitKeywordTerms` now accepts both newline- and comma-separated input.
- `buildLiteralRegex` uses `Array.from(term)` so astral/emoji code points don't break the word-boundary check.
- `findStateBadgeTitleTextAnchor`: `TITLE_ANCHOR_IGNORED_TEXT` lifted to module constant.
- Export-clipboard race fixed (caches original label once, cancels prior timer on re-click).
- `setPageStatus` now diffs and skips DOM writes when nothing changed — quieter for screen readers on the 1.5 s polling tick.
- `styles.css`: replaced emoji `::before` content with inline SVG icons (consistent across OS / themes).
- Updated outdated empty-state copy ("right-click text on LinkedIn" → "on a page").
- Added GitHub Actions CI workflow (`.github/workflows/test.yml`).
- README: updated permission table, test badge count (31 → 30).

## Tests
- `node --test --test-force-exit tests/` → **30 / 30 passing**, lint clean for content.js, popup.js, shared.js, background.js.
- 1 test removed: `pruneViewedJobs` (dead code).

## Files Changed
- `manifest.json`, `background.js`, `shared.js`, `content.js`, `popup.js`, `popup.html`, `styles.css`, `theme-init.js`, `tests/shared.test.js`, `README.md`, `.github/workflows/test.yml` (new).

## Backlog / Future
- P2: Optional `host_permissions` flow for users who want per-site grants (further reduces install friction).
- P2: Add `_locales/en/messages.json` + `default_locale` to enable future i18n.
- P2: Persist popup width/height preferences if extension grows beyond 380×580.
- P3: Replace popup's 1.5 s polling diagnostics with content-script-pushed updates via `chrome.runtime.sendMessage` to popup.
- P3: Differential re-highlight (only walk changed subtree from mutation records instead of all roots).
