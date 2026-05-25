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

async function bootstrapHtml(html, storageData, url) {
  const dom = loadHtmlDom(html, url);
  const cleanupIntervals = trackWindowIntervals(dom.window);

  dom.window.chrome = createChromeMock(storageData);

  loadScript(dom, 'shared.js');
  loadScript(dom, 'dom-heuristics.js');
  loadScript(dom, 'content.js');

  await new Promise((resolve) => {
    dom.window.requestAnimationFrame(() => {
      dom.window.setTimeout(resolve, 0);
    });
  });

  return {
    dom,
    cleanupIntervals,
  };
}

test('generic webpages highlight saved keywords when optional all-site access is enabled', async () => {
  const { dom, cleanupIntervals } = await bootstrapHtml(
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
    const { document } = dom.window;
    const marks = [...document.querySelectorAll('mark[data-job-hunt-mark]')]
      .map((node) => node.textContent.trim());

    assert.deepEqual(marks, ['Python', 'Node.js']);
    assert.equal(document.querySelector('[data-jhv-state]'), null);
    assert.equal(document.querySelector('[data-jhv-state-badge]'), null);
    assert.equal(document.querySelector('[data-jhv-company-stats]'), null);
  } finally {
    cleanupIntervals();
  }
});

test('generic webpages stay untouched until all-site highlighting is enabled', async () => {
  const { dom, cleanupIntervals } = await bootstrapHtml(
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
  }
});