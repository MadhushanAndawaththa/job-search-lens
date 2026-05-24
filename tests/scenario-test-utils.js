const fs = require('node:fs');
const path = require('node:path');

const { JSDOM } = require('jsdom');

const DEFAULT_SCENARIO_URL = 'https://www.linkedin.com/jobs/search/?keywords=software';

function getScenarioPath(name) {
  return path.join(__dirname, 'fixtures', 'scenarios', `${name}.md`);
}

function loadHtmlDom(html, url = DEFAULT_SCENARIO_URL) {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
}

function loadScenarioDom(name) {
  const html = fs.readFileSync(getScenarioPath(name), 'utf8');
  return loadHtmlDom(html);
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

function stripForeignExtensionArtifacts(document) {
  for (const node of document.querySelectorAll('.job-mate-status-badge, .job-mate-stats-row, .job-mate-tag')) {
    node.remove();
  }
}

async function bootstrapContentDom(dom, options = {}) {
  const { storageData = {}, stripForeignArtifacts = true } = options;
  const cleanupIntervals = trackWindowIntervals(dom.window);

  if (stripForeignArtifacts) {
    stripForeignExtensionArtifacts(dom.window.document);
  }

  dom.window.chrome = createChromeMock(storageData);

  loadScript(dom, 'shared.js');
  loadScript(dom, 'dom-heuristics.js');
  loadScript(dom, 'content.js');

  await new Promise((resolve) => dom.window.setTimeout(resolve, 50));

  return {
    dom,
    cleanupIntervals,
  };
}

module.exports = {
  bootstrapContentDom,
  loadHtmlDom,
  loadScenarioDom,
  loadScript,
};