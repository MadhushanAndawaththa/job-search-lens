(() => {
  const {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    coerceKeywords,
    buildKeywordPatterns,
    hydrateSettings,
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

  const PAGE_CONTENT_SELECTORS = [
    '[role="main"]',
    'main',
    '.scaffold-layout__main',
    '.jobs-home-scalable-two-pane__container',
    '.base-main',
  ];

  // LinkedIn renders job cards in multiple shapes. Keep candidate queries broad
  // enough to cover both search-page variants and the main jobs page, but only
  // fall back to anchors after trying stronger wrapper selectors first.
  const JOB_CARD_QUERY_SELECTORS = [
    '[componentkey^="job-card-component-ref"]',
    'div[componentkey]',
    '[data-job-id]',
    '.job-card-container',
    '.jobs-search-results__list-item',
    '.artdeco-list__item',
    '[role="listitem"]',
    'article',
    'li',
    'a[href*="/jobs/collections/"]',
    'a[href*="/jobs/view/"]',
  ];

  // Only specific footer selectors here. Broad tag names (p, span, li …) are
  // used in the slow-path of getStateBadgeElements, scoped to individual
  // card containers so we never query them across the full document.
  const JOB_STATE_BADGE_SELECTORS = [
    '.job-card-container__footer-job-state',
    '.job-card-container__footer-item',
    '.job-card-list__footer-wrapper li',
  ];

  const JOB_CARD_CONTAINER_SELECTORS = [
    '[componentkey^="job-card-component-ref"]',
    'div[componentkey]',
    '[data-job-id]',
    '.job-card-container',
    '.jobs-search-results__list-item',
    '.artdeco-list__item',
    '[role="listitem"]',
    'article',
    'li',
  ];

  const JOB_CARD_LINK_SELECTORS = [
    'a[href*="/jobs/collections/"]',
    'a[href*="/jobs/view/"]',
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
  // A single data attribute carries the dim state so we never mutate LinkedIn's
  // own class list — adding unexpected class names to their components is a
  // known detection vector because LinkedIn observes class mutations.
  const GHOST_DATA_ATTR = 'data-jhv-state';
  const ACTIVE_MARK_CLASS_NAME = 'job-hunt-visualizer-mark-active';
  const JOB_STATE_PRIORITY = ['applied', 'saved', 'viewed'];
  const JOB_STATE_LABELS = ['viewed', 'saved', 'applied'];

  let keywords = [];
  let keywordPatterns = [];
  let settings = { ...DEFAULT_SETTINGS };
  let currentMatchIndex = -1;

  let listContainer = null;
  let listRoots = [];
  let detailContainer = null;
  let listObserver = null;
  let detailObserver = null;
  let rootObserver = null;
  let fallbackHighlightRoot = null;
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
    bindMessageListener();
    await loadState();
    bindStorageListener();
    startRootObserver();
    refreshBindings();
  }

  function bindMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== 'job-hunt-visualizer:ping') {
        return false;
      }

      const stateCounts = countJobStates();

      sendResponse({
        ok: true,
        isJobsPage: isJobsPage(),
        route: `${window.location.pathname}${window.location.search}`,
        hasListContainer: Boolean(listRoots.length || listContainer || findJobListContainer()),
        hasDetailContainer: Boolean(detailContainer || findJobDetailContainer()),
        hasFallbackRoot: Boolean(findFallbackHighlightRoot()),
        keywordCount: keywords.length,
        viewedCount: stateCounts.viewed,
        stateCounts,
        matchCount: getHighlightMarks().length,
        activeMatchIndex: getActiveMatchIndex(),
        paused: settings.paused,
      });

      return false;
    });
  }

  async function loadState() {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.keywords,
      STORAGE_KEYS.settings,
    ]);

    keywords = coerceKeywords(stored[STORAGE_KEYS.keywords]);
    keywordPatterns = buildKeywordPatterns(keywords);
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

    // Avoid patching history.pushState / replaceState: LinkedIn fingerprints
    // those methods via Function.prototype.toString and stops rendering when it
    // detects they are no longer native. Poll the URL at a low frequency instead
    // so SPA navigations are still caught without touching any native method.
    let lastPollUrl = location.href;
    setInterval(() => {
      if (location.href !== lastPollUrl) {
        lastPollUrl = location.href;
        notify();
      }
    }, 200);

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
      clearAllHighlights();
      disconnectSurfaceObservers();
      listContainer = null;
      listRoots = [];
      detailContainer = null;
      return;
    }

    const nextListContainer = findJobListContainer();
    const nextDetailContainer = findJobDetailContainer();
    fallbackHighlightRoot = findFallbackHighlightRoot();
    listRoots = resolveListRoots(nextListContainer, fallbackHighlightRoot);

    if (nextListContainer !== listContainer) {
      attachListSurface(nextListContainer);
    }

    if (nextDetailContainer !== detailContainer) {
      attachDetailSurface(nextDetailContainer);
    }

    if (settings.paused) {
      clearGhostStyles();
      clearAllHighlights();
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

    listContainer = nextContainer;

    if (!listContainer) {
      return;
    }

    listObserver = new MutationObserver(() => {
      if (!settings.paused) {
        applyGhostStyles();
        scheduleHighlight();
      }
    });

    listObserver.observe(listContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
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
  }

  function applyGhostStyles() {
    const ghostRoots = getGhostRoots();

    if (ghostRoots.length === 0) {
      return;
    }

    for (const ghostRoot of ghostRoots) {
      for (const staleCard of ghostRoot.querySelectorAll(`[${GHOST_DATA_ATTR}]`)) {
        staleCard.removeAttribute(GHOST_DATA_ATTR);
      }
    }

    if (settings.paused) {
      return;
    }

    const stateMap = new Map();

    for (const ghostRoot of ghostRoots) {
      for (const [card, states] of getJobCardStateMap(ghostRoot).entries()) {
        if (!stateMap.has(card)) {
          stateMap.set(card, []);
        }

        const existingStates = stateMap.get(card);

        for (const state of states) {
          if (!existingStates.includes(state)) {
            existingStates.push(state);
          }
        }
      }
    }

    for (const [card, states] of stateMap.entries()) {
      const enabledStates = states.filter((state) => settings.dimStates?.[state]);

      if (enabledStates.length === 0) {
        continue;
      }

      const primaryState = getPrimaryJobState(enabledStates);

      card.setAttribute(GHOST_DATA_ATTR, primaryState);
    }
  }

  function countJobStates() {
    const ghostRoots = getGhostRoots();
    const counts = {
      viewed: 0,
      saved: 0,
      applied: 0,
    };

    if (ghostRoots.length === 0) {
      return counts;
    }

    for (const ghostRoot of ghostRoots) {
      for (const states of getJobCardStateMap(ghostRoot).values()) {
        for (const state of states) {
          counts[state] += 1;
        }
      }
    }

    return counts;
  }

  function clearGhostStyles() {
    const ghostRoots = getGhostRoots();

    if (ghostRoots.length === 0) {
      return;
    }

    for (const ghostRoot of ghostRoots) {
      for (const node of ghostRoot.querySelectorAll(`[${GHOST_DATA_ATTR}]`)) {
        node.removeAttribute(GHOST_DATA_ATTR);
      }
    }
  }

  function getGhostRoots() {
    if (listRoots.length > 0) {
      return listRoots;
    }

    if (listContainer) {
      return [listContainer];
    }

    if (fallbackHighlightRoot) {
      return [fallbackHighlightRoot];
    }

    if (document.body) {
      return [document.body];
    }

    return [];
  }

  function resolveListRoots(listRoot, pageRoot) {
    if (!(listRoot instanceof Element)) {
      return [];
    }

    const roots = [];

    const addRoot = (candidate) => {
      if (!(candidate instanceof Element)) {
        return;
      }

      for (const existing of roots) {
        if (existing === candidate || existing.contains(candidate)) {
          return;
        }
      }

      for (let index = roots.length - 1; index >= 0; index -= 1) {
        if (candidate.contains(roots[index])) {
          roots.splice(index, 1);
        }
      }

      roots.push(candidate);
    };

    addRoot(listRoot);

    if (!(pageRoot instanceof Element) || pageRoot === listRoot || !pageRoot.contains(listRoot)) {
      return roots;
    }

    // Discovery/collection pages can split results across multiple independent
    // lists. Promote only the additional card-section ancestors, not the whole
    // page, so LinkedIn keeps rendering normally while every job group is still
    // covered by dimming and highlights.
    for (const card of findJobCardCandidates(pageRoot)) {
      if (listRoot.contains(card)) {
        continue;
      }

      let sectionRoot = null;

      for (const selector of JOB_LIST_ANCESTOR_SELECTORS) {
        sectionRoot = card.closest(selector);

        if (sectionRoot && pageRoot.contains(sectionRoot)) {
          break;
        }
      }

      if ((!sectionRoot || !pageRoot.contains(sectionRoot)) && card instanceof Element) {
        sectionRoot = findMultiCardAncestor(card);
      }

      if (sectionRoot && pageRoot.contains(sectionRoot)) {
        addRoot(sectionRoot);
      }
    }

    return roots;
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
    const roots = getHighlightRoots();

    if (roots.length === 0) {
      currentMatchIndex = -1;
      return;
    }

    if (settings.paused || keywordPatterns.length === 0) {
      clearAllHighlights();
      currentMatchIndex = -1;
      lastHighlightSignature = createHighlightSignature();
      return;
    }

    const nextSignature = createHighlightSignature();

    if (nextSignature === lastHighlightSignature) {
      return;
    }

    clearAllHighlights();

    for (const root of roots) {
      const textNodes = collectHighlightableTextNodes(root);

      for (const textNode of textNodes) {
        highlightTextNode(textNode);
      }
    }

    syncActiveMatch(false);

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

  function clearAllHighlights() {
    for (const root of getHighlightRoots()) {
      clearHighlights(root);
    }
  }

  function getHighlightMarks() {
    const marks = [];

    for (const root of getHighlightRoots()) {
      marks.push(...root.querySelectorAll(`mark[${MARK_ATTRIBUTE}]`));
    }

    return marks;
  }

  function getActiveMatchIndex() {
    const matchCount = getHighlightMarks().length;

    if (matchCount === 0) {
      return -1;
    }

    if (currentMatchIndex < 0 || currentMatchIndex >= matchCount) {
      return 0;
    }

    return currentMatchIndex;
  }

  function syncActiveMatch(shouldScroll) {
    const marks = getHighlightMarks();

    if (marks.length === 0) {
      currentMatchIndex = -1;
      return;
    }

    if (currentMatchIndex < 0 || currentMatchIndex >= marks.length) {
      currentMatchIndex = 0;
    }

    for (const [index, mark] of marks.entries()) {
      mark.classList.toggle(ACTIVE_MARK_CLASS_NAME, index === currentMatchIndex);
    }

    if (shouldScroll) {
      marks[currentMatchIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }

  function navigateMatch(direction) {
    const marks = getHighlightMarks();

    if (marks.length === 0) {
      currentMatchIndex = -1;
      return {
        matchCount: 0,
        activeMatchIndex: -1,
      };
    }

    if (currentMatchIndex < 0 || currentMatchIndex >= marks.length) {
      currentMatchIndex = direction < 0 ? marks.length - 1 : 0;
    } else {
      currentMatchIndex = (currentMatchIndex + direction + marks.length) % marks.length;
    }

    syncActiveMatch(true);

    return {
      matchCount: marks.length,
      activeMatchIndex: currentMatchIndex,
    };
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
    const rootSignature = getHighlightRoots()
      .map((root) => root.textContent || '')
      .join('||');

    const keywordSignature = keywords
      .map((keyword) => `${keyword.normalized}:${keyword.color}`)
      .join('|');

    return `${rootSignature}::${keywordSignature}::${settings.paused}`;
  }

  function getHighlightRoots() {
    const roots = [];

    for (const root of getGhostRoots()) {
      roots.push(root);
    }

    if (detailContainer && !roots.some((root) => root === detailContainer || root.contains(detailContainer))) {
      roots.push(detailContainer);
    }

    if (roots.length === 0 && fallbackHighlightRoot) {
      roots.push(fallbackHighlightRoot);
    }

    return roots;
  }

  function getPrimaryJobState(states) {
    for (const state of JOB_STATE_PRIORITY) {
      if (states.includes(state)) {
        return state;
      }
    }

    return states[0] || 'viewed';
  }

  function getStateBadgeElements(root, state) {
    const badges = [];

    // Fast path: specific LinkedIn footer selectors — stable and cheap.
    for (const candidate of root.querySelectorAll(JOB_STATE_BADGE_SELECTORS.join(', '))) {
      if ((candidate.textContent || '').trim().toLocaleLowerCase() === state) {
        badges.push(candidate);
      }
    }

    if (badges.length > 0) {
      return badges;
    }

    // Slow path: resolve likely job cards first, then scan only inside those
    // cards so we still avoid a full-document inline-tag query.
    for (const card of findJobCardCandidates(root)) {
      for (const el of card.querySelectorAll('p, span, li, small, strong, mark')) {
        if ((el.textContent || '').trim().toLocaleLowerCase() === state) {
          badges.push(el);
        }
      }
    }

    return badges;
  }

  function getJobCardStateMap(root) {
    const stateMap = new Map();

    for (const state of JOB_STATE_LABELS) {
      for (const badge of getStateBadgeElements(root, state)) {
        const card = getJobCardElement(badge);

        if (!card) {
          continue;
        }

        if (!stateMap.has(card)) {
          stateMap.set(card, []);
        }

        const states = stateMap.get(card);

        if (!states.includes(state)) {
          states.push(state);
        }
      }
    }

    return stateMap;
  }

  function isJobsPage() {
    return /^\/jobs(\/|$)/.test(window.location.pathname);
  }

  function findJobListContainer() {
    // Class/attribute-based selectors — only use them if they actually contain
    // at least one job card. This prevents accidentally returning a filter-chip
    // <ul> or pagination container that matches the selector but has no cards.
    for (const selector of JOB_LIST_SELECTORS) {
      const container = document.querySelector(selector);

      if (container && findJobCardCandidates(container, 1).length > 0) {
        return container;
      }
    }

    // Walk up from a known card. Most reliable for any LinkedIn UI version.
    const anyCard = findJobCardCandidates(document, 1)[0];

    if (anyCard) {
      for (const selector of JOB_LIST_ANCESTOR_SELECTORS) {
        const container = anyCard.closest(selector);

        if (container) {
          return container;
        }
      }

      // Final reliable fallback: find the ancestor that wraps multiple cards.
      // This works for the new hashed-class search UI where no stable selector
      // matches the outer container.
      return findMultiCardAncestor(anyCard);
    }

    return null;
  }

  function findMultiCardAncestor(card) {
    let ancestor = card.parentElement;

    while (ancestor && ancestor !== document.body) {
      if (findJobCardCandidates(ancestor, 2).length > 1) {
        return ancestor;
      }

      ancestor = ancestor.parentElement;
    }

    // Fall back to the immediate parent if only one card is visible yet.
    return card.parentElement || null;
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

  function findFallbackHighlightRoot() {
    for (const selector of PAGE_CONTENT_SELECTORS) {
      const container = document.querySelector(selector);

      if (container) {
        return container;
      }
    }

    return document.body || null;
  }

  function findJobCardCandidates(root, limit = Number.POSITIVE_INFINITY) {
    const cards = [];
    const seen = new Set();

    for (const selector of JOB_CARD_QUERY_SELECTORS) {
      for (const candidate of root.querySelectorAll(selector)) {
        const card = getJobCardElement(candidate);

        if (!card || seen.has(card)) {
          continue;
        }

        seen.add(card);
        cards.push(card);

        if (cards.length >= limit) {
          return cards;
        }
      }
    }

    return cards;
  }

  function getJobCardElement(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    let fallbackLink = null;
    let current = target;

    while (current && current !== document.body) {
      if (matchesAnySelector(current, JOB_CARD_CONTAINER_SELECTORS) && isLikelyJobCard(current)) {
        return getVisualJobCardElement(current);
      }

      if (!fallbackLink && matchesAnySelector(current, JOB_CARD_LINK_SELECTORS) && isLikelyJobCard(current)) {
        fallbackLink = current;
      }

      current = current.parentElement;
    }

    return fallbackLink ? getVisualJobCardElement(fallbackLink) : null;
  }

  function getVisualJobCardElement(card) {
    if (!(card instanceof Element)) {
      return null;
    }

    // Collection/discovery layouts can render the interactive card inside a
    // larger list-item wrapper. Promote to that wrapper so fading spans the
    // whole tile instead of only the inner content column.
    const wrapper = card.parentElement?.closest(
      '.jobs-search-results__list-item, .artdeco-list__item, [role="listitem"], article, li'
    );

    if (!wrapper || wrapper === card) {
      return card;
    }

    const dismissButtons = wrapper.querySelectorAll(
      'button[aria-label*="Dismiss"][aria-label*=" job"]'
    ).length;
    const nestedCards = wrapper.querySelectorAll(
      '[componentkey^="job-card-component-ref"], div[componentkey], [data-job-id], .job-card-container'
    ).length;

    if (dismissButtons === 1 && nestedCards === 1 && isLikelyJobCard(wrapper)) {
      return wrapper;
    }

    return card;
  }

  function isLikelyJobCard(element) {
    if (!(element instanceof Element) || element.matches('button, [role="button"]')) {
      return false;
    }

    if (element.matches('[componentkey^="job-card-component-ref"], [data-job-id], .job-card-container')) {
      return true;
    }

    const hasDismissButton = Boolean(element.querySelector('button[aria-label*="Dismiss"][aria-label*=" job"]'));

    if (element.matches('div[componentkey]')) {
      return hasDismissButton;
    }

    if (matchesAnySelector(element, JOB_CARD_LINK_SELECTORS)) {
      return true;
    }

    if (element.matches('.jobs-search-results__list-item, .artdeco-list__item, [role="listitem"], article, li')) {
      return hasDismissButton || Boolean(
        element.querySelector('[componentkey], [data-job-id], .job-card-container, a[href*="/jobs/view/"], a[href*="/jobs/collections/"]')
      );
    }

    return false;
  }

  function matchesAnySelector(element, selectors) {
    return selectors.some((selector) => element.matches(selector));
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'job-hunt-visualizer:navigate-match') {
      return false;
    }

    sendResponse({
      ok: true,
      ...navigateMatch(message.direction < 0 ? -1 : 1),
    });

    return false;
  });
})();