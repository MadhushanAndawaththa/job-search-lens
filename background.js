importScripts('shared.js');

// Keep the context menu behavior tiny and local so the service worker only
// stores explicit user selections inside chrome.storage.local.
const CONTEXT_MENU_ID = 'job-hunt-visualizer-add-keyword';
const {
  STORAGE_KEYS,
  LINKEDIN_HOST_PATTERNS,
  OPTIONAL_SITE_ACCESS_PATTERNS,
  OPTIONAL_CONTENT_SCRIPT_ID,
  CONTENT_SCRIPT_FILES,
  CONTENT_STYLE_FILES,
  normalizeTerm,
  coerceKeywords,
  upsertKeyword,
  hydrateSettings,
} = self.JobHuntVisualizerShared;

// MV3 service workers spin down when idle and respawn on demand. Recreating
// the menu at top-level guarantees it is present on every cold start. The
// create call below is idempotent: if the menu already exists, the
// "duplicate id" error from chrome.runtime.lastError is harmless and we
// silently ignore it instead of doing a destructive remove-then-create cycle
// (which races with click events fired during SW spin-up).
createContextMenu();
void syncOptionalSiteAccess();

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
  void syncOptionalSiteAccess();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
  void syncOptionalSiteAccess();
});

chrome.permissions.onAdded.addListener((permissions) => {
  if (!containsOptionalSiteOrigins(permissions.origins)) {
    return;
  }

  void setHighlightAllSitesEnabled(true);
  void syncOptionalSiteAccess();
});

chrome.permissions.onRemoved.addListener((permissions) => {
  if (!containsOptionalSiteOrigins(permissions.origins)) {
    return;
  }

  void setHighlightAllSitesEnabled(false);
  void syncOptionalSiteAccess();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'job-hunt-visualizer:sync-site-access') {
    return false;
  }

  void handleSiteAccessSync(message)
    .then(() => {
      sendResponse({ ok: true });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to sync site access.',
      });
    });

  return true;
});

// The context menu is the fastest way to turn selected page text into a
// highlight term without injecting any controls into the site itself.
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  const pageUrl = info.pageUrl || info.frameUrl || '';

  if (!/^https?:\/\//i.test(pageUrl)) {
    return;
  }

  const selectedText = normalizeTerm(info.selectionText);

  if (!selectedText) {
    return;
  }

  const stored = await chrome.storage.local.get([STORAGE_KEYS.keywords]);
  const keywords = coerceKeywords(stored[STORAGE_KEYS.keywords]);
  const result = upsertKeyword(keywords, selectedText);

  if (!result.added) {
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.keywords]: result.keywords,
  });
});

function createContextMenu() {
  // The %s placeholder keeps the label tied to the actual user selection
  // without any extra DOM work on the page.
  chrome.contextMenus.create(
    {
      id: CONTEXT_MENU_ID,
      title: 'Add "%s" to Highlighter',
      contexts: ['selection'],
    },
    () => {
      // Reading lastError consumes the "duplicate id" warning that fires when
      // the menu already exists from a previous SW lifetime.
      void chrome.runtime.lastError;
    },
  );
}

async function handleSiteAccessSync(message) {
  await syncOptionalSiteAccess();

  if (!await hasOptionalSiteAccess()) {
    return;
  }

  await ensureTabHelper(message?.tabId, message?.url || '');
}

async function syncOptionalSiteAccess() {
  const hasOptionalAccess = await hasOptionalSiteAccess();
  const registeredScripts = await chrome.scripting.getRegisteredContentScripts({
    ids: [OPTIONAL_CONTENT_SCRIPT_ID],
  });

  if (hasOptionalAccess && registeredScripts.length === 0) {
    await chrome.scripting.registerContentScripts([
      {
        id: OPTIONAL_CONTENT_SCRIPT_ID,
        matches: OPTIONAL_SITE_ACCESS_PATTERNS,
        excludeMatches: LINKEDIN_HOST_PATTERNS,
        js: CONTENT_SCRIPT_FILES,
        css: CONTENT_STYLE_FILES,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  }

  if (!hasOptionalAccess && registeredScripts.length !== 0) {
    await chrome.scripting.unregisterContentScripts({
      ids: [OPTIONAL_CONTENT_SCRIPT_ID],
    });
  }

  if (!hasOptionalAccess) {
    await setHighlightAllSitesEnabled(false);
  }
}

async function hasOptionalSiteAccess() {
  return chrome.permissions.contains({
    origins: OPTIONAL_SITE_ACCESS_PATTERNS,
  });
}

function containsOptionalSiteOrigins(origins = []) {
  return OPTIONAL_SITE_ACCESS_PATTERNS.some((origin) => origins.includes(origin));
}

async function setHighlightAllSitesEnabled(enabled) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.settings]);
  const settings = hydrateSettings(stored[STORAGE_KEYS.settings]);

  if (settings.highlightAllSites === Boolean(enabled)) {
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: {
      ...settings,
      highlightAllSites: Boolean(enabled),
    },
  });
}

async function ensureTabHelper(tabId, url) {
  if (!Number.isInteger(tabId) || !isInjectableUrl(url) || isLinkedInUrl(url)) {
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'job-hunt-visualizer:ping',
    });

    if (response?.ok) {
      return;
    }
  } catch {
    // The helper is not on the page yet — inject it below.
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: CONTENT_STYLE_FILES,
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES,
  });
}

function isInjectableUrl(url = '') {
  return /^https?:\/\//i.test(url);
}

function isLinkedInUrl(url = '') {
  try {
    return /(^|\.)linkedin\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
