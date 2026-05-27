(function bootstrapShared(globalScope) {
  const STORAGE_KEYS = {
    keywords: 'keywords',
    settings: 'settings',
  };

  const LINKEDIN_HOST_PATTERNS = ['https://www.linkedin.com/*'];
  const OPTIONAL_SITE_ACCESS_PATTERNS = ['http://*/*', 'https://*/*'];
  const OPTIONAL_CONTENT_SCRIPT_ID = 'job-hunt-visualizer-global-sites';
  const CONTENT_SCRIPT_FILES = ['shared.js', 'dom-heuristics.js', 'content.js'];
  const CONTENT_STYLE_FILES = ['styles.css'];

  const DEFAULT_SETTINGS = {
    paused: false,
    historyLimit: 2000,
    highlightAllSites: false,
    dimStates: {
      viewed: true,
      saved: true,
      applied: true,
    },
  };

  const DEFAULT_COLORS = [
    '#FFE082',
    '#A5D6A7',
    '#81D4FA',
    '#F8BBD0',
    '#CE93D8',
    '#FFCC80',
    '#80CBC4',
    '#BCAAA4',
  ];

  function normalizeTerm(value) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed && trimmed.length <= 120 ? trimmed : '';
  }

  function splitKeywordTerms(value) {
    if (typeof value !== 'string') {
      return [];
    }

    const seenTerms = new Set();

    // Accept newline- and comma-separated lists so users can paste from either
    // bullet lists or CSV-style sources without manual reformatting.
    return value
      .split(/[\r\n,]+/)
      .map((entry) => normalizeTerm(entry))
      .filter(Boolean)
      .filter((entry) => {
        const normalized = entry.toLocaleLowerCase();

        if (seenTerms.has(normalized)) {
          return false;
        }

        seenTerms.add(normalized);
        return true;
      });
  }

  function sanitizeColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : '';
  }

  function pickColor(index, palette = DEFAULT_COLORS) {
    return palette[index % palette.length];
  }

  function createKeywordId(normalizedTerm) {
    return `kw:${encodeURIComponent(normalizedTerm)}`;
  }

  function createKeywordRecord(term, options = {}) {
    const cleanTerm = normalizeTerm(term);

    if (!cleanTerm) {
      return null;
    }

    const normalized = cleanTerm.toLocaleLowerCase();
    const palette = Array.isArray(options.defaultColors) && options.defaultColors.length
      ? options.defaultColors
      : DEFAULT_COLORS;

    return {
      id: typeof options.id === 'string' && options.id ? options.id : createKeywordId(normalized),
      term: cleanTerm,
      normalized,
      color: sanitizeColor(options.color) || pickColor(options.index || 0, palette),
      enabled: options.enabled !== false,
    };
  }

  function coerceKeywords(rawKeywords, options = {}) {
    if (!Array.isArray(rawKeywords)) {
      return [];
    }

    const seenTerms = new Set();

    return rawKeywords
      .map((entry, index) => {
        if (typeof entry === 'string') {
          return createKeywordRecord(entry, {
            index,
            defaultColors: options.defaultColors,
          });
        }

        if (!entry || typeof entry.term !== 'string') {
          return null;
        }

        return createKeywordRecord(entry.term, {
          id: entry.id,
          color: entry.color,
          enabled: entry.enabled,
          index,
          defaultColors: options.defaultColors,
        });
      })
      .filter(Boolean)
      .filter((entry) => {
        if (seenTerms.has(entry.normalized)) {
          return false;
        }

        seenTerms.add(entry.normalized);
        return true;
      });
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildLiteralRegex(term) {
    const escapedTerm = escapeRegex(term);
    // Use Array.from so surrogate pairs (emoji / astral characters) are
    // treated as a single code point when checking word boundaries.
    const codePoints = Array.from(term);
    const firstCodePoint = codePoints[0] || '';
    const lastCodePoint = codePoints[codePoints.length - 1] || '';
    const startsWithAlphaNumeric = /[\p{L}\p{N}]/u.test(firstCodePoint);
    const endsWithAlphaNumeric = /[\p{L}\p{N}]/u.test(lastCodePoint);
    const prefix = startsWithAlphaNumeric ? '(?<![\\p{L}\\p{N}])' : '';
    const suffix = endsWithAlphaNumeric ? '(?![\\p{L}\\p{N}])' : '';
    return new RegExp(`${prefix}${escapedTerm}${suffix}`, 'giu');
  }

  function buildKeywordPatterns(entries, options = {}) {
    return [...coerceKeywords(entries, options)]
      .filter((entry) => entry.enabled !== false)
      .sort((left, right) => right.term.length - left.term.length)
      .map((entry, index) => ({
        ...entry,
        color: sanitizeColor(entry.color) || pickColor(index, options.defaultColors),
        regex: buildLiteralRegex(entry.term),
      }));
  }

  function getContrastColor(hexColor) {
    const value = sanitizeColor(hexColor) || DEFAULT_COLORS[0];
    const hex = value.slice(1);
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
    return brightness >= 155 ? '#111111' : '#FFFFFF';
  }

  function extractJobId(dataJobId, href = '') {
    if (typeof dataJobId === 'string' && dataJobId.trim()) {
      return dataJobId.trim();
    }

    const hrefMatch = typeof href === 'string' ? href.match(/\/jobs\/view\/(\d+)/i) : null;
    return hrefMatch ? hrefMatch[1] : '';
  }

  function hydrateSettings(rawSettings) {
    const nextSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const historyLimit = Number.isFinite(nextSettings.historyLimit) && nextSettings.historyLimit > 0
      ? Math.floor(nextSettings.historyLimit)
      : DEFAULT_SETTINGS.historyLimit;
    const nextDimStates = nextSettings.dimStates && typeof nextSettings.dimStates === 'object'
      ? nextSettings.dimStates
      : {};

    return {
      ...DEFAULT_SETTINGS,
      ...nextSettings,
      paused: Boolean(nextSettings.paused),
      historyLimit,
      highlightAllSites: Boolean(nextSettings.highlightAllSites),
      dimStates: {
        viewed: 'viewed' in nextDimStates ? Boolean(nextDimStates.viewed) : DEFAULT_SETTINGS.dimStates.viewed,
        saved: 'saved' in nextDimStates ? Boolean(nextDimStates.saved) : DEFAULT_SETTINGS.dimStates.saved,
        applied: 'applied' in nextDimStates ? Boolean(nextDimStates.applied) : DEFAULT_SETTINGS.dimStates.applied,
      },
    };
  }

  function upsertKeyword(rawKeywords, term, color, options = {}) {
    const keywords = coerceKeywords(rawKeywords, options);
    const cleanTerm = normalizeTerm(term);

    if (!cleanTerm) {
      return { keywords, added: false };
    }

    const normalized = cleanTerm.toLocaleLowerCase();

    if (keywords.some((keyword) => keyword.normalized === normalized)) {
      return { keywords, added: false };
    }

    return {
      keywords: [
        ...keywords,
        createKeywordRecord(cleanTerm, {
          color,
          index: keywords.length,
          defaultColors: options.defaultColors,
        }),
      ],
      added: true,
    };
  }

  function removeKeywordById(rawKeywords, keywordId, options = {}) {
    return coerceKeywords(rawKeywords, options).filter((keyword) => keyword.id !== keywordId);
  }

  function updateKeywordColor(rawKeywords, keywordId, nextColor, options = {}) {
    const color = sanitizeColor(nextColor);

    if (!keywordId || !color) {
      return coerceKeywords(rawKeywords, options);
    }

    return coerceKeywords(rawKeywords, options).map((keyword) => {
      if (keyword.id !== keywordId) {
        return keyword;
      }

      return {
        ...keyword,
        color,
      };
    });
  }

  function toggleKeywordEnabled(rawKeywords, keywordId, options = {}) {
    if (!keywordId) {
      return coerceKeywords(rawKeywords, options);
    }

    return coerceKeywords(rawKeywords, options).map((keyword) => {
      if (keyword.id !== keywordId) {
        return keyword;
      }

      return {
        ...keyword,
        enabled: !keyword.enabled,
      };
    });
  }

  const shared = {
    STORAGE_KEYS,
    LINKEDIN_HOST_PATTERNS,
    OPTIONAL_SITE_ACCESS_PATTERNS,
    OPTIONAL_CONTENT_SCRIPT_ID,
    CONTENT_SCRIPT_FILES,
    CONTENT_STYLE_FILES,
    DEFAULT_SETTINGS,
    DEFAULT_COLORS,
    normalizeTerm,
    splitKeywordTerms,
    sanitizeColor,
    coerceKeywords,
    buildLiteralRegex,
    buildKeywordPatterns,
    getContrastColor,
    extractJobId,
    hydrateSettings,
    upsertKeyword,
    removeKeywordById,
    updateKeywordColor,
    toggleKeywordEnabled,
  };

  globalScope.JobHuntVisualizerShared = shared;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = shared;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
