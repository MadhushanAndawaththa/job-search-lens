<h1 align="center">Job Hunt Visualizer</h1>

<p align="center">
  Local-first Chrome extension for LinkedIn job search that highlights the keywords you care about
  and passively dims job cards LinkedIn has already marked as Viewed, Saved, or Applied.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Manifest V3" />
  <img src="https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="Vanilla JavaScript" />
  <img src="https://img.shields.io/badge/Storage-local%20only-0F9D58?style=flat-square" alt="Local storage only" />
  <img src="https://img.shields.io/badge/Backend-none-5F6368?style=flat-square" alt="No backend" />
  <img src="https://img.shields.io/badge/Telemetry-none-8E24AA?style=flat-square" alt="No telemetry" />
  <img src="https://img.shields.io/badge/tests-12%20passing-brightgreen?style=flat-square" alt="12 tests passing" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#privacy--safety">Privacy & Safety</a> ·
  <a href="#running-tests">Tests</a> ·
  <a href="#project-structure">Project Structure</a>
</p>

---

## Quick Start

> **Prerequisites:** Chrome or Edge (Chromium-based) and Node.js 18+ if you want to run the automated tests.

```bash
git clone https://github.com/MadhushanAndawaththa/Job_Search.git
cd Job_Search
```

### 1. Run the test suite

There are no runtime dependencies to install for the current test setup.

```bash
node --test
```

Or use the package script:

```bash
npm test
```

### 2. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder
5. Open a LinkedIn jobs page and start using the popup or context menu

### 3. Try the main workflows

1. Select a job title or keyword in a LinkedIn job description
2. Right-click and choose **Add "selected text" to Highlighter**
3. Open the popup to change the highlight color, sort, or export the keyword list
4. Browse job cards — LinkedIn-flagged Viewed, Saved, and Applied cards automatically fade out

---

## What It Does

Job Hunt Visualizer is designed to reduce repetitive scanning during LinkedIn job search.

It helps in two ways:

1. **Keyword highlighting** — terms you care about such as `Python`, `Staff Engineer`, `Remote`, or `Visa Sponsorship` are highlighted directly inside the LinkedIn job details panel.
2. **Job state dimming** — job cards that LinkedIn has already marked as *Viewed*, *Saved*, or *Applied* are faded and accent-colored so you can instantly skip them in the results list. The extension reads these states directly from LinkedIn's own rendered DOM badges — no click tracking and no job IDs are stored.

The result is a faster, more organized workflow without needing spreadsheets, external accounts, or scraping infrastructure.

---

## Features

| | Feature | Details |
|---|---------|---------|
| 🎯 | **Select To Highlight** | Right-click selected LinkedIn text to save it as a tracked keyword |
| 🎨 | **Per-Keyword Color Palette** | Pick from 10 curated pastel swatches per keyword; inline popover on every keyword row |
| 👻 | **Job State Dimming** | Passively dims job cards LinkedIn has flagged as Viewed, Saved, or Applied; each state has its own toggle and accent color |
| 🔠 | **Sort & Export Library** | A–Z toggle to sort the keyword list alphabetically; one-click export copies all terms to clipboard |
| 🔍 | **Keyword Search** | Filter the library instantly as you type without affecting saved data |
| 🌗 | **Dark / Light / Auto Theme** | Three-way theme cycle that persists across popup sessions with no flash on open |
| 🪶 | **Passive LinkedIn Integration** | No dashboards, no injected buttons, no class-name mutations on LinkedIn's own elements |
| 🔁 | **Live Storage Sync** | Popup changes propagate through `chrome.storage.local` without reloading the page |
| ⏸️ | **Pause Toggle** | Temporarily disable all decoration without deleting any data |
| 🧩 | **SPA-Aware Content Script** | Handles LinkedIn route changes and dynamic detail pane updates |
| 🔒 | **Local-Only Privacy** | No backend, no analytics, no external API calls, no remote sync |

---

## Architecture

```mermaid
flowchart LR
    User([User])
    Popup[Popup UI\npopup.html + popup.js]
    BG[Background Worker\nbackground.js]
    CS[Content Script\ncontent.js]
    Shared[Shared Logic\nshared.js]
    Storage[(chrome.storage.local)]
    LinkedIn[LinkedIn Jobs Page]

    User -->|selects text| LinkedIn
    LinkedIn -->|context menu action| BG
    BG --> Shared
    Popup --> Shared
    CS --> Shared

    BG --> Storage
    Popup --> Storage
    CS --> Storage

    Storage --> Popup
    Storage --> CS
    CS -->|highlights + ghost styling| LinkedIn
```

**Runtime flow:**

1. **Capture**: the user selects text on LinkedIn and adds it through the Chrome context menu, or enters it manually in the popup.
2. **Persist**: keywords, colors, and settings are stored in `chrome.storage.local`.
3. **Observe**: the content script watches LinkedIn job list and job detail containers with targeted `MutationObserver`s.
4. **Decorate**: matching keywords are wrapped in `<mark>` tags; job cards LinkedIn has flagged as Viewed / Saved / Applied receive a passive `data-jhv-state` attribute that the extension's CSS uses to fade and accent them.
5. **Sync**: popup, background worker, and content script stay aligned through shared logic and storage-change listeners.

---

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Manifest V3 only** | Keeps the extension current with Chrome's supported architecture |
| 2 | **No backend** | Preserves privacy, avoids cost, and reduces operational complexity |
| 3 | **Local storage only** | All user data remains in the browser on the user's machine |
| 4 | **Observer-based DOM updates** | Avoids polling loops and keeps page interaction more targeted |
| 5 | **Read LinkedIn's own state badges** | Viewed / Saved / Applied states are read from LinkedIn's rendered DOM — the extension never stores job IDs itself, keeping data minimal and avoiding fragile click tracking |
| 6 | **`data-jhv-state` attribute for dimming** | Avoids mutating LinkedIn's own class list, which is a known detection vector; a single owned attribute drives all dim styles via CSS |
| 7 | **Shared logic module** | Normalization, storage shaping, matching, and color helpers are testable in isolation |
| 8 | **Literal keyword matching** | Safely supports terms like `C++`, `C#`, and `Node.js` without arbitrary user regex |
| 9 | **Passive styling** | Jobs are faded, not removed; LinkedIn's layout is left intact |
| 10 | **URL polling instead of patching `pushState`** | LinkedIn fingerprints `history.pushState` via `Function.prototype.toString`; a 200 ms URL poll catches SPA navigations safely |

---

## Privacy & Safety

This extension is intentionally built around a low-risk, local-first model.

### Privacy guardrails

- No telemetry
- No external API calls
- No cloud database
- No remote sync
- No user account system

### LinkedIn behavior guardrails

- No automatic job clicking or application flows
- No periodic polling with `setInterval` or `setTimeout` scanners
- No injected control panels, dashboards, or custom buttons inside LinkedIn
- No automatic scraping beyond what the user is already viewing in the page
- No job IDs or browsing history stored — viewed/saved/applied states are read live from LinkedIn's own rendered page
- No mutation of LinkedIn's own class names or HTML attributes

### Important note

This design aims to stay conservative and low-friction, but no third-party extension can guarantee immunity from platform policy changes. Users should still use the tool responsibly and stay within LinkedIn's terms and normal browsing behavior.

---

## Trade-offs

| Decision | Trade-off |
|----------|-----------|
| **No backend** | Simpler and private, but no cross-device sync |
| **LinkedIn selector fallbacks** | Flexible enough for DOM drift, but still dependent on LinkedIn's markup |
| **Passive ghost styling** | Safer than hiding items, but less aggressive for filtering |
| **Literal matching only** | Safer and easier to reason about, but less powerful than advanced regex mode |
| **Local history cap** | Prevents unbounded growth, but older viewed jobs will eventually roll off |

---

## What I'd Improve With More Time

- **Configurable dim opacity** — let users set how aggressively cards are faded
- **Per-keyword match counts** in the detail pane or popup summary
- **Optional exact phrase vs. loose term modes** for more control over matching behavior
- **Manual selector diagnostics mode** to simplify maintenance when LinkedIn changes markup
- **Cross-browser packaging** for Edge and other Chromium-based browsers
- **Keyboard shortcut** to add selected text directly without the context menu

---

## Running Tests

### Automated

```bash
node --test
```

Current automated coverage includes:

- term normalization
- hex color validation
- duplicate keyword handling
- per-keyword color updates
- viewed-history pruning utilities
- LinkedIn job ID extraction
- settings sanitization
- contrast color selection
- literal regex generation for special-character terms (`C++`, `C#`, `Node.js`)

### Manual

1. Load the unpacked extension in Chrome
2. Open a LinkedIn jobs page
3. Add a keyword from selected text (right-click) or the popup textarea
4. Change its color using the per-keyword palette popover
5. Confirm the detail pane updates its highlight color live
6. Browse job cards and confirm Viewed / Saved / Applied cards are faded
7. Toggle individual dim states (Viewed / Saved / Applied) and confirm the page updates
8. Refresh and confirm keyword settings persist
9. Toggle Pause and confirm all page decorations are removed until resumed
10. Switch themes (Auto / Light / Dark) and confirm no flash on popup reopen

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Extension Runtime** | Chrome Extension Manifest V3 |
| **UI** | HTML + CSS + Vanilla JavaScript |
| **Theme** | CSS custom properties + `data-theme` attribute; anti-flash via `theme-init.js` |
| **Storage** | `chrome.storage.local` |
| **DOM Integration** | Content scripts + `MutationObserver` |
| **Testing** | Node.js built-in test runner |

---

## Project Structure

```text
Job_Search/
├── background.js          # Service worker: context menu → keyword storage
├── content.js             # LinkedIn page integration: observers, highlights, and dim styling
├── manifest.json          # Manifest V3 configuration
├── popup.html             # Extension popup markup and inline CSS
├── popup.js               # Popup interactions, storage updates, and theme logic
├── shared.js              # Shared, testable logic used across all extension surfaces
├── styles.css             # Highlight mark and job-state dim styles injected into LinkedIn
├── theme-init.js          # Runs before first paint to apply the saved theme without flash
├── tests/
│   └── shared.test.js     # Automated tests for shared logic (12 passing)
├── package.json           # Test script entry point
└── .gitignore
```

---

## Open Source Notes

This repository is structured like a small open-source project:

- clear runtime separation between popup, background, content, and shared logic
- a documented implementation plan in [PLAN.md](c:\Job_Search\PLAN.md)
- an automated test suite for reusable logic
- privacy and platform-risk constraints documented up front

Before publishing broadly, it would be worth adding:

1. a dedicated `LICENSE` file
2. screenshots or a short demo GIF
3. a release checklist for Chrome Web Store packaging

---

## Version History

| Version | Summary |
|---------|---------|
| 1.2.0 | Color palette swatches, per-keyword inline popover, keyword sort & export, multi-list root coverage for LinkedIn layout variants |
| 1.1.0 | Dark / light / auto theme, Saved and Applied state dimming, SPA-aware observers |
| 1.0.0 | Initial release: keyword highlighting, Viewed state dimming, context menu capture |

---

## License

No license file has been committed yet. Add a `LICENSE` file before publishing or inviting reuse from other developers.