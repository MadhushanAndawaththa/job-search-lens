const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { JSDOM } = require('jsdom');
const domHeuristics = require('../dom-heuristics.js');

function loadFixture(name) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  return new JSDOM(html);
}

test('findJobListContainer falls back to the nearest multi-card ancestor for generic results shells', () => {
  const dom = loadFixture('scenario5-generic-results.html');

  try {
    const container = domHeuristics.findJobListContainer(dom.window.document);

    assert.equal(container, dom.window.document.querySelector('.generic-results'));
  } finally {
    dom.window.close();
  }
});

test('findJobListContainer prefers the scenario5 sentinel + ul results list', () => {
  const dom = loadFixture('scenario5-sentinel-results.html');

  try {
    const container = domHeuristics.findJobListContainer(dom.window.document);

    assert.equal(container, dom.window.document.querySelector('[data-results-list-top-scroll-sentinel] + ul'));
  } finally {
    dom.window.close();
  }
});

test('getJobCardElement promotes a scenario5 inner job card to the scaffold list-item wrapper', () => {
  const dom = loadFixture('scenario5-sentinel-results.html');

  try {
    const badge = dom.window.document.querySelector('.job-card-container__footer-job-state');
    const card = domHeuristics.getJobCardElement(badge);

    assert.equal(card, dom.window.document.querySelector('.scaffold-layout__list-item'));
  } finally {
    dom.window.close();
  }
});