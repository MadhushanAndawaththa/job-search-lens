const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bootstrapContentDom,
  loadScenarioDom,
} = require('./scenario-test-utils.js');

async function bootstrapScenario10() {
  return bootstrapContentDom(loadScenarioDom('senario10'));
}

test('scenario10 renders company stats from the native about-company module into the top insights row', async () => {
  const { dom, cleanupIntervals } = await bootstrapScenario10();

  try {
    const { document } = dom.window;
    const companyStats = document.querySelector('[data-jhv-company-stats]');
    const statTexts = [...document.querySelectorAll('[data-jhv-company-stat]')]
      .map((node) => node.textContent.trim());
    const primaryDescription = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container');

    assert.ok(companyStats);
    assert.deepEqual(statTexts, [
      '10,001+ employees',
      '12,848 on LinkedIn',
    ]);
    assert.equal(document.querySelector('[data-jhv-detail-insights]'), null);
    assert.equal(document.querySelectorAll('[data-jhv-detail-insight]').length, 0);
    assert.ok(
      companyStats.compareDocumentPosition(primaryDescription) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING
    );
  } finally {
    cleanupIntervals();
  }
});