(() => {
  const {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    coerceKeywords,
    buildKeywordPatterns,
    hydrateSettings,
    getContrastColor,
  } = globalThis.JobHuntVisualizerShared;
  const {
    JOB_LIST_ANCESTOR_SELECTORS,
    findJobListContainer,
    findJobCardCandidates,
    findMultiCardAncestor,
    getJobCardElement,
  } = globalThis.JobHuntVisualizerDom;

  const JOB_DETAIL_SELECTORS = [
    '.jobs-search__job-details--container',
    '.jobs-details',
    '.jobs-box__html-content',
    '.jobs-description-content__text',
    '[data-sdui-screen*="SemanticJobDetails"]',
    '.job-details-jobs-unified-top-card__container--two-pane',
    '.jobs-unified-top-card',
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

  // Only specific footer selectors here. Broad tag names (p, span, li …) are
  // used in the slow-path of getStateBadgeElements, scoped to individual
  // card containers so we never query them across the full document.
  const JOB_STATE_BADGE_SELECTORS = [
    '.job-card-container__footer-job-state',
    '.job-card-container__footer-item',
    '.job-card-list__footer-wrapper li',
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
  const JOB_STATE_MATCH_PATTERNS = {
    viewed: [/^viewed(?:\b.*)?$/i],
    saved: [/^saved(?:\b.*)?$/i],
    applied: [
      /^applied(?:\b.*)?$/i,
      /^application submitted(?:\b.*)?$/i,
      /^already applied(?:\b.*)?$/i,
    ],
  };
  const STATE_BADGE_ATTRIBUTE = 'data-jhv-state-badge';
  const STATE_BADGE_ROW_ATTRIBUTE = 'data-jhv-state-badge-row';
  const COMPANY_STATS_ATTRIBUTE = 'data-jhv-company-stats';
  const COMPANY_STAT_ATTRIBUTE = 'data-jhv-company-stat';
  // Cached once at module load — querying mutation targets is hot-path work
  // and rebuilding the selector string on every call adds up on busy SPAs.
  const OWNED_MUTATION_SELECTOR = `mark[${MARK_ATTRIBUTE}], [${STATE_BADGE_ATTRIBUTE}], [${STATE_BADGE_ROW_ATTRIBUTE}], [${COMPANY_STATS_ATTRIBUTE}], [${COMPANY_STAT_ATTRIBUTE}]`;
  // Module-level constant so the title-anchor scan doesn't rebuild this set
  // on every job card processed.
  const TITLE_ANCHOR_IGNORED_TEXT = new Set([
    'applied',
    'viewed',
    'saved',
    'promoted',
    'easy apply',
  ]);
  const URL_POLL_INTERVAL_MS = 200;
  const LINKEDIN_PAGE = /(^|\.)linkedin\.com$/i.test(window.location.hostname);

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
  let messageListenerBound = false;
  let navigationHooksInstalled = false;
  let routeListenerBound = false;
  // Cheap "dirty" counter: bumped whenever something that could affect
  // highlighted output changes (storage, content mutations). The highlighter
  // compares against the counter it last rendered with — O(1) instead of
  // walking the entire page's textContent.
  let contentVersion = 0;
  let lastHighlightedVersion = -1;
  let lastHighlightedKeywordSig = '';
  let lastHighlightedPaused = null;
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
    if (messageListenerBound) {
      return;
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === 'job-hunt-visualizer:ping') {
        const stateCounts = countJobStates();

        sendResponse({
          ok: true,
          isLinkedInPage: isLinkedInPage(),
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
      }

      if (message?.type === 'job-hunt-visualizer:navigate-match') {
        sendResponse({
          ok: true,
          ...navigateMatch(message.direction < 0 ? -1 : 1),
        });

        return false;
      }

      return false;
    });

    messageListenerBound = true;
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
        markContentDirty();
        scheduleHighlight();
      }

      if (changes[STORAGE_KEYS.settings]) {
        settings = hydrateSettings(changes[STORAGE_KEYS.settings].newValue);
        markContentDirty();
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

    // popstate covers back/forward on every site.
    window.addEventListener('popstate', notify, { passive: true });

    // URL polling is only needed on LinkedIn: LinkedIn uses pushState heavily
    // for SPA navigation AND fingerprints history.pushState via
    // Function.prototype.toString, so we cannot patch it. Outside LinkedIn we
    // rely on popstate + storage events to avoid burning CPU on every site.
    if (LINKEDIN_PAGE) {
      let lastPollUrl = location.href;
      setInterval(() => {
        if (location.href !== lastPollUrl) {
          lastPollUrl = location.href;
          notify();
        }
      }, URL_POLL_INTERVAL_MS);
    }

    navigationHooksInstalled = true;
  }

  function handleRouteChange() {
    const nextRoute = `${window.location.pathname}${window.location.search}`;

    if (nextRoute === lastKnownRoute) {
      return;
    }

    lastKnownRoute = nextRoute;
    markContentDirty();
    scheduleBindingRefresh();
  }

  function startRootObserver() {
    if (rootObserver || !document.body) {
      return;
    }

    rootObserver = new MutationObserver((mutations) => {
      if (!hasExternalMutations(mutations)) {
        return;
      }

      markContentDirty();
      scheduleBindingRefresh();
    });

    rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function markContentDirty() {
    contentVersion += 1;
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
    const jobFeaturesEnabled = isJobsPage();
    const nextListContainer = jobFeaturesEnabled ? findJobListContainer() : null;
    const nextDetailContainer = jobFeaturesEnabled ? findJobDetailContainer() : null;
    fallbackHighlightRoot = findFallbackHighlightRoot();
    listRoots = jobFeaturesEnabled
      ? resolveListRoots(nextListContainer, fallbackHighlightRoot)
      : [];

    if (nextListContainer !== listContainer) {
      attachListSurface(nextListContainer);
    }

    if (nextDetailContainer !== detailContainer) {
      attachDetailSurface(nextDetailContainer);
    }

    if (settings.paused) {
      clearGhostStyles();
      clearAllHighlights();
      clearCompanyStats();
      return;
    }

    if (jobFeaturesEnabled) {
      renderCompanyStats();
      applyGhostStyles();
    } else {
      clearGhostStyles();
      clearCompanyStats();
    }

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

    listObserver = new MutationObserver((mutations) => {
      if (settings.paused || !hasExternalMutations(mutations)) {
        return;
      }

      markContentDirty();
      applyGhostStyles();
      scheduleHighlight();
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
      clearCompanyStats(detailContainer);
    }

    detailContainer = nextContainer;
    markContentDirty();

    if (!detailContainer) {
      return;
    }

    detailObserver = new MutationObserver((mutations) => {
      if (settings.paused || !hasExternalMutations(mutations)) {
        return;
      }

      markContentDirty();
      scheduleHighlight();
    });

    detailObserver.observe(detailContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleHighlight();
  }

  function applyGhostStyles() {
    const ghostRoots = getGhostRoots();
    const renderedStates = new Map();

    clearRenderedStateBadges(ghostRoots);

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
      renderedStates.set(card, primaryState);
    }

    renderStateBadges(renderedStates);
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

    clearRenderedStateBadges(ghostRoots);

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
      lastHighlightedVersion = contentVersion;
      lastHighlightedKeywordSig = keywordSignature();
      lastHighlightedPaused = settings.paused;
      return;
    }

    const nextKeywordSig = keywordSignature();

    // Cheap O(1) cache check: skip work if nothing relevant changed since the
    // last render. The version counter is bumped by mutation observers and
    // storage listeners — no textContent allocations involved.
    if (
      contentVersion === lastHighlightedVersion
      && nextKeywordSig === lastHighlightedKeywordSig
      && settings.paused === lastHighlightedPaused
    ) {
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

    lastHighlightedVersion = contentVersion;
    lastHighlightedKeywordSig = nextKeywordSig;
    lastHighlightedPaused = settings.paused;
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

  function keywordSignature() {
    return `${keywords.map((keyword) => `${keyword.normalized}:${keyword.color}`).join('|')}::${settings.paused}`;
  }

  function hasExternalMutations(mutations) {
    return mutations.some((mutation) => !isOwnedMutation(mutation));
  }

  function isOwnedMutation(mutation) {
    if (!mutation) {
      return false;
    }

    if (mutation.type === 'characterData') {
      return isOwnedNode(mutation.target?.parentElement || null);
    }

    if (mutation.type === 'attributes') {
      return isOwnedNode(mutation.target);
    }

    if (mutation.type !== 'childList') {
      return false;
    }

    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];

    if (changedNodes.length === 0) {
      return false;
    }

    return changedNodes.every((node) => isOwnedSubtree(node));
  }

  function isOwnedNode(node) {
    if (!node) {
      return false;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return isOwnedNode(node.parentElement || null);
    }

    if (!(node instanceof Element)) {
      return false;
    }

    return node.matches(OWNED_MUTATION_SELECTOR) || Boolean(node.closest(OWNED_MUTATION_SELECTOR));
  }

  function isOwnedSubtree(node) {
    if (!node) {
      return false;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return isOwnedNode(node.parentElement || null);
    }

    if (!(node instanceof Element)) {
      return false;
    }

    return node.matches(OWNED_MUTATION_SELECTOR) || Boolean(node.querySelector(OWNED_MUTATION_SELECTOR));
  }

  function clearRenderedStateBadges(roots = getGhostRoots()) {
    for (const root of roots) {
      if (!root || typeof root.querySelectorAll !== 'function') {
        continue;
      }

      for (const node of root.querySelectorAll(`[${STATE_BADGE_ROW_ATTRIBUTE}], [${STATE_BADGE_ATTRIBUTE}]`)) {
        node.remove();
      }
    }
  }

  function renderStateBadges(stateMap) {
    for (const [card, state] of stateMap.entries()) {
      const placement = findStateBadgePlacement(card);

      if (!(placement?.anchor instanceof Element)) {
        continue;
      }

      const row = document.createElement('div');
      row.setAttribute(STATE_BADGE_ROW_ATTRIBUTE, 'true');

      const badge = document.createElement('span');
      badge.setAttribute(STATE_BADGE_ATTRIBUTE, state);
      badge.textContent = formatJobStateLabel(state);
      row.append(badge);
      placement.anchor.insertAdjacentElement(placement.position, row);
    }
  }

  function findStateBadgePlacement(card) {
    if (!(card instanceof Element)) {
      return null;
    }

    const titleContainer = card.querySelector(
      '.artdeco-entity-lockup__title, [class*="entity-lockup__title"], .job-card-list__title'
    );

    if (titleContainer instanceof Element) {
      return {
        anchor: titleContainer,
        position: 'afterend',
      };
    }

    const link = card.querySelector('.job-card-container__link, a[href*="/jobs/view/"], a[href*="/jobs/collections/"]');

    if (link instanceof Element) {
      const linkContainer = link.closest('p, h1, h2, h3, h4, div, li, section, article');

      if (linkContainer instanceof Element && linkContainer !== card) {
        return {
          anchor: linkContainer,
          position: 'afterend',
        };
      }

      return {
        anchor: link,
        position: 'afterend',
      };
    }

    const cardTitleText = findStateBadgeTitleTextAnchor(card);

    if (cardTitleText instanceof Element) {
      return {
        anchor: cardTitleText,
        position: 'afterend',
      };
    }

    const content = card.querySelector('.artdeco-entity-lockup__content, [class*="entity-lockup__content"]');

    if (content instanceof Element) {
      const titleText = findStateBadgeTitleTextAnchor(content);

      if (titleText instanceof Element) {
        return {
          anchor: titleText,
          position: 'afterend',
        };
      }

      return {
        anchor: content,
        position: 'afterbegin',
      };
    }

    return {
      anchor: card,
      position: 'afterbegin',
    };
  }

  function findStateBadgeTitleTextAnchor(root) {
    for (const candidate of root.querySelectorAll('h1, h2, h3, h4, p')) {
      if (!(candidate instanceof Element)) {
        continue;
      }

      if (candidate.closest(
        '.job-card-container__footer, .job-card-container__footer-wrapper, .job-card-list__footer-wrapper, .job-card-list__insight, .job-card-list__actions-container, .job-card-container__metadata-wrapper, [data-jhv-state-badge-row]'
      )) {
        continue;
      }

      const normalized = normalizeInsightText(candidate.textContent);
      const lowered = normalized.toLocaleLowerCase();

      if (!normalized || TITLE_ANCHOR_IGNORED_TEXT.has(lowered) || /^[·•]+$/.test(normalized)) {
        continue;
      }

      return candidate;
    }

    return null;
  }

  function clearCompanyStats(root = document) {
    if (!root?.querySelectorAll) {
      return;
    }

    for (const node of root.querySelectorAll(`[${COMPANY_STATS_ATTRIBUTE}]`)) {
      node.remove();
    }
  }

  function renderCompanyStats() {
    clearCompanyStats();

    if (settings.paused) {
      return;
    }

    const context = resolveCompanyStatsContext();

    if (!context) {
      return;
    }

    const container = document.createElement('div');
    container.setAttribute(COMPANY_STATS_ATTRIBUTE, 'true');

    for (const item of context.items) {
      const stat = document.createElement('span');
      stat.setAttribute(COMPANY_STAT_ATTRIBUTE, item.kind);
      stat.textContent = item.text;
      container.append(stat);
    }

    context.insertion.anchor.insertAdjacentElement(context.insertion.position, container);
  }

  function resolveCompanyStatsContext() {
    for (const root of getCompanyStatsRoots()) {
      if (!root?.querySelectorAll) {
        continue;
      }

      const items = collectCompanyStats(root);

      if (items.length === 0) {
        continue;
      }

      const insertion = findCompanyStatsInsertion(root);

      if (!(insertion?.anchor instanceof Element)) {
        continue;
      }

      return {
        items,
        insertion,
      };
    }

    return null;
  }

  function collectCompanyStats(root) {
    const items = [];
    const seen = new Set();

    collectCompanyStatElements(root.querySelectorAll('.jobs-company__inline-information'), items, seen);

    if (items.length > 0) {
      return items;
    }

    const companySection = findSectionByHeadingText(root, 'about the company');

    if (!companySection) {
      return items;
    }

    collectCompanyStatElements(companySection.querySelectorAll('span, p, li, small, strong'), items, seen);

    return items;
  }

  function collectCompanyStatElements(elements, items, seen) {
    for (const element of elements) {
      const normalized = normalizeInsightText(element.textContent);
      const kind = getCompanyStatKind(normalized);

      if (!kind) {
        continue;
      }

      const key = `${kind}:${normalized.toLocaleLowerCase()}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      items.push({
        kind,
        text: normalized,
      });
    }
  }

  function getCompanyStatKind(text) {
    if (/employees?$/i.test(text)) {
      return 'company-size';
    }

    if (/on\s+linkedin$/i.test(text)) {
      return 'company-network';
    }

    return '';
  }

  function getCompanyStatsRoots() {
    const roots = [];

    const addRoot = (candidate) => {
      if (!(candidate instanceof Element) || roots.includes(candidate)) {
        return;
      }

      roots.push(candidate);
    };

    let current = detailContainer;

    while (current instanceof Element) {
      addRoot(current);
      current = current.parentElement;
    }

    addRoot(fallbackHighlightRoot);
    addRoot(findFallbackHighlightRoot());
    addRoot(document.body);

    return roots;
  }

  function findCompanyStatsInsertion(root) {
    const titleRow = root.querySelector('.display-flex.justify-space-between.flex-wrap.mt2');

    if (titleRow) {
      return {
        anchor: titleRow,
        position: 'afterend',
      };
    }

    const title = root.querySelector('.job-details-jobs-unified-top-card__job-title, h1');

    if (title) {
      return {
        anchor: title,
        position: 'afterend',
      };
    }

    const jobTitleLink = root.querySelector('a[href*="/jobs/view/"]');

    if (jobTitleLink instanceof Element) {
      const titleBlock = jobTitleLink.closest('p, h1, h2, h3, h4');
      const titleAnchor = getCompanyStatsTitleAnchor(titleBlock || jobTitleLink, root);

      return {
        anchor: titleAnchor,
        position: 'afterend',
      };
    }

    const firstHeading = root.querySelector('h2, h3');

    if (firstHeading) {
      return {
        anchor: firstHeading,
        position: 'beforebegin',
      };
    }

    const firstChild = root.firstElementChild;

    if (firstChild) {
      return {
        anchor: firstChild,
        position: 'beforebegin',
      };
    }

    return null;
  }

  function getCompanyStatsTitleAnchor(initialAnchor, root) {
    let anchor = initialAnchor;

    while (anchor instanceof Element && anchor.parentElement && anchor.parentElement !== root) {
      const parent = anchor.parentElement;

      if (parent.matches('[data-display-contents="true"]')) {
        anchor = parent;
        continue;
      }

      if (
        parent.childElementCount === 1 &&
        parent.firstElementChild === anchor &&
        parent.nextElementSibling instanceof Element
      ) {
        anchor = parent;
        continue;
      }

      break;
    }

    return anchor;
  }

  function findSectionByHeadingText(root, expectedText) {
    const normalizedExpected = normalizeInsightText(expectedText).toLocaleLowerCase();

    for (const heading of root.querySelectorAll('h1, h2, h3, h4')) {
      if (normalizeInsightText(heading.textContent).toLocaleLowerCase() !== normalizedExpected) {
        continue;
      }

      let candidate = heading.parentElement;

      while (candidate instanceof Element) {
        if (countCompanyStatKinds(candidate) >= 2) {
          return candidate;
        }

        if (candidate === root || candidate === document.body) {
          break;
        }

        candidate = candidate.parentElement;
      }

      return heading.parentElement;
    }

    return null;
  }

  function countCompanyStatKinds(root) {
    const kinds = new Set();

    for (const element of root.querySelectorAll('span, p, li, small, strong')) {
      const kind = getCompanyStatKind(normalizeInsightText(element.textContent));

      if (kind) {
        kinds.add(kind);
      }
    }

    return kinds.size;
  }

  function normalizeInsightText(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .replace(/[·•]+/g, ' ')
      .trim();
  }

  function formatJobStateLabel(state) {
    if (!state) {
      return '';
    }

    return `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
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

  function getMatchingJobState(text) {
    const normalized = normalizeInsightText(text).toLocaleLowerCase();

    if (!normalized) {
      return '';
    }

    for (const state of JOB_STATE_LABELS) {
      if (JOB_STATE_MATCH_PATTERNS[state].some((pattern) => pattern.test(normalized))) {
        return state;
      }
    }

    return '';
  }

  function getStateBadgeElements(root, state) {
    const badges = [];

    // Fast path: specific LinkedIn footer selectors — stable and cheap.
    for (const candidate of root.querySelectorAll(JOB_STATE_BADGE_SELECTORS.join(', '))) {
      if (getMatchingJobState(candidate.textContent) === state) {
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
        if (getMatchingJobState(el.textContent) === state) {
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

  function isLinkedInPage() {
    return LINKEDIN_PAGE;
  }

  function isJobsPage() {
    if (!isLinkedInPage()) {
      return false;
    }

    return /^\/jobs(\/|$)/.test(window.location.pathname);
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
})();
