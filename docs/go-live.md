# Go-Live Runbook — Job Search Lens v1.3.0

Everything you need to ship the extension to the Chrome Web Store. The dev side is done; this file lists only the steps that require your account or identity.

Estimated end-to-end time: **30–60 min hands-on**, plus **1–7 days waiting for Google's review**.

---

## ✅ Pre-flight (already done for you)

- [x] Code reviewed, lint clean, 30/30 tests passing.
- [x] No `console.log`, no `debugger`, no `TODO`s left in shipped code.
- [x] Manifest V3 with minimal permissions (`contextMenus`, `storage`, `activeTab` + host access).
- [x] Production `.zip` built at `dist/job-search-lens-v1.3.0.zip` (40 KB, 15 files, no dev assets).
- [x] Five Web Store images generated at exact dimensions in `assets/store/`:
  - `small-promo-440x280.png`
  - `marquee-1400x560.png`
  - `store-preview-1280x800.png` (4-panel feature overview)
  - `popup-screenshot-1280x800.png` (real popup UI composite)
  - `og-image-1200x630.png` (social shares)
- [x] Product site refreshed at `docs/` with universal-first messaging.
- [x] Privacy policy + support page ready to serve from GitHub Pages.

---

## STEP 1 — GitHub (~5 min)

You need a public privacy policy URL for the Chrome Web Store submission. GitHub Pages is the easiest.

```bash
# In your local clone:
git add -A
git commit -m "v1.3.0: code review pass + refreshed product site + new marketing assets"
git push origin main
```

Then on GitHub:

1. Go to **Settings → Pages**.
2. Source: **Deploy from a branch** → Branch: `main` → Folder: `/docs`.
3. Save. Wait ~2 minutes.
4. Verify these URLs return 200:
   - `https://madhushanandawaththa.github.io/Job_Search/`
   - `https://madhushanandawaththa.github.io/Job_Search/privacy-policy.html`
   - `https://madhushanandawaththa.github.io/Job_Search/support.html`

If they don't resolve, the rest of this runbook won't work — fix Pages first.

---

## STEP 2 — Chrome Web Store developer account (~10 min, **one-time $5 fee**)

1. Open <https://chrome.google.com/webstore/devconsole>.
2. Sign in with the Google account you want listed as developer.
3. Accept the developer agreement.
4. Pay the **$5 one-time** registration fee (only required the first time you publish anything).
5. Complete identity verification if Google prompts for it (G2A-style, varies by region).

> Tip: use a Google account you actually plan to maintain. The displayed publisher name is hard to change later.

---

## STEP 3 — Upload the extension (~5 min)

1. From the dev console, click **+ New item**.
2. Drag `dist/job-search-lens-v1.3.0.zip` (or click upload). Wait for it to parse.
3. The console auto-fills name, version, description, icons from the manifest. Verify they match.

---

## STEP 4 — Store listing tab (~15 min) — COPY-PASTE READY

### Product details

| Field | Value |
|---|---|
| **Name** | Job Search Lens |
| **Summary** (short, 132 char) | Highlight your saved keywords on every job site. Plus LinkedIn extras: card dimming and inline company stats. Local-only. |
| **Category** | Productivity |
| **Language** | English |

### Detailed description (paste verbatim)

```
Job Search Lens makes every job page easier to scan — without sending a single byte to a server.

Save the keywords that matter to you (technologies, roles, locations, companies) and the extension marks them inline on every page you open: LinkedIn, Indeed, Glassdoor, Seek, AngelList, Wellfound, company career pages, anywhere.

When you visit LinkedIn Jobs, you also get:

• Card dimming for listings LinkedIn already labels as Viewed, Saved, or Applied — toggleable per state.
• Inline company size and follower count next to job titles, so you can judge company fit without opening a new tab.

Everything stays local in your browser. No backend, no telemetry, no account system, no remote code. Inspect every line of source on GitHub.

KEY FEATURES
• Keyword highlights on any website
• Right-click context menu to save selected text as a keyword
• Per-keyword color palette
• Sort, search, and export controls for the keyword library
• Match navigation with previous/next controls
• Inline company size and LinkedIn follower count next to job titles (LinkedIn Jobs)
• Independent dim toggles for Viewed, Saved, and Applied (LinkedIn Jobs)
• Auto, Light, and Dark popup themes

PRIVACY
• No telemetry, analytics, or tracking pixels
• No accounts, no sign-in, no cloud sync
• No remote code execution
• Every file that ships in the extension package is inspectable via chrome://extensions
```

### Assets (upload order)

| Slot | File | Notes |
|---|---|---|
| Store icon (128×128) | `assets/icons/icon128.png` | Auto-filled from manifest |
| **Screenshot 1** (1280×800) | `assets/store/store-preview-1280x800.png` | The 4-panel feature overview — strongest first impression |
| **Screenshot 2** (1280×800) | `assets/store/popup-screenshot-1280x800.png` | Real popup UI composite — proves it's not just renders |
| **Small promo tile** (440×280) | `assets/store/small-promo-440x280.png` | |
| **Marquee promo** (1400×560) | `assets/store/marquee-1400x560.png` | Recommended even though optional — gets you into Featured rotation |

### URLs

| Field | Value |
|---|---|
| Homepage URL | `https://madhushanandawaththa.github.io/Job_Search/` |
| Support URL | `https://madhushanandawaththa.github.io/Job_Search/support.html` |

---

## STEP 5 — Privacy practices tab (~5 min) — COPY-PASTE READY

### Single purpose

```
Job Search Lens highlights saved keywords on any website you browse and adds LinkedIn Jobs-specific tools for dimming processed job cards and showing inline company stats.
```

### Permission justifications

| Permission | Justification (paste exactly) |
|---|---|
| `contextMenus` | Adds a right-click "Add to Highlighter" menu item so users can save selected text from any page as a highlight keyword without opening the popup. |
| `storage` | Stores the user's saved keywords, color choices, theme preference, and dim-state toggles locally in chrome.storage.local. Nothing is transmitted off the device. |
| `activeTab` | When the user opens the popup, the popup queries the active tab to display status (job-list / job-detail surfaces detected, match count) and to send navigate-match commands. Permission is only granted while the popup is open via user gesture. |
| `host_permissions` (`http://*/*` and `https://*/*`) | The content script needs to read text on every page the user opens to find matches for their saved keywords. LinkedIn-specific features (card dimming, company stats) are gated inside the content script and only activate on linkedin.com/jobs URLs. |

### Remote code

Select **"No, I am not using remote code"**. The extension only loads JavaScript files bundled in the package; no `eval`, no `import()` from network, no remote-loaded scripts.

### Data usage

Check **"No user data is collected"**. (The extension's stored data — keywords and settings — lives in `chrome.storage.local` and never leaves the device; under Chrome Web Store policy that counts as "not collected".)

### Privacy policy URL

```
https://madhushanandawaththa.github.io/Job_Search/privacy-policy.html
```

Tick the certification checkbox confirming the policies above match the code.

---

## STEP 6 — Distribution tab (~2 min)

| Field | Value |
|---|---|
| Visibility | **Public** |
| Regions | All regions (or restrict if you prefer) |
| Pricing | Free |

> Optional: choose **Deferred publishing** the first time so the listing stays unlisted until you click "publish" after review completes — gives you one last chance to spot errors before it goes live.

---

## STEP 7 — Submit for review

1. Click **Save draft** on every tab and confirm the dev console shows no red banner errors.
2. Hit **Submit for review** in the top right.
3. Google's review typically takes:
   - **First-time publishers / new items: 1–7 days** (sometimes longer if they ask questions).
   - Updates to existing items: usually < 24 h.
4. You'll get an email with the verdict.

### If they reject the submission

Common reasons + fixes:

| Reason | Fix |
|---|---|
| Insufficient permission justification | Paste the exact text from STEP 5 — Google reviewers actively check this. |
| Privacy policy URL not reachable | Confirm GitHub Pages is enabled and the URL returns 200 in incognito. |
| Description doesn't match functionality | Don't promise features that aren't in the code. The description above only claims what 1.3.0 actually does. |
| Single-purpose unclear | The single-purpose text in STEP 5 is intentionally narrow. Don't broaden it. |

Reply to the review email with the change. Resubmissions usually go through within 24 h.

---

## STEP 8 — Day-1 launch (after Google approves)

1. Get the public Web Store URL (looks like `https://chrome.google.com/webstore/detail/<extension-id>`).
2. Update README with a "Install from Chrome Web Store" button:
   ```markdown
   <p align="center">
     <a href="https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID">
       <img src="https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" />
     </a>
   </p>
   ```
3. Update the **homepage URL** in `manifest.json` to point at the Web Store listing instead of GitHub Pages. (Optional but improves discoverability.)
4. Update `docs/index.html` CTA buttons to point at the Web Store listing.
5. Tag the release on GitHub:
   ```bash
   git tag -a v1.3.0 -m "First Chrome Web Store release"
   git push origin v1.3.0
   ```
   Then create a GitHub Release pointing at the tag.

---

## STEP 9 — Soft launch (where to share, what to expect)

Low-pressure places where your audience actually hangs out:

- **r/ChromeExtensions** — free extensions land well there (you're free, no signup).
- **r/cscareerquestions** and **r/jobs** — share as "I made this, free, no signup" not "buy my thing".
- **Hacker News Show HN** — only post if you can be online to answer for the first 90 minutes.
- **Indie Hackers** — Friday product launch thread.
- **Twitter/X with a 20-sec demo gif** — much higher reach than a screenshot. Capture using `assets/store/popup-screenshot-1280x800.png` as the still + a real screencast.

What to expect realistically:
- **Day 1:** 20–80 installs if you posted in 2–3 places.
- **Week 1:** 100–500 installs if shared widely. Maybe a few stars.
- **Month 1:** organic search starts kicking in. A LinkedIn-related extension can plateau at 1–10K active users without paid promo.

---

## STEP 10 — Maintenance cadence

The riskiest thing about a LinkedIn-adjacent extension is that LinkedIn changes its DOM. To stay alive:

1. **Set up a weekly issue triage** (15 min). Watch GitHub issues + Web Store reviews.
2. **Re-run `npm test` before every push**. The DOM-heuristics tests catch most LinkedIn shape changes.
3. **Bump the version** in `manifest.json` AND `package.json` AND the badge in `README.md` on every release. The Web Store rejects re-uploads with the same version number.
4. **Regenerate marketing assets** whenever feature copy changes:
   ```bash
   python3 -m http.server 8765 &
   /opt/plugins-venv/bin/python tools/render-store-assets.py
   /opt/plugins-venv/bin/python tools/render-launch-assets.py
   ```
5. **Rebuild the zip** on every release:
   ```bash
   cd /app && zip -r dist/job-search-lens-vX.Y.Z.zip \
     manifest.json background.js content.js dom-heuristics.js shared.js \
     popup.html popup.js theme-init.js styles.css assets/icons LICENSE
   ```

---

## Quick reference — files to upload during STEP 3-4

```
dist/job-search-lens-v1.3.0.zip                    ← STEP 3, the extension itself
assets/store/store-preview-1280x800.png            ← STEP 4, screenshot 1
assets/store/popup-screenshot-1280x800.png         ← STEP 4, screenshot 2
assets/store/small-promo-440x280.png               ← STEP 4, small promo
assets/store/marquee-1400x560.png                  ← STEP 4, marquee
```

Everything else (icons, OG image) is already wired in.

Good luck. Ping me after Google's verdict if you want help with the day-1 launch comms.
