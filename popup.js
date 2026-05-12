// The popup is the only interactive UI surface. LinkedIn itself only receives
// passive styling changes and user-driven click tracking.
const {
  STORAGE_KEYS,
  coerceKeywords,
  splitKeywordTerms,
  sanitizeColor,
  upsertKeyword,
  removeKeywordById,
  updateKeywordColor,
  hydrateSettings,
} = globalThis.JobHuntVisualizerShared;

// Curated highlight palette — pastels light enough to keep text readable.
const PALETTE = ['#FFE082', '#FFCC80', '#EF9A9A', '#F48FB1', '#CE93D8', '#9FA8DA', '#90CAF9', '#80DEEA', '#A5D6A7', '#E6EE9C'];

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
const dimViewedToggle = document.getElementById('dimViewedToggle');
const dimSavedToggle = document.getElementById('dimSavedToggle');
const dimAppliedToggle = document.getElementById('dimAppliedToggle');
const keywordSearchInput = document.getElementById('keywordSearchInput');
const keywordLibraryMeta = document.getElementById('keywordLibraryMeta');
const sortKeywordsButton = document.getElementById('sortKeywords');
const exportKeywordsButton = document.getElementById('exportKeywords');
const themeToggle = document.getElementById('themeToggle');
const PAGE_STATUS_REFRESH_MS = 1500;

let statusRefreshTimer = null;
let statusRefreshInFlight = false;
let keywordSearchQuery = '';
let keywordSortMode = 'default';
let selectedColor = PALETTE[0];
let cachedKeywords = [];

// ── Theme management ─────────────────────────────────────────────────────────────────────────────
const THEMES = ['auto', 'light', 'dark'];

function applyTheme(theme) {
  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const html = document.documentElement;
  html.classList.toggle('dark', isDark);
  // data-theme drives the CSS ::before icon — no textContent change, no reflow.
  html.dataset.theme = theme;
  // Cache in localStorage so theme-init.js picks it up before next paint.
  localStorage.setItem('jhv-theme', theme);
}

function initTheme() {
  // Restore stored preference and update button label.
  chrome.storage.local.get({ theme: 'auto' }, ({ theme }) => applyTheme(theme));

  // Re-apply when the OS switches dark/light while the popup is open.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    chrome.storage.local.get({ theme: 'auto' }, ({ theme }) => applyTheme(theme));
  });

  // Cycle: auto → light → dark → auto on click.
  themeToggle?.addEventListener('click', () => {
    chrome.storage.local.get({ theme: 'auto' }, ({ theme }) => {
      const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      chrome.storage.local.set({ theme: next });
      applyTheme(next);
    });
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
  pauseToggle.addEventListener('change', updatePauseState);
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

  await renderPageStatus();
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
    document.querySelectorAll('.color-popover.open').forEach((p) => p.classList.remove('open'));

    if (!isOpen) {
      popover.classList.add('open');
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
    }

    wrap?.querySelector('.color-popover')?.classList.remove('open');
    void handleKeywordColorChange(keywordId, color);
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
  editBtn.setAttribute('title', 'Change color');

  const popover = document.createElement('div');
  popover.className = 'color-popover';

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
    btn.setAttribute('aria-label', hex);
    popover.append(btn);
  }

  wrap.append(editBtn, popover);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn-remove';
  removeButton.textContent = 'Remove';
  removeButton.setAttribute('data-action', 'remove-keyword');
  removeButton.setAttribute('data-keyword-id', keyword.id);

  pill.append(swatch, term);
  item.append(pill, wrap, removeButton);

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
    btn.setAttribute('aria-label', hex);
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

  selectedColor = btn.getAttribute('data-color');
  renderFormPalette();
}

function handleDocumentClick() {
  document.querySelectorAll('.color-popover.open').forEach((p) => p.classList.remove('open'));
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
    const original = exportKeywordsButton.textContent;
    exportKeywordsButton.textContent = 'Copied!';
    setTimeout(() => {
      exportKeywordsButton.textContent = original;
    }, 1500);
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
    : 'No keywords yet. Add one above or right-click text on LinkedIn.';
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

async function getActiveLinkedInTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab?.id) {
    return null;
  }

  const url = activeTab.url || '';

  if (!/^https:\/\/www\.linkedin\.com\//i.test(url)) {
    return null;
  }

  return activeTab;
}

async function navigateMatch(direction) {
  const activeTab = await getActiveLinkedInTab();

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
  } catch (error) {
    updateMatchStatus(0, -1);
  }
}

async function renderPageStatus() {
  const activeTab = await getActiveLinkedInTab();

  if (!activeTab?.id) {
    updateStateSummary();
    updateMatchStatus(0, -1);
    setPageStatus(
      'Open LinkedIn',
      'Open a LinkedIn jobs tab to use highlights, fading, and match navigation.',
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
        'Reload LinkedIn',
        'LinkedIn is open, but the page helper did not answer yet. Reload the tab or reopen this popup.',
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

    if (!response.isJobsPage) {
      setPageStatus(
        'LinkedIn detected',
        'Open a Jobs page to use card fading and match navigation.',
        'info',
      );
      return;
    }

    if (response.paused) {
      setPageStatus(
        'Paused on this tab',
        `Detected ${surfaceText}. Turn Pause off to resume highlights and dimming.`,
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
        `Detected ${surfaceText}. Add a keyword to start highlighting job descriptions.`,
        'info',
      );
      return;
    }

    const currentMatch = response.matchCount
      ? Math.max((response.activeMatchIndex ?? -1) + 1, 1)
      : 0;
    const matchText = response.matchCount
      ? `${currentMatch} of ${response.matchCount} matches available.`
      : 'No current keyword matches on the active page.';

    setPageStatus(
      'Ready on LinkedIn Jobs',
      `Detected ${surfaceText}. ${matchText}`,
      'success',
    );
  } catch (error) {
    setPageStatus(
      'Site access needed',
      'Cannot reach the LinkedIn tab. In Brave, open this extension\'s details, set Site access to On all sites or On www.linkedin.com, then reload the LinkedIn tab.',
      'error',
    );
    updateStateSummary();
    updateMatchStatus(0, -1);
  }
}

function setPageStatus(title, message, tone = 'info') {
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