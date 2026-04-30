// The popup is the only interactive UI surface. LinkedIn itself only receives
// passive styling changes and user-driven click tracking.
const {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  coerceKeywords,
  coerceViewedJobs,
  normalizeTerm,
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
const viewedCount = document.getElementById('viewedCount');
const clearViewedJobsButton = document.getElementById('clearViewedJobs');

void initializePopup();

// Render first, then wire events so the popup always reflects the latest local
// storage state even if the extension worker was restarted.
async function initializePopup() {
  await render();

  keywordForm.addEventListener('submit', handleAddKeyword);
  keywordList.addEventListener('click', handleListClick);
  keywordList.addEventListener('input', handleListInput);
  clearViewedJobsButton.addEventListener('click', clearViewedJobs);
  pauseToggle.addEventListener('change', updatePauseState);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (
      changes[STORAGE_KEYS.keywords] ||
      changes[STORAGE_KEYS.viewedJobs] ||
      changes[STORAGE_KEYS.settings]
    ) {
      void render();
    }
  });
}

async function render() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.keywords,
    STORAGE_KEYS.viewedJobs,
    STORAGE_KEYS.settings,
  ]);

  const keywords = coerceKeywords(stored[STORAGE_KEYS.keywords]);
  const viewedJobs = coerceViewedJobs(stored[STORAGE_KEYS.viewedJobs]);
  const settings = hydrateSettings(stored[STORAGE_KEYS.settings]);

  pauseToggle.checked = Boolean(settings.paused);
  keywordCount.textContent = `${keywords.length} highlight${keywords.length === 1 ? '' : 's'}`;
  viewedCount.textContent = `${viewedJobs.length} viewed job${viewedJobs.length === 1 ? '' : 's'}`;
  keywordEmpty.hidden = keywords.length !== 0;
  keywordList.replaceChildren();

  for (const keyword of keywords) {
    keywordList.append(createKeywordRow(keyword));
  }
}

async function handleAddKeyword(event) {
  event.preventDefault();

  // Manual entry complements the context menu so users can seed highlight terms
  // without waiting to select text on LinkedIn first.
  const term = normalizeTerm(keywordInput.value);
  const color = sanitizeColor(keywordColor.value);

  if (!term) {
    keywordInput.focus();
    return;
  }

  const stored = await chrome.storage.local.get([STORAGE_KEYS.keywords]);
  const keywords = coerceKeywords(stored[STORAGE_KEYS.keywords]);
  const result = upsertKeyword(keywords, term, color);

  if (!result.added) {
    keywordInput.select();
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.keywords]: result.keywords,
  });

  keywordInput.value = '';
  keywordInput.focus();
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

async function clearViewedJobs() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.viewedJobs]: [],
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