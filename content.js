(() => {
  const {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    coerceKeywords,
    coerceViewedJobs,
    buildKeywordPatterns,
    hydrateSettings,
    pruneViewedJobs,
    extractJobId,
    getContrastColor,
  } = globalThis.JobHuntVisualizerShared;

  // These selectors intentionally prefer semantic or attribute-driven hooks
  // before falling back to LinkedIn class names that tend to drift over time.
  const JOB_LIST_SELECTORS = [
    '.jobs-search-results-list',
    '.jobs-search-results__list',
    '.jobs-search-results-list__list',
    '.scaffold-layout__list-container',
    '[data-view-name="search-results"] ul',
  ];

  const JOB_DETAIL_SELECTORS = [
    '.jobs-search__job-details--container',
    '.jobs-details',
    '.jobs-box__html-content',
    '.jobs-description-content__text',
    '[data-job-detail-container]',
    '[data-view-name="job-details"]',
  ];

  const JOB_CARD_FALLBACK_SELECTORS = [
    '[data-job-id]',
    'a[href*="/jobs/view/"]',
  ];

  const JOB_CARD_CONTAINER_SELECTORS = [
    '[data-job-id]',
    'li',
    '[role="listitem"]',
    'article',
    '.job-card-container',
    '.jobs-search-results__list-item',
    '.artdeco-list__item',
  ];

  const JOB_LIST_ANCESTOR_SELECTORS = [
    'ul',
    'ol',
    '[role="list"]',
    '.jobs-search-results-list',
    '.jobs-search-results__list',
    '.jobs-search-results-list__list',
    '.scaffold-layout__list-container',
    '[data-view-name="search-results"]',
  ];

  const ROUTE_CHANGE_EVENT = 'job-hunt-visualizer:route-change';
  const MARK_ATTRIBUTE = 'data-job-hunt-mark';
  const GHOST_CLASS_NAME = 'ghost-job';

  let keywords = [];
  let keywordPatterns = [];
  let viewedJobs = new Set();
  let settings = { ...DEFAULT_SETTINGS };

  let listContainer = null;
  let detailContainer = null;
  let listObserver = null;
  let detailObserver = null;
  let rootObserver = null;
  let storageListenerBound = false;
  let navigationHooksInstalled = false;
  let routeListenerBound = false;
  let lastHighlightSignature = '';
  let bindScheduled = false;
  let highlightScheduled = false;
  let lastKnownRoute = `${window.location.pathname}${window.location.search}`;

  void bootstrap();

  // Boot once, then rely on storage changes, route changes, and targeted DOM
  // observation instead of polling loops.
  async function bootstrap() {
    installNavigationHooks();
    bindRouteListener();
    await loadState();
    bindStorageListener();
    startRootObserver();
    refreshBindings();
  }

  async function loadState() {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.keywords,
      STORAGE_KEYS.viewedJobs,
      STORAGE_KEYS.settings,
    ]);

    keywords = coerceKeywords(stored[STORAGE_KEYS.keywords]);
    keywordPatterns = buildKeywordPatterns(keywords);
    viewedJobs = new Set(coerceViewedJobs(stored[STORAGE_KEYS.viewedJobs]));
    settings = hydrateSettings(stored[STORAGE_KEYS.settings]);
  }

  function bindStorageListener() {
    if (storageListenerBound) {
      return;
    }

    // Storage updates are the single source of truth across popup, background,
    // and content script contexts.
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      if (changes[STORAGE_KEYS.keywords]) {
        keywords = coerceKeywords(changes[STORAGE_KEYS.keywords].newValue);
        keywordPatterns = buildKeywordPatterns(keywords);
        lastHighlightSignature = '';
        scheduleHighlight();
      }

      if (changes[STORAGE_KEYS.viewedJobs]) {
        viewedJobs = new Set(coerceViewedJobs(changes[STORAGE_KEYS.viewedJobs].newValue));
        applyGhostStyles();
      }

      if (changes[STORAGE_KEYS.settings]) {
        settings = hydrateSettings(changes[STORAGE_KEYS.settings].newValue);
        lastHighlightSignature = '';
        refreshBindings();
      }
    });

    storageListenerBound = true;
  }

  function bindRouteListener() {
    if (routeListenerBound) {
      return;
    }

    window.addEventListener(ROUTE_CHANGE_EVENT, handleRouteChange, { passive: true });
    routeListenerBound = true;
  }

  function installNavigationHooks() {
    if (navigationHooksInstalled) {
      return;
    }

    const notify = () => {
      window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      notify();
      return result;
    };

    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      notify();
      return result;
    };

    window.addEventListener('popstate', notify, { passive: true });
    navigationHooksInstalled = true;
  }

  function handleRouteChange() {
    const nextRoute = `${window.location.pathname}${window.location.search}`;

    if (nextRoute === lastKnownRoute) {
      return;
    }

    lastKnownRoute = nextRoute;
    lastHighlightSignature = '';
    scheduleBindingRefresh();
  }

  function startRootObserver() {
    if (rootObserver || !document.body) {
      return;
    }

    rootObserver = new MutationObserver(() => {
      scheduleBindingRefresh();
    });

    rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function scheduleBindingRefresh() {
    if (bindScheduled) {
      return;
    }

    bindScheduled = true;
    requestAnimationFrame(() => {
      bindScheduled = false;
      refreshBindings();
    });
  }

  function refreshBindings() {
    if (!isJobsPage()) {
      clearGhostStyles();
      clearHighlights(detailContainer);
      disconnectSurfaceObservers();
      listContainer = null;
      detailContainer = null;
      return;
    }

    const nextListContainer = findJobListContainer();
    const nextDetailContainer = findJobDetailContainer();

    if (nextListContainer !== listContainer) {
      attachListSurface(nextListContainer);
    }

    if (nextDetailContainer !== detailContainer) {
      attachDetailSurface(nextDetailContainer);
    }

    if (settings.paused) {
      clearGhostStyles();
      clearHighlights(detailContainer);
      return;
    }

    applyGhostStyles();
    scheduleHighlight();
  }

  // Observe only the job list surface for new cards and attribute changes.
  function attachListSurface(nextContainer) {
    if (listObserver) {
      listObserver.disconnect();
      listObserver = null;
    }

    if (listContainer) {
      listContainer.removeEventListener('click', handleListClick);
      listContainer.removeEventListener('keydown', handleListKeydown);
    }

    listContainer = nextContainer;

    if (!listContainer) {
      return;
    }

    listContainer.addEventListener('click', handleListClick, { passive: true });
    listContainer.addEventListener('keydown', handleListKeydown);

    listObserver = new MutationObserver(() => {
      if (!settings.paused) {
        applyGhostStyles();
      }
    });

    listObserver.observe(listContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-job-id', 'href', 'class'],
    });

    applyGhostStyles();
  }

  // Observe only the right-hand details surface so highlights react to real
  // LinkedIn re-renders without scanning the full page.
  function attachDetailSurface(nextContainer) {
    if (detailObserver) {
      detailObserver.disconnect();
      detailObserver = null;
    }

    if (detailContainer && detailContainer !== nextContainer) {
      clearHighlights(detailContainer);
    }

    detailContainer = nextContainer;
    lastHighlightSignature = '';

    if (!detailContainer) {
      return;
    }

    detailObserver = new MutationObserver(() => {
      if (!settings.paused) {
        scheduleHighlight();
      }
    });

    detailObserver.observe(detailContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleHighlight();
  }

  function disconnectSurfaceObservers() {
    if (listObserver) {
      listObserver.disconnect();
      listObserver = null;
    }

    if (detailObserver) {
      detailObserver.disconnect();
      detailObserver = null;
    }

    if (listContainer) {
      listContainer.removeEventListener('click', handleListClick);
      listContainer.removeEventListener('keydown', handleListKeydown);
    }
  }

  function handleListClick(event) {
    if (settings.paused) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    void trackViewedJob(event.target);
  }

  function handleListKeydown(event) {
    if (settings.paused) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    void trackViewedJob(event.target);
  }

  async function trackViewedJob(target) {
    const card = getJobCardElement(target);

    if (!card) {
      return;
    }

    const jobId = resolveJobId(card);

    if (!jobId || viewedJobs.has(jobId)) {
      return;
    }

    const nextViewedJobs = pruneViewedJobs([...viewedJobs, jobId], settings.historyLimit);
    viewedJobs = new Set(nextViewedJobs);
    applyGhostStyles();

    await chrome.storage.local.set({
      [STORAGE_KEYS.viewedJobs]: nextViewedJobs,
    });
  }

  function applyGhostStyles() {
    if (!listContainer) {
      return;
    }

    for (const card of getJobCards(listContainer)) {
      const jobId = resolveJobId(card);

      if (jobId && viewedJobs.has(jobId) && !settings.paused) {
        card.classList.add(GHOST_CLASS_NAME);
      } else {
        card.classList.remove(GHOST_CLASS_NAME);
      }
    }
  }

  function clearGhostStyles() {
    for (const node of document.querySelectorAll(`.${GHOST_CLASS_NAME}`)) {
      node.classList.remove(GHOST_CLASS_NAME);
    }
  }

  function scheduleHighlight() {
    if (highlightScheduled) {
      return;
    }

    highlightScheduled = true;
    requestAnimationFrame(() => {
      highlightScheduled = false;
      highlightDetail();
    });
  }

  function highlightDetail() {
    if (!detailContainer) {
      return;
    }

    if (settings.paused || keywordPatterns.length === 0) {
      clearHighlights(detailContainer);
      lastHighlightSignature = createHighlightSignature();
      return;
    }

    const nextSignature = createHighlightSignature();

    if (nextSignature === lastHighlightSignature) {
      return;
    }

    clearHighlights(detailContainer);

    const textNodes = collectHighlightableTextNodes(detailContainer);

    for (const textNode of textNodes) {
      highlightTextNode(textNode);
    }

    lastHighlightSignature = nextSignature;
  }

  // Walk plain text nodes only, then wrap our matches with extension-owned
  // mark tags so we can cleanly remove and rebuild them later.
  function collectHighlightableTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldHighlightTextNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      }
    );

    let currentNode = walker.nextNode();

    while (currentNode) {
      nodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    return nodes;
  }

  function highlightTextNode(textNode) {
    const text = textNode.textContent || '';
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let foundAnyMatch = false;

    while (cursor < text.length) {
      const nextMatch = findNextMatch(text, cursor);

      if (!nextMatch) {
        fragment.append(text.slice(cursor));
        break;
      }

      foundAnyMatch = true;

      if (nextMatch.index > cursor) {
        fragment.append(text.slice(cursor, nextMatch.index));
      }

      fragment.append(createMarkNode(nextMatch.pattern, nextMatch.value));
      cursor = nextMatch.index + nextMatch.value.length;
    }

    if (!foundAnyMatch) {
      return;
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  function findNextMatch(text, startIndex) {
    let bestMatch = null;

    for (const pattern of keywordPatterns) {
      pattern.regex.lastIndex = startIndex;
      const match = pattern.regex.exec(text);

      if (!match) {
        continue;
      }

      const candidate = {
        pattern,
        index: match.index,
        value: match[0],
      };

      if (!bestMatch) {
        bestMatch = candidate;
        continue;
      }

      const isEarlier = candidate.index < bestMatch.index;
      const isLongerAtSameIndex =
        candidate.index === bestMatch.index && candidate.value.length > bestMatch.value.length;

      if (isEarlier || isLongerAtSameIndex) {
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  function createMarkNode(pattern, text) {
    const mark = document.createElement('mark');
    mark.setAttribute(MARK_ATTRIBUTE, 'true');
    mark.className = 'job-hunt-visualizer-mark';
    mark.style.setProperty('--job-hunt-highlight', pattern.color);
    mark.style.setProperty('--job-hunt-highlight-text', getContrastColor(pattern.color));
    mark.textContent = text;
    return mark;
  }

  function clearHighlights(root) {
    if (!root) {
      return;
    }

    // Only unwrap marks we created so LinkedIn's own markup stays untouched.
    const parentsToNormalize = new Set();

    for (const mark of root.querySelectorAll(`mark[${MARK_ATTRIBUTE}]`)) {
      const parent = mark.parentNode;

      if (!parent) {
        continue;
      }

      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parentsToNormalize.add(parent);
    }

    for (const parent of parentsToNormalize) {
      parent.normalize();
    }
  }

  function shouldHighlightTextNode(node) {
    if (!node.parentElement) {
      return false;
    }

    if (!node.textContent || !node.textContent.trim()) {
      return false;
    }

    if (node.parentElement.closest(`mark[${MARK_ATTRIBUTE}]`)) {
      return false;
    }

    if (node.parentElement.closest('script, style, textarea, noscript')) {
      return false;
    }

    if (node.parentElement.closest('[contenteditable="true"]')) {
      return false;
    }

    return true;
  }

  function createHighlightSignature() {
    const keywordSignature = keywords
      .map((keyword) => `${keyword.normalized}:${keyword.color}`)
      .join('|');

    return `${detailContainer?.textContent || ''}::${keywordSignature}::${settings.paused}`;
  }

  function isJobsPage() {
    return /^\/jobs(\/|$)/.test(window.location.pathname);
  }

  function findJobListContainer() {
    for (const selector of JOB_LIST_SELECTORS) {
      const container = document.querySelector(selector);

      if (container) {
        return container;
      }
    }

    const fallbackCard = document.querySelector(JOB_CARD_FALLBACK_SELECTORS.join(', '));

    if (!fallbackCard) {
      return null;
    }

    for (const selector of JOB_LIST_ANCESTOR_SELECTORS) {
      const container = fallbackCard.closest(selector);

      if (container) {
        return container;
      }
    }

    return null;
  }

  function findJobDetailContainer() {
    for (const selector of JOB_DETAIL_SELECTORS) {
      const container = document.querySelector(selector);

      if (container) {
        return container;
      }
    }

    return null;
  }

  function getJobCards(root) {
    const cards = new Set();
    const candidates = root.querySelectorAll(JOB_CARD_FALLBACK_SELECTORS.join(', '));

    for (const candidate of candidates) {
      const card = getJobCardElement(candidate);

      if (card) {
        cards.add(card);
      }
    }

    return [...cards];
  }

  function getJobCardElement(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    for (const selector of JOB_CARD_CONTAINER_SELECTORS) {
      const card = target.closest(selector);

      if (card) {
        return card;
      }
    }

    return null;
  }

  function resolveJobId(element) {
    const dataNode = element.matches('[data-job-id]')
      ? element
      : element.querySelector('[data-job-id]');

    const dataJobId = dataNode?.getAttribute('data-job-id');

    const link = element.matches('a[href*="/jobs/view/"]')
      ? element
      : element.querySelector('a[href*="/jobs/view/"]');

    const href = link?.getAttribute('href') || '';

    return extractJobId(dataJobId, href);
  }
})();