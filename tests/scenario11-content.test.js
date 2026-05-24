const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bootstrapContentDom,
  loadHtmlDom,
  loadScenarioDom,
} = require('./scenario-test-utils.js');

async function bootstrapDom(dom) {
  return bootstrapContentDom(dom);
}

async function bootstrapScenario11() {
  return bootstrapDom(loadScenarioDom('senario11'));
}

async function bootstrapScenario13() {
  return bootstrapDom(loadScenarioDom('senario13'));
}

test('scenario11 renders company stats from generic about-company metadata near the top of the pane', async () => {
  const { dom, cleanupIntervals } = await bootstrapScenario11();

  try {
    const { document, Node } = dom.window;
    const companyStats = document.querySelector('[data-jhv-company-stats]');
    const statTexts = [...document.querySelectorAll('[data-jhv-company-stat]')]
      .map((node) => node.textContent.trim());
    const firstHeading = document.querySelector('h2');

    assert.ok(companyStats);
    assert.deepEqual(statTexts, [
      '11-50 employees',
      '19 on LinkedIn',
    ]);
    assert.ok(
      companyStats.compareDocumentPosition(firstHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  } finally {
    cleanupIntervals();
  }
});

test('scenario13 renders company stats below the SDUI title link and above the metadata row', async () => {
  const { dom, cleanupIntervals } = await bootstrapScenario13();

  try {
    const { document, Node } = dom.window;
    const companyStats = document.querySelector('[data-jhv-company-stats]');
    const statTexts = [...document.querySelectorAll('[data-jhv-company-stat]')]
      .map((node) => node.textContent.trim());
    const titleLink = document.querySelector('a[href*="/jobs/view/"]');
    const titleBlock = titleLink?.closest('p');
    const metadataBlock = [...document.querySelectorAll('p')]
      .find((node) => (node.textContent || '').includes('83 applicants'));

    assert.ok(companyStats);
    assert.deepEqual(statTexts, [
      '11-50 employees',
      '19 on LinkedIn',
    ]);
    assert.ok(titleBlock);
    assert.ok(metadataBlock);
    assert.ok(
      titleBlock.compareDocumentPosition(companyStats) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    assert.ok(
      companyStats.compareDocumentPosition(metadataBlock) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  } finally {
    cleanupIntervals();
  }
});

test('company stats anchor after the outer title section when the title paragraph is wrapped', async () => {
  const dom = loadHtmlDom(`
    <main class="scaffold-layout__main">
      <section data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails">
        <div>
          <div>
            <a href="https://www.linkedin.com/company/dijital-team/life/">Dijital Team</a>
            <button type="button" aria-label="More options"></button>
          </div>
          <div data-title-wrapper="true">
            <div data-display-contents="true">
              <p>
                <a href="https://www.linkedin.com/jobs/view/4416113905/">Web Developer</a>
                <span aria-label="Verified job">Verified</span>
              </p>
            </div>
          </div>
          <div data-title-spacer="true"></div>
          <p>Sri Lanka · 4 days ago · Over 100 applicants</p>
        </div>
        <section>
          <h2>About the company</h2>
          <p>Software Development</p>
          <p>201-500 employees</p>
          <p>280 on LinkedIn</p>
        </section>
      </section>
    </main>
  `);

  const { cleanupIntervals } = await bootstrapDom(dom);

  try {
    const { document, Node } = dom.window;
    const titleWrapper = document.querySelector('[data-title-wrapper="true"]');
    const companyStats = document.querySelector('[data-jhv-company-stats]');
    const metadataBlock = [...document.querySelectorAll('p')]
      .find((node) => (node.textContent || '').includes('Over 100 applicants'));

    assert.ok(titleWrapper);
    assert.ok(companyStats);
    assert.equal(titleWrapper.contains(companyStats), false);
    assert.ok(
      titleWrapper.compareDocumentPosition(companyStats) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    assert.ok(
      companyStats.compareDocumentPosition(metadataBlock) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  } finally {
    cleanupIntervals();
  }
});

test('company stats fall back to a broader detail ancestor when the matched detail root is too narrow', async () => {
  const dom = loadHtmlDom(`
    <main class="scaffold-layout__main">
      <section data-view-name="job-details">
        <h1>Senior Software Engineer</h1>
        <div class="jobs-description-content__text">Build product features and improve reliability.</div>
        <section>
          <h2>About the company</h2>
          <p>Software Development</p>
          <p>11-50 employees</p>
          <p>19 on LinkedIn</p>
        </section>
      </section>
    </main>
  `);

  const { cleanupIntervals } = await bootstrapDom(dom);

  try {
    const { document, Node } = dom.window;
    const detailRoot = document.querySelector('[data-view-name="job-details"]');
    const companyStats = detailRoot.querySelector('[data-jhv-company-stats]');
    const statTexts = [...detailRoot.querySelectorAll('[data-jhv-company-stat]')]
      .map((node) => node.textContent.trim());
    const title = detailRoot.querySelector('h1');
    const aboutHeading = detailRoot.querySelector('h2');

    assert.ok(companyStats);
    assert.deepEqual(statTexts, [
      '11-50 employees',
      '19 on LinkedIn',
    ]);
    assert.ok(
      title.compareDocumentPosition(companyStats) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    assert.ok(
      companyStats.compareDocumentPosition(aboutHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  } finally {
    cleanupIntervals();
  }
});

test('state badge detection maps application submitted text to applied', async () => {
  const dom = loadScenarioDom('senario8');
  const stateLabel = dom.window.document.querySelector('.job-card-container__footer-job-state');

  stateLabel.textContent = 'Application submitted';

  const { cleanupIntervals } = await bootstrapDom(dom);

  try {
    const { document } = dom.window;
    const card = document.querySelector('[data-jhv-state="applied"]');
    const stateBadge = document.querySelector('[data-jhv-state-badge="applied"]');
    const badgeRow = stateBadge?.parentElement;

    assert.equal(card?.getAttribute('data-jhv-state'), 'applied');
    assert.equal(stateBadge?.textContent?.trim(), 'Applied');
    assert.equal(badgeRow?.getAttribute('data-jhv-state-badge-row'), 'true');
    assert.equal(stateBadge?.closest('a'), null);
  } finally {
    cleanupIntervals();
  }
});

test('state badge placement falls back to the title text block when a card has no standard title container or job link', async () => {
  const dom = loadHtmlDom(`
    <main class="scaffold-layout__main">
      <section data-view-name="search-results">
        <ul>
          <li class="scaffold-layout__list-item">
            <div class="job-card-container" data-job-id="4416113905">
              <div>
                <div>
                  <figure aria-hidden="true"></figure>
                  <div>
                    <div>
                      <p>Web Developer</p>
                    </div>
                    <div>
                      <p>Dijital Team</p>
                    </div>
                    <p>Sri Lanka (Remote)</p>
                  </div>
                </div>
              </div>
              <div class="job-card-list__insight">
                <p>Actively reviewing applicants</p>
              </div>
              <ul class="job-card-list__footer-wrapper">
                <li class="job-card-container__footer-item job-card-container__footer-job-state">Applied</li>
              </ul>
              <button aria-label="Dismiss Web Developer job" type="button"></button>
            </div>
          </li>
        </ul>
      </section>
    </main>
  `);

  const { cleanupIntervals } = await bootstrapDom(dom);

  try {
    const { document, Node } = dom.window;
    const title = [...document.querySelectorAll('p')].find((node) => node.textContent.trim() === 'Web Developer');
    const company = [...document.querySelectorAll('p')].find((node) => node.textContent.trim() === 'Dijital Team');
    const badgeRow = document.querySelector('[data-jhv-state-badge-row]');

    assert.ok(badgeRow);
    assert.equal(badgeRow?.firstElementChild?.getAttribute('data-jhv-state-badge'), 'applied');
    assert.ok(title.compareDocumentPosition(badgeRow) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(badgeRow.compareDocumentPosition(company) & Node.DOCUMENT_POSITION_FOLLOWING);
  } finally {
    cleanupIntervals();
  }
});