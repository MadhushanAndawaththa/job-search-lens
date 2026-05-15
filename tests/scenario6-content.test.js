const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { JSDOM } = require('jsdom');

function getScenarioPath(name) {
  return path.join(__dirname, '..', `${name}.md`);
}

function loadScenarioDom(name) {
  const html = fs.readFileSync(getScenarioPath(name), 'utf8');

  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://www.linkedin.com/jobs/search/?keywords=software',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
}

function loadScript(dom, relativePath) {
  const script = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  dom.window.eval(script);
}

function createChromeMock() {
  return {
    storage: {
      local: {
        async get() {
          return {};
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

function countStates(document) {
  return [...document.querySelectorAll('[data-jhv-state]')].reduce((counts, card) => {
    const state = card.getAttribute('data-jhv-state');

    if (state) {
      counts[state] = (counts[state] || 0) + 1;
    }

    return counts;
  }, {});
}

test('scenario6 resolves the real results list and outer card wrapper', () => {
  const dom = loadScenarioDom('senario6');

  try {
    loadScript(dom, 'dom-heuristics.js');

    const { document, JobHuntVisualizerDom } = dom.window;
    const list = JobHuntVisualizerDom.findJobListContainer(document);
    const badge = document.querySelector('.job-card-container__footer-job-state');
    const card = JobHuntVisualizerDom.getJobCardElement(badge);

    assert.equal(list, document.querySelector('[data-results-list-top-scroll-sentinel] + ul'));
    assert.equal(card, badge.closest('.scaffold-layout__list-item'));
  } finally {
    dom.window.close();
  }
});

test('scenario6 applies dim states through the full content script path', async () => {
  const dom = loadScenarioDom('senario6');

  try {
    dom.window.chrome = createChromeMock();

    loadScript(dom, 'shared.js');
    loadScript(dom, 'dom-heuristics.js');
    loadScript(dom, 'content.js');

    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));

    const { document } = dom.window;
    const stateCounts = countStates(document);
    const firstBadgeWrapper = document.querySelector('.job-card-container__footer-job-state')
      ?.closest('.scaffold-layout__list-item');

    assert.equal(document.querySelectorAll('[data-jhv-state]').length, 7);
    assert.deepEqual(stateCounts, {
      viewed: 5,
      applied: 2,
    });
    assert.equal(firstBadgeWrapper?.getAttribute('data-jhv-state'), 'viewed');
  } finally {
    dom.window.close();
  }
});

test('scenario7 resolves the real results list and outer card wrapper', () => {
  const dom = loadScenarioDom('senario7');

  try {
    loadScript(dom, 'dom-heuristics.js');

    const { document, JobHuntVisualizerDom } = dom.window;
    const list = JobHuntVisualizerDom.findJobListContainer(document);
    const badge = document.querySelector('.job-card-container__footer-job-state');
    const card = JobHuntVisualizerDom.getJobCardElement(badge);

    assert.equal(list, document.querySelector('[data-results-list-top-scroll-sentinel] + ul'));
    assert.equal(card, badge.closest('.scaffold-layout__list-item'));
  } finally {
    dom.window.close();
  }
});

test('scenario7 applies dim states through the full content script path', async () => {
  const dom = loadScenarioDom('senario7');

  try {
    dom.window.chrome = createChromeMock();

    loadScript(dom, 'shared.js');
    loadScript(dom, 'dom-heuristics.js');
    loadScript(dom, 'content.js');

    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));

    const { document } = dom.window;
    const stateCounts = countStates(document);
    const firstBadgeWrapper = document.querySelector('.job-card-container__footer-job-state')
      ?.closest('.scaffold-layout__list-item');

    assert.equal(document.querySelectorAll('[data-jhv-state]').length, 3);
    assert.deepEqual(stateCounts, {
      viewed: 2,
      applied: 1,
    });
    assert.equal(firstBadgeWrapper?.getAttribute('data-jhv-state'), 'viewed');
  } finally {
    dom.window.close();
  }
});

test('scenario8 resolves the plain results list and outer card wrapper', () => {
  const dom = loadScenarioDom('senario8');

  try {
    loadScript(dom, 'dom-heuristics.js');

    const { document, JobHuntVisualizerDom } = dom.window;
    const list = JobHuntVisualizerDom.findJobListContainer(document);
    const badge = document.querySelector('.job-card-container__footer-job-state');
    const card = JobHuntVisualizerDom.getJobCardElement(badge);

    assert.equal(list, document.querySelector('ul.raohKUraOGymPhVpVNIYOtFeBToXgefXHQgxYfQ'));
    assert.equal(card, badge.closest('.scaffold-layout__list-item'));
  } finally {
    dom.window.close();
  }
});

test('scenario8 applies viewed dim states through the full content script path', async () => {
  const dom = loadScenarioDom('senario8');

  try {
    dom.window.chrome = createChromeMock();

    loadScript(dom, 'shared.js');
    loadScript(dom, 'dom-heuristics.js');
    loadScript(dom, 'content.js');

    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));

    const { document } = dom.window;
    const stateCounts = countStates(document);
    const firstBadgeWrapper = document.querySelector('.job-card-container__footer-job-state')
      ?.closest('.scaffold-layout__list-item');

    assert.equal(document.querySelectorAll('[data-jhv-state]').length, 2);
    assert.deepEqual(stateCounts, {
      viewed: 2,
    });
    assert.equal(firstBadgeWrapper?.getAttribute('data-jhv-state'), 'viewed');
  } finally {
    dom.window.close();
  }
});