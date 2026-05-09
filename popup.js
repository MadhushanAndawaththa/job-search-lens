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

const keywordForm = document.getElementById('keywordForm');
const keywordInput = document.getElementById('keywordInput');
const keywordColor = document.getElementById('keywordColor');
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
const themeToggle = document.getElementById('themeToggle');
const PAGE_STATUS_REFRESH_MS = 1500;

let statusRefreshTimer = null;
let statusRefreshInFlight = false;

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
  await render();

  keywordForm.addEventListener('submit', handleAddKeyword);
  keywordInput.addEventListener('keydown', handleKeywordInputKeydown);
  keywordList.addEventListener('click', handleListClick);
  keywordList.addEventListener('input', handleListInput);
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

  pauseToggle.checked = Boolean(settings.paused);
  dimViewedToggle.checked = Boolean(settings.dimStates.viewed);
  dimSavedToggle.checked = Boolean(settings.dimStates.saved);
  dimAppliedToggle.checked = Boolean(settings.dimStates.applied);
  keywordCount.textContent = `${keywords.length} highlight${keywords.length === 1 ? '' : 's'}`;
  updateStateSummary();
  keywordEmpty.hidden = keywords.length !== 0;
  keywordList.replaceChildren();

  for (const keyword of keywords) {
    keywordList.append(createKeywordRow(keyword));
  }

  await renderPageStatus();
}

async function handleAddKeyword(event) {
  event.preventDefault();

  // Manual entry complements the context menu so users can seed highlight terms
  // without waiting to select text on LinkedIn first.
  const terms = splitKeywordTerms(keywordInput.value);
  const color = sanitizeColor(keywordColor.value);

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

async function handleListClick(event) {
  const button = event.target.closest('button[data-action="remove-keyword"]');

  if (!button) {
    return;
  }

  const keywordId = button.getAttribute('data-keyword-id');

  if (!keywordId) {
    return;
  }

  const stored = await chrome.storage.local.get([STORAGE_KEYS.keywords]);
  const keywords = removeKeywordById(stored[STORAGE_KEYS.keywords], keywordId);

  await chrome.storage.local.set({
    [STORAGE_KEYS.keywords]: keywords,
  });
}

async function handleListInput(event) {
  const colorInput = event.target.closest('input[data-action="update-color"]');

  if (!colorInput) {
    return;
  }

  const keywordId = colorInput.getAttribute('data-keyword-id');
  const nextColor = sanitizeColor(colorInput.value);

  if (!keywordId || !nextColor) {
    return;
  }

  const stored = await chrome.storage.local.get([STORAGE_KEYS.keywords]);
  const keywords = updateKeywordColor(stored[STORAGE_KEYS.keywords], keywordId, nextColor);

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

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = keyword.color;
  colorInput.setAttribute('data-action', 'update-color');
  colorInput.setAttribute('data-keyword-id', keyword.id);
  colorInput.setAttribute('aria-label', `Change color for ${keyword.term}`);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'secondary';
  removeButton.textContent = 'Remove';
  removeButton.setAttribute('data-action', 'remove-keyword');
  removeButton.setAttribute('data-keyword-id', keyword.id);

  pill.append(swatch, term);
  item.append(pill, colorInput, removeButton);

  return item;
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

  if (!/https:\/\/(?:[\w-]+\.)?linkedin\.com\//i.test(url)) {
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
    setPageStatus('Open a LinkedIn tab, then reopen this popup.');
    updateMatchStatus(0, -1);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: 'job-hunt-visualizer:ping',
    });

    if (!response?.ok) {
      setPageStatus('LinkedIn tab found, but the content script did not answer.');
      updateMatchStatus(0, -1);
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
    setPageStatus(`Connected on ${response.route}. Detected ${surfaceText}. ${response.paused ? 'Extension is paused.' : 'Extension is active.'}`);
  } catch (error) {
    setPageStatus('Cannot reach the LinkedIn tab. In Brave, open this extension\'s details, set Site access to On all sites or On linkedin.com, then reload the LinkedIn tab.');
    updateStateSummary();
    updateMatchStatus(0, -1);
  }
}

function setPageStatus(message) {
  pageStatus.replaceChildren();

  const label = document.createElement('strong');
  label.textContent = 'Status:';

  pageStatus.append(label, ` ${message}`);
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