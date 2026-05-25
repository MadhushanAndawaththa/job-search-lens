# Go-Live Runbook — Job Search Lens v1.3.0

Step-by-step guide to ship the extension to the Chrome Web Store. The dev side is done; this file lists only the steps that require your account or identity.

Estimated end-to-end time: **30–60 min hands-on**, plus **1–7 days waiting for Google's review**.

---

## ✅ Pre-flight (already done for you)

- [x] Code reviewed, lint clean, 30/30 tests passing.
- [x] No `console.log`, no `debugger`, no `TODO`s left in shipped code.
- [x] Manifest V3 with minimal permissions (`contextMenus`, `storage`, `activeTab`, `permissions`, `scripting`, LinkedIn host access, plus optional all-site access).
- [x] Production `.zip` built at `dist/job-search-lens-v1.3.0.zip` (~40 KB, 15 files, no dev assets).
- [x] Popup now has a footer with `Website · Help · Privacy · v1.3` links pointing at the product site.
- [x] Five Web Store images generated at exact dimensions in `docs/assets/store/`:
  - `small-promo-440x280.png`
  - `marquee-1400x560.png`
  - `store-preview-1280x800.png` (4-panel feature overview, LinkedIn-first)
  - `popup-screenshot-1280x800.png` (real popup UI composite)
  - `og-image-1200x630.png` (social shares)
- [x] LinkedIn-first messaging applied across all copy.
- [x] All public URLs updated to the new public repo / Pages site.

---

## REPO STRATEGY

You have two repos:

| Repo | Visibility | Contents | Purpose |
|---|---|---|---|
| `Job_Search` (current) | **Private** | The actual extension source — manifest, popup, content scripts, tests, dist zips | Code stays private |
| `jslens` (new) | **Public** | Just the product website (`docs/` folder contents) + an issues tracker | Required because Chrome Web Store needs a publicly reachable privacy policy URL, and users need somewhere to file bugs |

---

## STEP 1 — Push the source repo and prepare the public website repo (~10 min)

### 1a. Push the (private) source repo

```bash
# Make sure your current repo is private in GitHub settings first.
git add -A
git commit -m "v1.3.0: LinkedIn-first branding, popup footer, repo split"
git push origin main
```

### 1b. Create the public website repo

1. Create a **new public repo** on GitHub: `MadhushanAndawaththa/jslens`.
2. Locally, copy the **contents of `docs/`** (everything inside it, including the `assets/` and `marketing/` subfolders) to the root of the new repo:
   ```bash
   # From a fresh clone of jslens:
   cp -r /path/to/Job_Search/docs/* .
   git add -A
   git commit -m "Initial product website"
   git push origin main
   ```
   Result — the new repo's root should contain:
   ```
   index.html
   privacy-policy.html
   support.html
   style.css
   go-live.md          (optional — useful for you, irrelevant to visitors)
   chrome-web-store-submission.txt   (optional)
   marketing/          (HTML sources for image regeneration)
   assets/
     icons/
     store/
   ```

### 1c. Enable GitHub Pages on the public repo

1. In the new repo: **Settings → Pages**.
2. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`.
3. Save and wait ~2 minutes.
4. Verify these URLs return 200 in a fresh tab:
   - `https://madhushanandawaththa.github.io/jslens/`
   - `https://madhushanandawaththa.github.io/jslens/privacy-policy.html`
   - `https://madhushanandawaththa.github.io/jslens/support.html`

If they 404, fix this before moving on — Step 5 needs the privacy URL to be live.

---

## STEP 2 — Chrome Web Store developer account (~10 min, **one-time $5 fee**)

1. Open <https://chrome.google.com/webstore/devconsole>.
2. Sign in with the Google account you want listed as developer.
3. Accept the developer agreement.
4. Pay the **$5 one-time** registration fee.
5. Complete identity verification if Google prompts for it.

> Tip: use a Google account you actually plan to maintain. The displayed publisher name is hard to change later.

---

## STEP 3 — Upload the extension (~5 min)

1. From the dev console, click **+ New item**.
2. Drag `dist/job-search-lens-v1.3.0.zip` (from the private source repo). Wait for it to parse.
3. The console auto-fills name, version, description, icons from the manifest. Verify they match.

---

## STEP 4 — Store listing tab (~15 min) — COPY-PASTE READY

### Product details

| Field | Value |
|---|---|
| **Name** | Job Search Lens |
| **Summary** (short, 132 char) | Built for LinkedIn Jobs: dim viewed/saved/applied cards, see company size inline, optionally highlight saved keywords elsewhere. |
| **Category** | Productivity |
| **Language** | English |

### Detailed description (paste verbatim)

```
Job Search Lens is built for LinkedIn Jobs.

LinkedIn already knows which jobs you've Viewed, Saved, or Applied to — it just refuses to let you hide them. Job Search Lens fades those cards automatically, with independent toggles per state. It also shows company size and LinkedIn employee count inline next to each job title, so you can judge company fit before you ever open the listing.

The keyword highlighter is the bonus: save the terms that matter to you (technologies, roles, locations, companies) and they light up on LinkedIn. If you turn on optional all-site access in the popup, they also work on Indeed, Glassdoor, Seek, Wellfound, company career pages, and any other website you browse.

Everything stays local in your browser. No backend, no telemetry, no account system, no remote code. Every file that ships in the extension package is inspectable via chrome://extensions.

KEY FEATURES
• LinkedIn Jobs card dimming for Viewed, Saved, and Applied — toggleable per state
• Inline company size and LinkedIn employee count next to job titles on LinkedIn Jobs
• Keyword highlights on LinkedIn by default, with optional all-site access from the popup
• Right-click context menu to save selected text as a keyword
• Per-keyword color palette
• Sort, search, and export controls for the keyword library
• Match navigation with previous/next controls
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
| Store icon (128×128) | `docs/assets/icons/icon128.png` | Auto-filled from manifest |
| **Screenshot 1** (1280×800) | `docs/assets/store/store-preview-1280x800.png` | The 4-panel LinkedIn-first feature overview |
| **Screenshot 2** (1280×800) | `docs/assets/store/popup-screenshot-1280x800.png` | Real popup UI composite |
| **Small promo tile** (440×280) | `docs/assets/store/small-promo-440x280.png` | |
| **Marquee promo** (1400×560) | `docs/assets/store/marquee-1400x560.png` | Recommended even though optional |

### URLs

| Field | Value |
|---|---|
| Homepage URL | `https://madhushanandawaththa.github.io/jslens/` |
| Support URL | `https://madhushanandawaththa.github.io/jslens/support.html` |

---

## STEP 5 — Privacy practices tab (~5 min) — COPY-PASTE READY

### Single purpose

```
Job Search Lens is built for LinkedIn Jobs. On linkedin.com/jobs it dims listings already labeled Viewed, Saved, or Applied, and shows inline company size and employee counts. Its keyword highlighter works on LinkedIn by default and can be enabled on other websites from the popup.
```

### Permission justifications

| Permission | Justification (paste exactly) |
|---|---|
| `contextMenus` | Adds a right-click "Add to Highlighter" menu item so users can save selected text from any page as a highlight keyword without opening the popup. |
| `storage` | Stores the user's saved keywords, color choices, theme preference, dim-state toggles, and all-site-highlighting preference locally in chrome.storage.local. Nothing is transmitted off the device. |
| `activeTab` | When the user opens the popup, the popup queries the active tab to display status (job-list / job-detail surfaces detected, match count) and to send navigate-match commands. Permission is only granted while the popup is open via user gesture. |
| `permissions` | Lets the popup request or remove optional all-site access when the user turns `Highlight on all websites` on or off. |
| `scripting` | Registers and injects the optional non-LinkedIn page helper after the user enables all-site highlighting, so highlights start working on future pages automatically. |
| `host_permissions` (`https://www.linkedin.com/*`) | Required so LinkedIn Jobs dimming, company stats, and keyword highlighting work automatically on LinkedIn. |
| `optional_host_permissions` (`http://*/*` and `https://*/*`) | Only requested if the user turns on `Highlight on all websites` in the popup. Used so keyword highlights can run automatically on non-LinkedIn pages. |

### Remote code

Select **"No, I am not using remote code"**.

### Data usage

Check **"No user data is collected"**.

### Privacy policy URL

```
https://madhushanandawaththa.github.io/jslens/privacy-policy.html
```

Tick the certification checkbox.

---

## STEP 6 — Distribution tab (~2 min)

| Field | Value |
|---|---|
| Visibility | **Public** |
| Regions | All regions |
| Pricing | Free |

> Optional: choose **Deferred publishing** the first time so the listing stays unlisted until you click "publish" after review completes.

---

## STEP 7 — Submit for review

1. Save draft on every tab.
2. Hit **Submit for review** in the top right.
3. Review timeline: **1–7 days for new items**; subsequent updates usually under 24 h.
4. You'll get an email with the verdict.

---

## STEP 8 — Day-1 (after Google approves)

1. Copy the public Web Store URL (`https://chrome.google.com/webstore/detail/<extension-id>`).
2. In the **public website repo (`jslens`)**, search-and-replace the placeholder Web Store URL (`https://chrome.google.com/webstore/category/extensions`) with the real listing URL across:
   - `index.html` (two CTA buttons)
3. Commit + push — your "Get the extension" CTAs now go straight to the live listing.
4. Tag the release on the **source repo**:
   ```bash
   git tag -a v1.3.0 -m "First Chrome Web Store release"
   git push origin v1.3.0
   ```

---

## STEP 9 — Soft launch

Low-pressure places:

- **r/ChromeExtensions** — free extensions land well there.
- **r/cscareerquestions** + **r/jobs** — frame as "I made this, free, no signup".
- **Hacker News Show HN** — only post if you can be online for the first 90 min.
- **LinkedIn post** — your audience IS on LinkedIn — this is your best channel. Be honest: "I built a Chrome extension to fix the Viewed/Saved/Applied filter LinkedIn refuses to ship".
- **Twitter/X** with a 20-sec demo gif.

---

## STEP 10 — Maintenance

1. Watch GitHub issues on the **public** repo weekly.
2. Re-run `npm test` before every release in the **source** repo.
3. Bump version in `manifest.json` AND `package.json` AND the README badge on every release.
4. Regenerate marketing assets when copy changes:
   ```bash
   python3 -m http.server 8765 &
   /opt/plugins-venv/bin/python tools/render-store-assets.py
   /opt/plugins-venv/bin/python tools/render-launch-assets.py
   ```
5. Rebuild the zip:
   ```bash
   npm run build:zip
   ```
6. Copy any changes from the source repo's `docs/` folder to the public website repo's root.

---

## Quick reference — files to upload during STEPs 3–4

```
dist/job-search-lens-v1.3.0.zip                          ← STEP 3 (extension package)
docs/assets/store/store-preview-1280x800.png             ← STEP 4 screenshot 1
docs/assets/store/popup-screenshot-1280x800.png          ← STEP 4 screenshot 2
docs/assets/store/small-promo-440x280.png                ← STEP 4 small promo
docs/assets/store/marquee-1400x560.png                   ← STEP 4 marquee
```

Good luck. Ping me after Google's verdict if you want help with the day-1 launch comms.
