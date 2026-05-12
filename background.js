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

// Recreate the menu whenever the worker spins up so unpacked reloads and
// browser-specific service worker restarts do not leave it missing.
createContextMenu();

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

// The context menu is the fastest way to turn selected LinkedIn text into a
// highlight term without injecting any controls into the LinkedIn page itself.
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  const pageUrl = info.pageUrl || info.frameUrl || '';

  if (!/^https:\/\/www\.linkedin\.com\//i.test(pageUrl)) {
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
  chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
    void chrome.runtime.lastError;

    // The built-in %s placeholder keeps the label tied to the actual user
    // selection without us needing any extra DOM work on the page.
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Add "%s" to Highlighter',
      contexts: ['selection'],
    });
  });
}