importScripts('shared.js');

// Keep the context menu behavior tiny and local so the service worker only
// stores explicit user selections inside chrome.storage.local.
const CONTEXT_MENU_ID = 'job-hunt-visualizer-add-keyword';
const {
  STORAGE_KEYS,
  normalizeTerm,
  coerceKeywords,
  upsertKeyword,
} = self.JobHuntVisualizerShared;

// MV3 service workers spin down when idle and respawn on demand. Recreating
// the menu at top-level guarantees it is present on every cold start. The
// create call below is idempotent: if the menu already exists, the
// "duplicate id" error from chrome.runtime.lastError is harmless and we
// silently ignore it instead of doing a destructive remove-then-create cycle
// (which races with click events fired during SW spin-up).
createContextMenu();

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
