(function bootstrapDomHeuristics(globalScope) {
  const JOB_LIST_SELECTORS = [
    '.jobs-search-results-list',
    '.jobs-search-results__list',
    '.jobs-search-results-list__list',
    '.scaffold-layout__list-container',
    '[data-results-list-top-scroll-sentinel] + ul',
    '[data-view-name="search-results"] ul',
  ];

  const JOB_CARD_QUERY_SELECTORS = [
    '[componentkey^="job-card-component-ref"]',
    'div[componentkey]',
    '[data-job-id]',
    '.job-card-container',
    '.scaffold-layout__list-item',
    '.jobs-search-results__list-item',
    '.artdeco-list__item',
    '[role="listitem"]',
    'article',
    'li',
    'a[href*="/jobs/collections/"]',
    'a[href*="/jobs/view/"]',
  ];

  const JOB_CARD_CONTAINER_SELECTORS = [
    '[componentkey^="job-card-component-ref"]',
    'div[componentkey]',
    '[data-job-id]',
    '.job-card-container',
    '.scaffold-layout__list-item',
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

  function isElement(node) {
    return Boolean(
      node
      && node.nodeType === 1
      && typeof node.matches === 'function'
      && typeof node.querySelectorAll === 'function'
    );
  }

  function getBody(node) {
    if (node?.ownerDocument?.body) {
      return node.ownerDocument.body;
    }

    if (typeof document !== 'undefined') {
      return document.body;
    }

    return null;
  }

  function matchesAnySelector(element, selectors) {
    return isElement(element) && selectors.some((selector) => element.matches(selector));
  }

  function isLikelyJobCard(element) {
    if (!isElement(element) || element.matches('button, [role="button"]')) {
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

    if (element.matches('.scaffold-layout__list-item, .jobs-search-results__list-item, .artdeco-list__item, [role="listitem"], article, li')) {
      return hasDismissButton || Boolean(
        element.querySelector('[componentkey], [data-job-id], .job-card-container, a[href*="/jobs/view/"], a[href*="/jobs/collections/"]')
      );
    }

    return false;
  }

  function getVisualJobCardElement(card) {
    if (!isElement(card)) {
      return null;
    }

    const wrapper = card.parentElement?.closest(
      '.scaffold-layout__list-item, .jobs-search-results__list-item, .artdeco-list__item, [role="listitem"], article, li'
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

  function getJobCardElement(target) {
    if (!isElement(target)) {
      return null;
    }

    let fallbackLink = null;
    let current = target;
    const body = getBody(target);

    while (current && current !== body) {
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

  function findJobCardCandidates(root, limit = Number.POSITIVE_INFINITY) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return [];
    }

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

  function hasJobCards(root, minimumCount = 1) {
    return isElement(root) && findJobCardCandidates(root, minimumCount).length >= minimumCount;
  }

  function findListLikeAncestor(element) {
    let ancestor = element?.parentElement || null;
    const body = getBody(element);

    while (ancestor && ancestor !== body) {
      if (matchesAnySelector(ancestor, JOB_LIST_ANCESTOR_SELECTORS) && hasJobCards(ancestor, 1)) {
        return ancestor;
      }

      ancestor = ancestor.parentElement;
    }

    return null;
  }

  function findMultiCardAncestor(card) {
    let ancestor = card?.parentElement || null;
    const body = getBody(card);

    while (ancestor && ancestor !== body) {
      if (findJobCardCandidates(ancestor, 2).length > 1) {
        return ancestor;
      }

      ancestor = ancestor.parentElement;
    }

    return card?.parentElement || null;
  }

  function findJobListContainer(root = document) {
    if (!root || typeof root.querySelector !== 'function') {
      return null;
    }

    for (const selector of JOB_LIST_SELECTORS) {
      const container = root.querySelector(selector);

      if (hasJobCards(container, 1)) {
        return container;
      }
    }

    const anyCard = findJobCardCandidates(root, 1)[0];

    if (!anyCard) {
      return null;
    }

    const multiCardAncestor = findMultiCardAncestor(anyCard);

    if (hasJobCards(multiCardAncestor, 2)) {
      return multiCardAncestor;
    }

    const listAncestor = findListLikeAncestor(anyCard);

    if (listAncestor) {
      return listAncestor;
    }

    if (hasJobCards(multiCardAncestor, 1)) {
      return multiCardAncestor;
    }

    return null;
  }

  const domHeuristics = {
    JOB_LIST_ANCESTOR_SELECTORS,
    getJobCardElement,
    findJobCardCandidates,
    findMultiCardAncestor,
    findJobListContainer,
  };

  globalScope.JobHuntVisualizerDom = domHeuristics;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = domHeuristics;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);