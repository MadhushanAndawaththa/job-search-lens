const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bootstrapContentDom,
  loadScenarioDom,
} = require('./scenario-test-utils.js');

async function bootstrapScenario9() {
  return bootstrapContentDom(loadScenarioDom('senario9'));
}

test('scenario9 renders owned state badges for dimmed cards', async () => {
  const { dom, cleanupIntervals } = await bootstrapScenario9();

  try {
    const { document } = dom.window;
    const badges = [...document.querySelectorAll('[data-jhv-state-badge]')];
    const counts = badges.reduce((stateCounts, badge) => {
      const state = badge.getAttribute('data-jhv-state-badge');

      stateCounts[state] = (stateCounts[state] || 0) + 1;
      return stateCounts;
    }, {});

    assert.equal(badges.length, 4);
    assert.deepEqual(counts, {
      viewed: 2,
      applied: 2,
    });
    assert.ok(badges.every((badge) => badge.parentElement?.getAttribute('data-jhv-state-badge-row') === 'true'));
    assert.ok(badges.every((badge) => badge.closest('a') === null));

    const activeCardBadge = document
      .querySelector('.jobs-search-results__list-item--active [data-jhv-state-badge], [aria-current="page"] [data-jhv-state-badge]');

    assert.equal(activeCardBadge?.textContent?.trim(), 'Applied');
  } finally {
    cleanupIntervals();
  }
});

test('scenario9 does not render extra pane details', async () => {
  const { dom, cleanupIntervals } = await bootstrapScenario9();

  try {
    const { document } = dom.window;
    assert.equal(document.querySelector('[data-jhv-detail-insights]'), null);
    assert.equal(document.querySelectorAll('[data-jhv-detail-insight]').length, 0);
  } finally {
    cleanupIntervals();
  }
});