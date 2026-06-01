const SOCIAL_SELECTORS = [
  "article",
  "[role='article']",
  "[data-testid='tweet']",
  "[data-urn]",
  "[data-id]",
  "[data-pagelet^='FeedUnit_']"
];

const SOCIAL_URL_PATTERNS = [
  /\/status\/\d+/i,
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
  /\/photo\/\?fbid=/i,
  /\/share\/p\//i,
  /\/share\/v\//i,
  /\/groups\/.*\/user\//i,
  /\/note\//i,
  /\/@[\w.-]+\/p-/i
];

const isSocialFeed = (url) => {
  return /facebook\.com|twitter\.com|x\.com|instagram\.com|threads\.net|linkedin\.com|substack\.com|reddit\.com/i.test(url);
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

const scoreLink = (href, currentUrl) => {
  if (!href || href === currentUrl) return 0;
  if (href.startsWith('javascript:')) return 0;
  if (href.endsWith('#')) return 0;
  
  let score = 0;
  
  if (SOCIAL_URL_PATTERNS.some(p => p.test(href))) {
    score += 100;
  }
  
  try {
    const url = new URL(href);
    const segments = url.pathname.split('/').filter(Boolean);
    
    if (segments.length > 1) score += 10;
    if (segments.length > 2) score += 10;
    
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && (lastSegment.length > 10 || /\d{8,}/.test(lastSegment))) {
      score += 20;
    }
    
    if (lastSegment && /^(restacks|likes|reposts|quotes|retweets|share|comments)$/i.test(lastSegment)) {
      score -= 50;
    }
    
    if (url.searchParams.has('fbid') || url.searchParams.has('story_fbid') || url.searchParams.has('post_id')) {
      score += 50;
    }
    
    if (segments.length === 1 && !url.search) {
      score -= 50; // heavily penalize simple profile links
    }
  } catch(e) {}
  
  return score;
};

export const resolveSource = (selection, options = {}) => {
  const doc = options.doc || (typeof document !== "undefined" ? document : null);
  const currentUrl = options.currentUrl || doc?.location?.href || "";
  const title = options.title || doc?.title || "";
  const fallback = { url: currentUrl, title, type: "unknown" };
  
  const currentUrlScore = scoreLink(currentUrl, "");

  const trace = [];
  trace.push(`========== LINK RESOLVER TRACE ==========`);
  trace.push(`Current URL: ${currentUrl}`);
  
  const flushTrace = (traceArray) => {
    const text = traceArray.join('\n');

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: "LOG",
        level: "INFO",
        category: "resolver",
        message: text
      }).catch(() => {});
    }
  };

  if (!doc || !selection || selection.rangeCount === 0) {
    trace.push(`Error: No document or selection found.`);
    flushTrace(trace);
    return fallback;
  }

  const isSocial = isSocialFeed(currentUrl);
  trace.push(`isSocialFeed: ${isSocial}`);

  if (!isSocial) {
    trace.push(`Not a social feed. Returning current URL.`);
    flushTrace(trace);
    return fallback;
  }

  const range = selection.getRangeAt(0);
  const origin = getClosestElement(range.commonAncestorContainer);
  if (!origin) {
    trace.push(`Error: No origin element found.`);
    flushTrace(trace);
    return fallback;
  }

  let cursor = origin;
  let bestWeakLink = null;
  let bestWeakScore = 0;
  let levels = 0;
  const MAX_LEVELS = 25;

  while (cursor && cursor !== doc.body && levels < MAX_LEVELS) {
    const anchors = getAnchors(cursor);
    trace.push(`\n[Level ${levels}] <${cursor.tagName.toLowerCase()} class="${cursor.className || ''}"> - found ${anchors.length} anchors.`);
    
    // Stop if we zoom out too far and hit massive containers (e.g. the entire feed)
    if (anchors.length > 150) {
      trace.push(`[Level ${levels}] STOPPING: Anchors > 150. Hit feed boundary.`);
      break;
    }
    
    let localBest = null;
    let localBestScore = 0;
    
    const scoredAnchors = [];
    
    for (const anchor of anchors) {
       const score = scoreLink(anchor.href, currentUrl);
       scoredAnchors.push({ href: anchor.href, score });
       if (score > localBestScore) {
           localBestScore = score;
           localBest = anchor.href;
       }
    }
    
    if (scoredAnchors.length > 0) {
      scoredAnchors.sort((a, b) => b.score - a.score);
      trace.push(`  Top anchors at this level:`);
      scoredAnchors.slice(0, 3).forEach(a => trace.push(`   - [${a.score}] ${a.href}`));
    }
    
    if (localBestScore >= 100) {
       trace.push(`\nSUCCESS: Found definitive post link!`);
       trace.push(`Returning: ${localBest}`);
       flushTrace(trace);
       return { url: localBest, title, type: "social" };
    }
    
    if (localBestScore > bestWeakScore) {
       bestWeakScore = localBestScore;
       bestWeakLink = localBest;
    }
    
    const matchedSelectors = SOCIAL_SELECTORS.filter(sel => cursor.matches?.(sel));
    if (matchedSelectors.length > 0) {
       trace.push(`[Level ${levels}] STOPPING: Hit post boundary container: ${matchedSelectors.join(', ')}`);
       if (bestWeakLink && bestWeakScore > 0) {
          trace.push(`Returning best weak link found inside boundary: ${bestWeakLink}`);
          flushTrace(trace);
          return { url: bestWeakLink, title, type: "social" };
       }
       trace.push(`No weak link found inside boundary. Breaking.`);
       break; 
    }
    
    cursor = cursor.parentElement;
    levels++;
  }
  
  if (isSocial && bestWeakLink && bestWeakScore > currentUrlScore) {
     trace.push(`\nTraversed maximum levels or boundary, returning best weak link: ${bestWeakLink}`);
     flushTrace(trace);
     return { url: bestWeakLink, title, type: "social" };
  }

  trace.push(`\nFAILED: No valid link found. Returning fallback: ${fallback.url}`);
  flushTrace(trace);
  return fallback;
};
