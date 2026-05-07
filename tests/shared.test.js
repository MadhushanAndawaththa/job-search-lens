const test = require('node:test');
const assert = require('node:assert/strict');

const shared = require('../shared.js');

test('normalizeTerm trims and collapses whitespace', () => {
  assert.equal(shared.normalizeTerm('  Senior   Python  Engineer  '), 'Senior Python Engineer');
  assert.equal(shared.normalizeTerm(''), '');
});

test('splitKeywordTerms splits newline-separated pasted input into unique keywords', () => {
  const keywords = shared.splitKeywordTerms('  Python  \nReact\r\n\n python \nStaff   Engineer ');

  assert.deepEqual(keywords, ['Python', 'React', 'Staff Engineer']);
});

test('sanitizeColor accepts only six-digit hex colors', () => {
  assert.equal(shared.sanitizeColor('#a1b2c3'), '#A1B2C3');
  assert.equal(shared.sanitizeColor('#abc'), '');
  assert.equal(shared.sanitizeColor('red'), '');
});

test('coerceKeywords creates stable ids and removes duplicates', () => {
  const keywords = shared.coerceKeywords(['Python', ' python ', { term: 'React', color: '#81d4fa' }]);

  assert.equal(keywords.length, 2);
  assert.equal(keywords[0].id, 'kw:python');
  assert.equal(keywords[1].color, '#81D4FA');
});

test('upsertKeyword adds a new keyword once and preserves the selected color', () => {
  const initial = shared.coerceKeywords(['Python']);
  const firstInsert = shared.upsertKeyword(initial, 'Staff Engineer', '#FFCC80');
  const duplicateInsert = shared.upsertKeyword(firstInsert.keywords, 'staff engineer', '#81D4FA');

  assert.equal(firstInsert.added, true);
  assert.equal(firstInsert.keywords.at(-1).color, '#FFCC80');
  assert.equal(duplicateInsert.added, false);
  assert.equal(duplicateInsert.keywords.length, 2);
});

test('removeKeywordById and updateKeywordColor manipulate the stored keyword list', () => {
  const keywords = shared.coerceKeywords(['Python', 'React']);
  const recolored = shared.updateKeywordColor(keywords, 'kw:react', '#123456');
  const removed = shared.removeKeywordById(recolored, 'kw:python');

  assert.equal(recolored.find((keyword) => keyword.id === 'kw:react').color, '#123456');
  assert.deepEqual(
    removed.map((keyword) => keyword.id),
    ['kw:react']
  );
});

test('buildLiteralRegex matches special-character terms safely', () => {
  const regex = shared.buildLiteralRegex('C++');

  assert.equal('We use C++ daily.'.match(regex)[0], 'C++');
  assert.equal(regex.test('This mentions C+++ which should not fully match.'), true);
});

test('buildKeywordPatterns sorts longer terms first and keeps regex objects', () => {
  const patterns = shared.buildKeywordPatterns(['Python', 'Senior Python Engineer']);

  assert.equal(patterns[0].term, 'Senior Python Engineer');
  assert.ok(patterns[0].regex instanceof RegExp);
});

test('extractJobId prefers data-job-id and falls back to href parsing', () => {
  assert.equal(shared.extractJobId('12345', '/jobs/view/99999/'), '12345');
  assert.equal(shared.extractJobId('', 'https://www.linkedin.com/jobs/view/99999/'), '99999');
  assert.equal(shared.extractJobId('', 'https://www.linkedin.com/feed/'), '');
});

test('pruneViewedJobs keeps unique recent entries within the limit', () => {
  const viewed = shared.pruneViewedJobs(['1', '2', '2', '3', '4'], 3);

  assert.deepEqual(viewed, ['2', '3', '4']);
});

test('hydrateSettings sanitizes invalid values', () => {
  const settings = shared.hydrateSettings({
    paused: 'yes',
    historyLimit: -1,
    dimStates: {
      viewed: false,
      saved: 0,
      applied: 'enabled',
    },
  });

  assert.equal(settings.paused, true);
  assert.equal(settings.historyLimit, 2000);
  assert.deepEqual(settings.dimStates, {
    viewed: false,
    saved: false,
    applied: true,
  });
});

test('getContrastColor chooses readable text color', () => {
  assert.equal(shared.getContrastColor('#FFFFFF'), '#111111');
  assert.equal(shared.getContrastColor('#123456'), '#FFFFFF');
});