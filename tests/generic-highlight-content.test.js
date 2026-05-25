const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { JSDOM } = require('jsdom');

function loadHtmlDom(html, url = 'https://example.com/careers/software-engineer') {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
}

function loadScript(dom, relativePath) {
  const script = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  dom.window.eval(script);
}

function createChromeMock(storageData = {}) {
  return {
    storage: {
      local: {
        async get() {
          return storageData;
        },
      },
      onChanged: {
        addListener() {},
      },
    },
    runtime: {
      onMessage: {
        addListener() {},
      },
    },
  };
}

function trackWindowIntervals(window) {
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);

  window.setInterval = () => 0;
  window.clearInterval = () => {};

  return () => {
    window.setInterval = nativeSetInterval;
    window.clearInterval = nativeClearInterval;
  };
}

function trackMutationObservers(window) {
  const NativeMutationObserver = window.MutationObserver;

  window.MutationObserver = class MutationObserver {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };

  return () => {
    window.MutationObserver = NativeMutationObserver;
  };
}

async function bootstrapHtml(html, storageData, url) {
  const dom = loadHtmlDom(html, url);
  const cleanupIntervals = trackWindowIntervals(dom.window);
  const cleanupMutationObservers = trackMutationObservers(dom.window);

  dom.window.chrome = createChromeMock(storageData);

  loadScript(dom, 'shared.js');
  loadScript(dom, 'dom-heuristics.js');
  loadScript(dom, 'content.js');

  await new Promise((resolve) => dom.window.setTimeout(resolve, 50));

  return {
    dom,
    cleanupIntervals,
    cleanupMutationObservers,
  };
}

async function waitForMarkCount(dom, expectedCount, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const markCount = dom.window.document.querySelectorAll('mark[data-job-hunt-mark]').length;

    if (markCount === expectedCount) {
      return;
    }

    await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  }
}

test('generic webpages highlight saved keywords when optional all-site access is enabled', async () => {
  const { dom, cleanupIntervals, cleanupMutationObservers } = await bootstrapHtml(
    '<main><article><p>Python backend engineer with Node.js experience wanted.</p></article></main>',
    {
      keywords: [
        { term: 'Python', color: '#F8BBD0' },
        { term: 'Node.js', color: '#90CAF9' },
      ],
      settings: {
        highlightAllSites: true,
      },
    },
    'https://example.com/jobs/backend-engineer'
  );

  try {
    await waitForMarkCount(dom, 2);

    const { document } = dom.window;
    const marks = [...document.querySelectorAll('mark[data-job-hunt-mark]')]
      .map((node) => node.textContent.trim());

    assert.deepEqual(marks, ['Python', 'Node.js']);
    assert.equal(document.querySelector('[data-jhv-state]'), null);
    assert.equal(document.querySelector('[data-jhv-state-badge]'), null);
    assert.equal(document.querySelector('[data-jhv-company-stats]'), null);
  } finally {
    cleanupIntervals();
    cleanupMutationObservers();
    dom.window.close();
  }
});

test('generic webpages stay untouched until all-site highlighting is enabled', async () => {
  const { dom, cleanupIntervals, cleanupMutationObservers } = await bootstrapHtml(
    '<main><article><p>Python backend engineer with Node.js experience wanted.</p></article></main>',
    {
      keywords: [
        { term: 'Python', color: '#F8BBD0' },
      ],
      settings: {},
    },
    'https://example.com/jobs/backend-engineer'
  );

  try {
    const { document } = dom.window;
    const marks = document.querySelectorAll('mark[data-job-hunt-mark]');

    assert.equal(marks.length, 0);
    assert.equal(document.querySelector('[data-jhv-state]'), null);
    assert.equal(document.querySelector('[data-jhv-state-badge]'), null);
    assert.equal(document.querySelector('[data-jhv-company-stats]'), null);
  } finally {
    cleanupIntervals();
    cleanupMutationObservers();
    dom.window.close();
  }
});