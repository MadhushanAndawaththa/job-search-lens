const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bootstrapContentDom,
  loadScenarioDom,
  loadScript,
} = require('./scenario-test-utils.js');

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
  const { dom, cleanupIntervals } = await bootstrapContentDom(loadScenarioDom('senario6'));

  try {
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
    cleanupIntervals();
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
  const { dom, cleanupIntervals } = await bootstrapContentDom(loadScenarioDom('senario7'));

  try {
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
    cleanupIntervals();
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
  const { dom, cleanupIntervals } = await bootstrapContentDom(loadScenarioDom('senario8'));

  try {
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
    cleanupIntervals();
  }
});