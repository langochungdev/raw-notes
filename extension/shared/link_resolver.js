const SOCIAL_SELECTORS = [
  "article",
  "[role='article']",
  "[data-testid='tweet']",
  "[data-urn]",
  "[data-id]",
  "[data-pagelet^='FeedUnit_']"
];

const SOCIAL_URL_PATTERNS = [
  /\/status\/(\d+)/i,
  /\/posts\//i,
  /\/post\//i,
  /\/story\.php/i,
  /\/permalink\//i,
  /\/p\//i,
  /\/reel\//i,
  /\/watch\?v=/i,
  /\/video\//i,
  /\/videos\//i,
  /urn:li:activity:/i,
  /fbid=/i,
  /\/photo\/\?fbid=/i
];

const isSocialFeed = (url) => {
  return /facebook\.com|twitter\.com|x\.com|instagram\.com|threads\.net|linkedin\.com/i.test(url);
};

const getClosestElement = (node) => {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node;
  return node.parentElement;
};

const getAnchors = (element) => {
  if (!element || !element.querySelectorAll) return [];
  return Array.from(element.querySelectorAll("a[href]"));
};

const pickSocialLink = (element, currentUrl, strictPatternOnly = false) => {
  const anchors = getAnchors(element);
  let bestMatch = null;
  
  for (const anchor of anchors) {
    const href = anchor.href;
    if (!href || href === currentUrl) continue;
    
    if (SOCIAL_URL_PATTERNS.some((pattern) => pattern.test(href))) {
      return href;
    }
    
    if (!strictPatternOnly) {
      try {
        const urlObj = new URL(href);
        if (urlObj.pathname.split('/').filter(Boolean).length > 1) {
          if (!bestMatch) bestMatch = href;
        }
      } catch (e) {
      }
    }
  }
  return bestMatch;
};

export const resolveSource = (selection, options = {}) => {
  const doc =
    options.doc || (typeof document !== "undefined" ? document : null);
  const currentUrl = options.currentUrl || doc?.location?.href || "";
  const title = options.title || doc?.title || "";
  const fallback = { url: currentUrl, title, type: "unknown" };
  if (!doc || !selection || selection.rangeCount === 0) return fallback;

  const range = selection.getRangeAt(0);
  const origin = getClosestElement(range.commonAncestorContainer);
  if (!origin) return fallback;

  let cursor = origin;
  const isSocial = isSocialFeed(currentUrl);

  while (cursor && cursor !== doc.body) {
    // 1. Try explicit container match
    if (SOCIAL_SELECTORS.some((selector) => cursor.matches?.(selector))) {
      const url = pickSocialLink(cursor, currentUrl, false);
      if (url) {
        return { url, title, type: "social" };
      }
      break; 
    }
    
    // 2. On social feeds, DOM structures change constantly.
    // Aggressively scan upwards for a link matching a known post pattern.
    if (isSocial) {
      const url = pickSocialLink(cursor, currentUrl, true);
      if (url) {
        return { url, title, type: "social" };
      }
    }
    
    cursor = cursor.parentElement;
  }

  return fallback;
};
