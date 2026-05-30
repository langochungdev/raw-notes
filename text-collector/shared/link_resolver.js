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
  /\/story\.php/i,
  /\/permalink\//i,
  /\/p\//i
];

const getClosestElement = (node) => {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node;
  return node.parentElement;
};

const getAnchors = (element) => {
  if (!element || !element.querySelectorAll) return [];
  return Array.from(element.querySelectorAll("a[href]"));
};

const pickSocialLink = (element, currentUrl) => {
  const anchors = getAnchors(element);
  let fallback = null;
  for (const anchor of anchors) {
    const href = anchor.href;
    if (!href) continue;
    if (!fallback && href !== currentUrl) fallback = href;
    if (SOCIAL_URL_PATTERNS.some((pattern) => pattern.test(href))) {
      return href;
    }
  }
  return fallback;
};

const pickFirstLink = (element, currentUrl) => {
  const anchors = getAnchors(element);
  for (const anchor of anchors) {
    const href = anchor.href;
    if (!href) continue;
    if (href !== currentUrl) return href;
  }
  return null;
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
  while (cursor && cursor !== doc.body) {
    if (SOCIAL_SELECTORS.some((selector) => cursor.matches?.(selector))) {
      const url = pickSocialLink(cursor, currentUrl);
      if (url) {
        return { url, title, type: "social" };
      }
    }

    const link = pickFirstLink(cursor, currentUrl);
    if (link) {
      return { url: link, title, type: "blog" };
    }

    cursor = cursor.parentElement;
  }

  return fallback;
};
