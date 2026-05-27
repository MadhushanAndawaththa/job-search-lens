// The popup is the only interactive UI surface. LinkedIn itself only receives
// passive styling changes and user-driven click tracking.
const {
  STORAGE_KEYS,
  OPTIONAL_SITE_ACCESS_PATTERNS,
  coerceKeywords,
  splitKeywordTerms,
  sanitizeColor,
  upsertKeyword,
  removeKeywordById,
  updateKeywordColor,
  toggleKeywordEnabled,
  hydrateSettings,
} = globalThis.JobHuntVisualizerShared;

// Curated highlight palette — pastels light enough to keep text readable.
const PALETTE = ['#FFE082', '#FFCC80', '#EF9A9A', '#F48FB1', '#CE93D8', '#9FA8DA', '#90CAF9', '#80DEEA', '#A5D6A7', '#E6EE9C'];
const THEME_STORAGE_KEY = 'jhv-theme';

const keywordForm = document.getElementById('keywordForm');
const keywordInput = document.getElementById('keywordInput');
const formColorPalette = document.getElementById('formColorPalette');
const pauseToggle = document.getElementById('pauseToggle');
const keywordList = document.getElementById('keywordList');
const keywordEmpty = document.getElementById('keywordEmpty');
const keywordCount = document.getElementById('keywordCount');
const stateCountSummary = document.getElementById('stateCountSummary');
const pageStatus = document.getElementById('pageStatus');
const prevMatchButton = document.getElementById('prevMatch');
const nextMatchButton = document.getElementById('nextMatch');
const matchStatus = document.getElementById('matchStatus');
const highlightAllSitesToggle = document.getElementById('highlightAllSitesToggle');
const siteAccessHint = document.getElementById('siteAccessHint');
const dimViewedToggle = document.getElementById('dimViewedToggle');
const dimSavedToggle = document.getElementById('dimSavedToggle');
const dimAppliedToggle = document.getElementById('dimAppliedToggle');
const keywordSearchInput = document.getElementById('keywordSearchInput');
const keywordLibraryMeta = document.getElementById('keywordLibraryMeta');
const sortKeywordsButton = document.getElementById('sortKeywords');
const exportKeywordsButton = document.getElementById('exportKeywords');
const themeToggle = document.getElementById('themeToggle');
const PAGE_STATUS_REFRESH_MS = 1500;
const EXPORT_FEEDBACK_MS = 1500;

let statusRefreshTimer = null;
let statusRefreshInFlight = false;
let keywordSearchQuery = '';
let keywordSortMode = 'default';
let selectedColor = PALETTE[0];
let cachedKeywords = [];
let lastPageStatusTitle = '';
let lastPageStatusMessage = '';
let lastPageStatusTone = '';
let siteAccessToggleInFlight = false;
let exportOriginalLabel = '';
let exportResetTimer = null;

// ── Theme management ─────────────────────────────────────────────────────────────────────────────
// localStorage is the single source of truth for theme: theme-init.js needs
// synchronous access to apply the dark class before first paint (chrome.storage
// is async and would cause a flash of the wrong theme). chrome.storage.local
// is never used for theme so the two systems cannot drift.
const THEMES = ['auto', 'light', 'dark'];

function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(theme) {
  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const html = document.documentElement;
  html.classList.toggle('dark', isDark);
  // data-theme drives the CSS ::before icon — no textContent change, no reflow.
  html.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / storage disabled — popup still renders correctly,
    // we just lose the persisted preference for next time.
  }
}

function initTheme() {
  applyTheme(readTheme());

  // Re-apply when the OS switches dark/light while the popup is open.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme(readTheme());
  });

  // Cycle: auto → light → dark → auto on click.
  themeToggle?.addEventListener('click', () => {
    const current = readTheme();
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    applyTheme(next);
  });
}

void initializePopup();

// Render first, then wire events so the popup always reflects the latest local
// storage state even if the extension worker was restarted.
async function initializePopup() {
  initTheme();
  renderFormPalette();
  await render();

  keywordForm.addEventListener('submit', handleAddKeyword);
  keywordInput.addEventListener('keydown', handleKeywordInputKeydown);
  keywordSearchInput.addEventListener('input', handleKeywordSearchInput);
  keywordList.addEventListener('click', handleListClick);
  formColorPalette.addEventListener('click', handleFormPaletteClick);
  sortKeywordsButton.addEventListener('click', handleSortToggle);
  exportKeywordsButton.addEventListener('click', handleExportKeywords);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);
  pauseToggle.addEventListener('change', updatePauseState);
  highlightAllSitesToggle.addEventListener('change', handleHighlightAllSitesToggleChange);
  dimViewedToggle.addEventListener('change', () => {
    void updateDimState('viewed', dimViewedToggle.checked);
  });
  dimSavedToggle.addEventListener('change', () => {
    void updateDimState('saved', dimSavedToggle.checked);
  });
  dimAppliedToggle.addEventListener('change', () => {
    void updateDimState('applied', dimAppliedToggle.checked);
  });
  prevMatchButton.addEventListener('click', () => {
    void navigateMatch(-1);
  });
  nextMatchButton.addEventListener('click', () => {
    void navigateMatch(1);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (changes[STORAGE_KEYS.keywords] || changes[STORAGE_KEYS.settings]) {
      void render();
    }
  });

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', stopStatusRefreshLoop, { once: true });
  startStatusRefreshLoop();
}

async function render() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.keywords,
    STORAGE_KEYS.settings,
  ]);

  const keywords = coerceKeywords(stored[STORAGE_KEYS.keywords]);
  const settings = hydrateSettings(stored[STORAGE_KEYS.settings]);

  cachedKeywords = keywords;
  pauseToggle.checked = Boolean(settings.paused);
  dimViewedToggle.checked = Boolean(settings.dimStates.viewed);
  dimSavedToggle.checked = Boolean(settings.dimStates.saved);
  dimAppliedToggle.checked = Boolean(settings.dimStates.applied);
  keywordCount.textContent = `${keywords.length} highlight${keywords.length === 1 ? '' : 's'}`;
  renderKeywordLibrary(keywords);

  const highlightAllSitesEnabled = await renderHighlightAllSitesState(settings);
  await renderPageStatus(highlightAllSitesEnabled);
}

async function renderHighlightAllSitesState(settings) {
  const hasOptionalSiteAccess = await chrome.permissions.contains({
    origins: OPTIONAL_SITE_ACCESS_PATTERNS,
  });
  const highlightAllSitesEnabled = Boolean(settings.highlightAllSites && hasOptionalSiteAccess);

  highlightAllSitesToggle.checked = highlightAllSitesEnabled;
  highlightAllSitesToggle.disabled = siteAccessToggleInFlight;
  siteAccessHint.textContent = highlightAllSitesEnabled
    ? 'On. Saved keywords also highlight automatically on non-LinkedIn sites. All processing stays local in your browser.'
    : 'Off. LinkedIn works automatically. Turn this on only if you want saved keywords highlighted on other sites too.';

  return highlightAllSitesEnabled;
}

async function handleHighlightAllSitesToggleChange() {
  if (siteAccessToggleInFlight) {
    return;
  }

  const nextEnabled = highlightAllSitesToggle.checked;
  siteAccessToggleInFlight = true;

  try {
    if (nextEnabled) {
      const granted = await chrome.permissions.request({
        origins: OPTIONAL_SITE_ACCESS_PATTERNS,
      });

      if (!granted) {
        await setHighlightAllSitesEnabled(false);
        return;
      }

      await setHighlightAllSitesEnabled(true);
    } else {
      await chrome.permissions.remove({
        origins: OPTIONAL_SITE_ACCESS_PATTERNS,
      });
      await setHighlightAllSitesEnabled(false);
    }

    const activeTab = nextEnabled ? await getActiveContentTab() : null;

    await chrome.runtime.sendMessage({
      type: 'job-hunt-visualizer:sync-site-access',
      tabId: activeTab?.id ?? null,
      url: activeTab?.url || '',
    });
  } finally {
    siteAccessToggleInFlight = false;
    await render();
  }
}

async function setHighlightAllSitesEnabled(enabled) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings]);
  const settings = hydrateSettings(stored[STORAGE_KEYS.settings]);

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: {
      ...settings,
      highlightAllSites: Boolean(enabled),
    },
  });
}

async function handleAddKeyword(event) {
  event.preventDefault();

  // Manual entry complements the context menu so users can seed highlight terms
  // without waiting to select text on LinkedIn first.
  const terms = splitKeywordTerms(keywordInput.value);
  const color = sanitizeColor(selectedColor);

  if (terms.length === 0) {
    keywordInput.focus();
    return;
  }

  const stored = await chrome.storage.local.get([STORAGE_KEYS.keywords]);
  let keywords = coerceKeywords(stored[STORAGE_KEYS.keywords]);
  let addedCount = 0;

  for (const term of terms) {
    const result = upsertKeyword(keywords, term, color);
    keywords = result.keywords;
    addedCount += result.added ? 1 : 0;
  }

  if (addedCount === 0) {
    keywordInput.select();
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.keywords]: keywords,
  });

  keywordInput.value = '';
  keywordInput.focus();
}

function handleKeywordInputKeydown(event) {
  if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) {
    return;
  }

  event.preventDefault();
  keywordForm.requestSubmit();
}

function handleKeywordSearchInput(event) {
  keywordSearchQuery = event.target.value.trim().toLocaleLowerCase();
  renderKeywordLibrary(cachedKeywords);
}

async function handleListClick(event) {
  // Toggle color popover
  const toggleBtn = event.target.closest('button[data-action="toggle-color-popover"]');

  if (toggleBtn) {
    event.stopPropagation();
    const wrap = toggleBtn.closest('.swatch-edit-wrap');
    const popover = wrap?.querySelector('.color-popover');

    if (!popover) {
      return;
    }

    const isOpen = popover.classList.contains('open');
    closeAllColorPopovers();

    if (!isOpen) {
      popover.classList.add('open');
      // Focus the first swatch so keyboard users can navigate immediately.
      popover.querySelector('.palette-swatch')?.focus();
    }

    return;
  }

  // Select a color from a keyword's inline popover
  const swatchBtn = event.target.closest('button[data-action="select-keyword-color"]');

  if (swatchBtn) {
    event.stopPropagation();
    const keywordId = swatchBtn.getAttribute('data-keyword-id');
    const color = swatchBtn.getAttribute('data-color');

    if (!keywordId || !color) {
      return;
    }

    const wrap = swatchBtn.closest('.swatch-edit-wrap');
    wrap?.querySelectorAll('.palette-swatch').forEach((s) => s.classList.remove('selected'));
    swatchBtn.classList.add('selected');

    const editBtn = wrap?.querySelector('.swatch-edit-btn');

    if (editBtn) {
      editBtn.style.backgroundColor = color;
      editBtn.focus();
    }

    wrap?.querySelector('.color-popover')?.classList.remove('open');
    void handleKeywordColorChange(keywordId, color);
    return;
  }

  // Toggle keyword enabled/disabled
  const kwToggleBtn = event.target.closest('button[data-action="toggle-keyword"]');

  if (kwToggleBtn) {
    const keywordId = kwToggleBtn.getAttribute('data-keyword-id');

    if (!keywordId) {
      return;
    }

    const stored = await chrome.storage.local.get([STORAGE_KEYS.keywords]);
    const keywords = toggleKeywordEnabled(stored[STORAGE_KEYS.keywords], keywordId);

    await chrome.storage.local.set({
      [STORAGE_KEYS.keywords]: keywords,
    });

    return;
  }

  // Remove keyword
  const removeBtn = event.target.closest('button[data-action="remove-keyword"]');

  if (!removeBtn) {
    return;
  }

  const keywordId = removeBtn.getAttribute('data-keyword-id');

  if (!keywordId) {
    return;
  }

  const stored = await chrome.storage.local.get([STORAGE_KEYS.keywords]);
  const keywords = removeKeywordById(stored[STORAGE_KEYS.keywords], keywordId);

  await chrome.storage.local.set({
    [STORAGE_KEYS.keywords]: keywords,
  });
}

async function updatePauseState() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings]);
  const settings = hydrateSettings({
    ...stored[STORAGE_KEYS.settings],
    paused: pauseToggle.checked,
  });

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
  });
}

async function updateDimState(state, enabled) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings]);
  const nextSettings = hydrateSettings({
    ...stored[STORAGE_KEYS.settings],
    dimStates: {
      ...stored[STORAGE_KEYS.settings]?.dimStates,
      [state]: enabled,
    },
  });

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: nextSettings,
  });
}

function createKeywordRow(keyword) {
  const item = document.createElement('li');

  if (keyword.enabled === false) {
    item.className = 'kw-row-disabled';
  }

  const pill = document.createElement('div');
  pill.className = 'pill';

  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.backgroundColor = keyword.color;

  const term = document.createElement('span');
  term.className = 'term';
  term.textContent = keyword.term;

  // Inline color picker — swatch button + floating palette popover
  const wrap = document.createElement('div');
  wrap.className = 'swatch-edit-wrap';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'swatch-edit-btn';
  editBtn.style.backgroundColor = keyword.color;
  editBtn.setAttribute('data-action', 'toggle-color-popover');
  editBtn.setAttribute('data-keyword-id', keyword.id);
  editBtn.setAttribute('aria-label', `Change color for ${keyword.term}`);
  editBtn.setAttribute('aria-haspopup', 'true');
  editBtn.setAttribute('aria-expanded', 'false');
  editBtn.setAttribute('title', 'Change color');

  const popover = document.createElement('div');
  popover.className = 'color-popover';
  popover.setAttribute('role', 'group');
  popover.setAttribute('aria-label', `Pick a highlight color for ${keyword.term}`);

  for (const hex of PALETTE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-swatch';

    if (hex.toLowerCase() === keyword.color.toLowerCase()) {
      btn.classList.add('selected');
    }

    btn.style.backgroundColor = hex;
    btn.setAttribute('data-action', 'select-keyword-color');
    btn.setAttribute('data-keyword-id', keyword.id);
    btn.setAttribute('data-color', hex);
    btn.setAttribute('aria-label', `Use color ${hex}`);
    popover.append(btn);
  }

  wrap.append(editBtn, popover);

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'btn-toggle-kw';
  toggleButton.textContent = keyword.enabled === false ? 'Enable' : 'Disable';
  toggleButton.setAttribute('data-action', 'toggle-keyword');
  toggleButton.setAttribute('data-keyword-id', keyword.id);
  toggleButton.setAttribute(
    'aria-label',
    keyword.enabled === false
      ? `Enable keyword ${keyword.term}`
      : `Disable keyword ${keyword.term}`,
  );

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn-remove';
  removeButton.textContent = 'Remove';
  removeButton.setAttribute('data-action', 'remove-keyword');
  removeButton.setAttribute('data-keyword-id', keyword.id);
  removeButton.setAttribute('aria-label', `Remove keyword ${keyword.term}`);

  pill.append(swatch, term);
  item.append(pill, wrap, toggleButton, removeButton);

  return item;
}

function renderFormPalette() {
  formColorPalette.replaceChildren();

  for (const hex of PALETTE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'form-swatch';
    btn.style.backgroundColor = hex;
    btn.setAttribute('aria-pressed', String(hex === selectedColor));
    btn.setAttribute('aria-label', `Use color ${hex}`);
    btn.setAttribute('data-color', hex);
    btn.setAttribute('title', hex);
    formColorPalette.append(btn);
  }
}

function handleFormPaletteClick(event) {
  const btn = event.target.closest('.form-swatch[data-color]');

  if (!btn) {
    return;
  }

  const nextColor = btn.getAttribute('data-color');

  if (nextColor === selectedColor) {
    return;
  }

  selectedColor = nextColor;
  // Targeted toggle: flip aria-pressed only on the two affected swatches
  // instead of rebuilding the entire palette.
  for (const swatch of formColorPalette.querySelectorAll('.form-swatch[data-color]')) {
    swatch.setAttribute('aria-pressed', String(swatch.getAttribute('data-color') === selectedColor));
  }
}

function handleDocumentClick() {
  closeAllColorPopovers();
}

function handleDocumentKeydown(event) {
  if (event.key !== 'Escape') {
    return;
  }

  const openPopover = document.querySelector('.color-popover.open');

  if (!openPopover) {
    return;
  }

  event.stopPropagation();
  const editBtn = openPopover.closest('.swatch-edit-wrap')?.querySelector('.swatch-edit-btn');
  closeAllColorPopovers();
  editBtn?.focus();
}

function closeAllColorPopovers() {
  document.querySelectorAll('.color-popover.open').forEach((popover) => {
    popover.classList.remove('open');
    const editBtn = popover.closest('.swatch-edit-wrap')?.querySelector('.swatch-edit-btn');
    editBtn?.setAttribute('aria-expanded', 'false');
  });
}

async function handleKeywordColorChange(keywordId, color) {
  const sanitized = sanitizeColor(color);

  if (!sanitized) {
    return;
  }

  const stored = await chrome.storage.local.get([STORAGE_KEYS.keywords]);
  const keywords = updateKeywordColor(stored[STORAGE_KEYS.keywords], keywordId, sanitized);

  await chrome.storage.local.set({
    [STORAGE_KEYS.keywords]: keywords,
  });
}

async function handleExportKeywords() {
  if (cachedKeywords.length === 0) {
    return;
  }

  const text = cachedKeywords.map((k) => k.term).join('\n');

  try {
    await navigator.clipboard.writeText(text);

    // Cache the original label exactly once so rapid re-clicks cannot snapshot
    // "Copied!" as the new "original" and freeze the label forever.
    if (!exportResetTimer) {
      exportOriginalLabel = exportKeywordsButton.textContent;
    } else {
      window.clearTimeout(exportResetTimer);
    }

    exportKeywordsButton.textContent = 'Copied!';
    exportResetTimer = window.setTimeout(() => {
      exportKeywordsButton.textContent = exportOriginalLabel;
      exportResetTimer = null;
    }, EXPORT_FEEDBACK_MS);
  } catch {
    // Clipboard write failed silently — unlikely in an extension popup context.
  }
}

function handleSortToggle() {
  keywordSortMode = keywordSortMode === 'az' ? 'default' : 'az';
  sortKeywordsButton.setAttribute('aria-pressed', String(keywordSortMode === 'az'));
  renderKeywordLibrary(cachedKeywords);
}

function renderKeywordLibrary(keywords) {
  let filteredKeywords = keywordSearchQuery
    ? keywords.filter((keyword) => keyword.normalized.includes(keywordSearchQuery))
    : keywords;

  if (keywordSortMode === 'az') {
    filteredKeywords = [...filteredKeywords].sort((a, b) =>
      a.normalized.localeCompare(b.normalized),
    );
  }

  keywordLibraryMeta.textContent = keywordSearchQuery
    ? `${filteredKeywords.length} of ${keywords.length} shown`
    : `${keywords.length} saved`;

  keywordList.replaceChildren();

  for (const keyword of filteredKeywords) {
    keywordList.append(createKeywordRow(keyword));
  }

  keywordEmpty.hidden = filteredKeywords.length !== 0;

  if (filteredKeywords.length !== 0) {
    return;
  }

  keywordEmpty.textContent = keywordSearchQuery
    ? `No keywords match "${keywordSearchInput.value.trim()}".`
    : 'No keywords yet. Add one above or right-click text on a page.';
}

function updateMatchStatus(matchCount, activeMatchIndex) {
  if (!matchCount) {
    matchStatus.textContent = '0 / 0 matches';
    prevMatchButton.disabled = true;
    nextMatchButton.disabled = true;
    return;
  }

  const current = activeMatchIndex >= 0 ? activeMatchIndex + 1 : 1;
  matchStatus.textContent = `${current} / ${matchCount} matches`;
  prevMatchButton.disabled = false;
  nextMatchButton.disabled = false;
}

function updateStateSummary(stateCounts = {}) {
  const viewed = Number.isFinite(stateCounts.viewed) ? stateCounts.viewed : 0;
  const saved = Number.isFinite(stateCounts.saved) ? stateCounts.saved : 0;
  const applied = Number.isFinite(stateCounts.applied) ? stateCounts.applied : 0;

  stateCountSummary.textContent = `${viewed} viewed · ${saved} saved · ${applied} applied`;
}

async function getActiveContentTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab?.id) {
    return null;
  }

  const url = activeTab.url || '';

  if (!/^https?:\/\//i.test(url)) {
    return null;
  }

  return activeTab;
}

async function navigateMatch(direction) {
  const activeTab = await getActiveContentTab();

  if (!activeTab?.id) {
    updateMatchStatus(0, -1);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: 'job-hunt-visualizer:navigate-match',
      direction,
    });

    if (!response?.ok) {
      return;
    }

    updateMatchStatus(response.matchCount, response.activeMatchIndex);
  } catch {
    updateMatchStatus(0, -1);
  }
}

async function renderPageStatus() {
  const activeTab = await getActiveContentTab();
  const highlightAllSitesEnabled = arguments.length > 0
    ? Boolean(arguments[0])
    : await chrome.permissions.contains({ origins: OPTIONAL_SITE_ACCESS_PATTERNS });

  if (!activeTab?.id) {
    updateStateSummary();
    updateMatchStatus(0, -1);
    setPageStatus(
      'Open a page',
      'Open any website to use highlights. Open LinkedIn Jobs for card fading and company stats.',
      'info',
    );
    return;
  }

  const activeTabIsLinkedIn = isLinkedInUrl(activeTab.url || '');

  if (!activeTabIsLinkedIn && !highlightAllSitesEnabled) {
    updateStateSummary();
    updateMatchStatus(0, -1);
    setPageStatus(
      'LinkedIn-only mode',
      'LinkedIn Jobs works automatically. Turn on "Highlight on all websites" below to highlight this page too.',
      'info',
    );
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: 'job-hunt-visualizer:ping',
    });

    if (!response?.ok) {
      updateStateSummary();
      updateMatchStatus(0, -1);
      setPageStatus(
        'Reload page',
        'The page helper did not answer yet. Reload the tab or reopen this popup.',
        'warning',
      );
      return;
    }

    const surfaces = [];

    if (response.hasListContainer) {
      surfaces.push('job list');
    }

    if (response.hasDetailContainer) {
      surfaces.push('job details');
    }

    if (response.hasFallbackRoot && surfaces.length === 0) {
      surfaces.push('general jobs page content');
    }

    const surfaceText = surfaces.length ? surfaces.join(' + ') : 'no LinkedIn job surfaces yet';

    updateStateSummary(response.stateCounts);
    updateMatchStatus(response.matchCount, response.activeMatchIndex);

    const currentMatch = response.matchCount
      ? Math.max((response.activeMatchIndex ?? -1) + 1, 1)
      : 0;
    const matchText = response.matchCount
      ? `${currentMatch} of ${response.matchCount} matches available.`
      : 'No current keyword matches on the active page.';

    if (!response.isJobsPage) {
      if (!response.keywordCount) {
        setPageStatus(
          'Ready for highlights',
          `${response.isLinkedInPage ? 'Highlights work on this LinkedIn page.' : 'Highlights work on this page.'} Add a keyword to start highlighting text here. Open LinkedIn Jobs for card fading and company stats.`,
          'info',
        );
        return;
      }

      setPageStatus(
        response.matchCount ? 'Highlights ready' : 'Ready for highlights',
        `${response.isLinkedInPage ? 'Highlights work on this LinkedIn page.' : 'Highlights work on this page.'} ${matchText} Open LinkedIn Jobs for card fading and company stats.`,
        response.matchCount ? 'success' : 'info',
      );
      return;
    }

    if (response.paused) {
      setPageStatus(
        'Paused on this tab',
        `Detected ${surfaceText}. Turn "Pause all" off to resume highlights and LinkedIn features.`,
        'warning',
      );
      return;
    }

    if (!surfaces.length) {
      setPageStatus(
        'LinkedIn Jobs is loading',
        `The extension is connected, but job containers are not ready yet on ${response.route}.`,
        'warning',
      );
      return;
    }

    if (!response.keywordCount) {
      setPageStatus(
        'Ready for highlights',
        `Detected ${surfaceText}. Add a keyword to start highlighting this page.`,
        'info',
      );
      return;
    }

    setPageStatus(
      'Ready on LinkedIn Jobs',
      `Detected ${surfaceText}. ${matchText}`,
      'success',
    );
  } catch {
    updateStateSummary();
    updateMatchStatus(0, -1);

    if (!activeTabIsLinkedIn && highlightAllSitesEnabled) {
      setPageStatus(
        'Reload this page',
        'All-site highlighting is on, but this tab has not loaded the helper yet. Reload the page once and the popup should connect.',
        'warning',
      );
      return;
    }

    setPageStatus(
      'Reload page',
      'The page helper did not answer yet. Reload the tab or reopen this popup.',
      'warning',
    );
  }
}

function isLinkedInUrl(url = '') {
  try {
    return /(^|\.)linkedin\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function setPageStatus(title, message, tone = 'info') {
  // Skip DOM writes (and resulting screen-reader announcements) when nothing
  // changed since the last 1.5s tick.
  if (
    title === lastPageStatusTitle
    && message === lastPageStatusMessage
    && tone === lastPageStatusTone
  ) {
    return;
  }

  lastPageStatusTitle = title;
  lastPageStatusMessage = message;
  lastPageStatusTone = tone;

  pageStatus.replaceChildren();
  pageStatus.dataset.tone = tone;

  const label = document.createElement('strong');
  label.textContent = title;

  const detail = document.createElement('span');
  detail.textContent = message;

  pageStatus.append(label, detail);
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    startStatusRefreshLoop();
    void refreshPopupDiagnostics();
    return;
  }

  stopStatusRefreshLoop();
}

function startStatusRefreshLoop() {
  if (statusRefreshTimer || document.visibilityState !== 'visible') {
    return;
  }

  statusRefreshTimer = window.setInterval(() => {
    void refreshPopupDiagnostics();
  }, PAGE_STATUS_REFRESH_MS);
}

function stopStatusRefreshLoop() {
  if (!statusRefreshTimer) {
    return;
  }

  window.clearInterval(statusRefreshTimer);
  statusRefreshTimer = null;
}

async function refreshPopupDiagnostics() {
  if (statusRefreshInFlight) {
    return;
  }

  statusRefreshInFlight = true;

  try {
    await renderPageStatus();
  } finally {
    statusRefreshInFlight = false;
  }
}
