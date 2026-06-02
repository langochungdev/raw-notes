(async () => {
  let host = null;
  let panel = null;
  let collectorButtons = null;
  let edgeButton = null;
  let edgeVisible = false;
  let edgeDragging = false;
  let edgeDragOffset = 0;
  let edgeHideTimer = null;
  let edgeSuppressed = false;
  let edgeDragMoved = false;
  let edgeDragStartY = 0;
  let edgeLastDragAt = 0;
  let lastStateCheckAt = 0;
  let stateCheckInFlight = false;
  let lastSelection = "";
  let lastSource = null;
  let lastRect = null;
  let lastRange = null;
  let currentUrl = window.location.href;
  let restoreTimer = null;
  let restoreInFlight = false;
  let restoreQueued = false;
  let restoreObserver = null;
  let lastRestoreUrl = currentUrl;
  let collectorColorCache = new Map();
  let itemCache = new Map();
  let inlineEditor = null;
  let inlineEditorInput = null;
  let inlineEditorMirror = null;
  let inlineEditorDelete = null;
  let inlineEditorItemId = null;
  let inlineEditorItem = null;
  let inlineEditorOutsideHandler = null;
  let highlightClickTimer = null;
  const SETTINGS_KEY = "tc_settings";
  const DEFAULT_SETTINGS = {
    sidebarOpenMode: "float",
    defaultCollectorColor: "#00eeff"
  };
  let settingsState = { ...DEFAULT_SETTINGS };
  let resolveSource = () => ({
    url: currentUrl,
    title: document.title || "",
    type: "unknown"
  });

  const isContextValid = () => {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  };

  const safeSendMessage = async (payload) => {
    if (!isContextValid()) return null;
    try {
      return await chrome.runtime.sendMessage(payload);
    } catch (error) {
      const msg = error?.message || String(error);
      if (msg.includes("Extension context invalidated")) return null;
      throw error;
    }
  };

  const updateUrl = () => {
    const nextUrl = window.location.href;
    if (nextUrl === currentUrl) return;
    currentUrl = nextUrl;
    handleUrlChange();
  };

  const patchHistory = () => {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      updateUrl();
    };
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      updateUrl();
    };
    window.addEventListener("popstate", updateUrl);
  };

  const sanitizeSelection = (text) => {
    return text
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  };

  try {
    const resolverModule = await import(
      chrome.runtime.getURL("shared/link_resolver.js")
    );
    if (resolverModule?.resolveSource) {
      resolveSource = (selection) =>
        resolverModule.resolveSource(selection, {
          doc: document,
          currentUrl,
          title: document.title || ""
        });
    }
  } catch {
    resolveSource = () => ({
      url: currentUrl,
      title: document.title || "",
      type: "unknown"
    });
  }

  const createButton = () => {
    if (host) return;
    host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      .tc-root {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }
      .tc-panel {
        position: fixed;
        display: none;
        max-width: min(320px, calc(100vw - 24px));
        padding: 6px;
        border-radius: 10px;
        border: none;
        background: transparent;
        color: #f5f5f5;
        font: 600 12px/1.4 Arial, sans-serif;
        box-shadow: none;
        pointer-events: auto;
      }
      .tc-edge {
        position: fixed;
        right: 0;
        top: 40%;
        width: 28px;
        height: 56px;
        background: #111;
        border: 1px solid #2a2a2a;
        border-right: none;
        border-radius: 28px 0 0 28px;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #f5f5f5;
        font: 700 12px/1 Arial, sans-serif;
        cursor: pointer;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(10px);
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      .tc-edge.visible {
        opacity: 1;
        transform: translateX(0);
        pointer-events: auto;
      }
      .tc-edge.hidden {
        pointer-events: none;
      }
      .tc-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .tc-collector {
        border: 1px solid #2a2a2a;
        background: #000;
        color: var(--collector-color, #f5f5f5);
        padding: 6px 10px;
        border-radius: 10px;
        font: 600 12px/1.2 Arial, sans-serif;
        cursor: pointer;
      }
      .tc-collector::selection {
        background: var(--collector-color, #f1f0ee);
        color: #000;
      }
      .tc-collector:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .tc-highlight {
        background: #f1f0ee;
        color: #000 !important;
        border-radius: 3px;
        padding: 0 1px;
        cursor: pointer;
        box-decoration-break: clone;
      }
      .tc-inline-editor {
        position: fixed;
        display: none;
        align-items: center;
        gap: 8px;
        z-index: 2147483647;
        pointer-events: auto;
      }
      .tc-inline-delete {
        width: 26px;
        height: 26px;
        padding: 0;
        border-radius: 999px;
        border: 1px solid rgba(255, 77, 79, 0.6);
        background: #000;
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .tc-inline-field {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      .tc-inline-mirror {
        background: #000;
        color: #fff;
        padding: 6px 10px;
        border-radius: 6px;
        font: 500 13px/1.4 Arial, sans-serif;
        white-space: pre;
      }
      .tc-inline-input {
        position: absolute;
        inset: 0;
        border: none;
        outline: none;
        background: transparent;
        color: transparent;
        caret-color: #fff;
        padding: 6px 10px;
        border-radius: 6px;
        font: 500 13px/1.4 Arial, sans-serif;
      }
      .tc-inline-input::placeholder {
        color: rgba(255, 255, 255, 0.6);
      }
      .tc-flash-focus {
        animation: tc-flash-anim 3s ease-out forwards;
      }
      @keyframes tc-flash-anim {
        0% { box-shadow: 0 0 0 4px var(--collector-color, rgba(241, 240, 238, 0.6)); filter: brightness(1.2); }
        100% { box-shadow: 0 0 0 0 var(--collector-color, rgba(241, 240, 238, 0)); filter: brightness(1); }
      }
      @media (hover: hover) {
        .tc-collector:hover {
          border-color: #3a3a3a;
        }
      }
    `;
    const root = document.createElement("div");
    root.className = "tc-root";
    panel = document.createElement("div");
    panel.className = "tc-panel";
    collectorButtons = document.createElement("div");
    collectorButtons.className = "tc-buttons";
    panel.appendChild(collectorButtons);

    inlineEditor = document.createElement("div");
    inlineEditor.className = "tc-inline-editor";
    inlineEditorDelete = document.createElement("button");
    inlineEditorDelete.type = "button";
    inlineEditorDelete.className = "tc-inline-delete";
    inlineEditorDelete.setAttribute("aria-label", "Delete highlight");
    inlineEditorDelete.replaceChildren(...new DOMParser().parseFromString(`
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <path d="M9 7V5h6v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <path d="M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    `, "text/html").body.childNodes);
    inlineEditorInput = document.createElement("input");
    inlineEditorInput.type = "text";
    inlineEditorInput.className = "tc-inline-input";
    inlineEditorInput.placeholder = "Add note";
    const inlineEditorField = document.createElement("div");
    inlineEditorField.className = "tc-inline-field";
    inlineEditorMirror = document.createElement("span");
    inlineEditorMirror.className = "tc-inline-mirror";
    inlineEditorMirror.textContent = " ";
    inlineEditorField.appendChild(inlineEditorMirror);
    inlineEditorField.appendChild(inlineEditorInput);
    inlineEditor.appendChild(inlineEditorDelete);
    inlineEditor.appendChild(inlineEditorField);

    edgeButton = document.createElement("button");
    edgeButton.className = "tc-edge";
    edgeButton.type = "button";
    edgeButton.textContent = "Notes";

    root.appendChild(panel);
    root.appendChild(inlineEditor);
    root.appendChild(edgeButton);
    shadow.appendChild(style);
    shadow.appendChild(root);
    document.documentElement.appendChild(host);
  };

  const setEdgeVisible = (visible) => {
    if (!edgeButton) return;
    if (edgeSuppressed && visible) return;
    edgeVisible = visible;
    edgeButton.classList.toggle("visible", visible);
    edgeButton.classList.toggle("hidden", !visible);
  };

  const setEdgeSuppressed = (suppressed) => {
    edgeSuppressed = suppressed;
    if (suppressed) {
      setEdgeVisible(false);
    }
  };


  const isEditableTarget = (target) => {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select";
  };

  const getRootNode = () => document.body || document.documentElement;

  const isEditableNode = (node) => {
    if (!node) return false;
    if (node.nodeType === Node.ELEMENT_NODE) {
      return isEditableTarget(node);
    }
    const parent = node.parentElement;
    return parent ? isEditableTarget(parent) : false;
  };

  const getNodeIndex = (node) => {
    if (!node?.parentNode) return -1;
    const siblings = node.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i += 1) {
      if (siblings[i] === node) return i;
    }
    return -1;
  };

  const getNodePath = (node, root) => {
    if (!node || !root) return null;
    const path = [];
    let current = node;
    while (current && current !== root) {
      const index = getNodeIndex(current);
      if (index < 0) return null;
      path.unshift(index);
      current = current.parentNode;
    }
    if (current !== root) return null;
    return path;
  };

  const getNodeByPath = (root, path) => {
    if (!root || !Array.isArray(path)) return null;
    let current = root;
    for (const index of path) {
      if (!current?.childNodes || index < 0 || index >= current.childNodes.length) {
        return null;
      }
      current = current.childNodes[index];
    }
    return current || null;
  };

  const findFirstTextNode = (node) => {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    return walker.nextNode();
  };

  const findLastTextNode = (node) => {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) {
      last = walker.currentNode;
    }
    return last;
  };

  const resolveRangePoint = (container, offset, preferForward) => {
    if (!container) return null;
    if (container.nodeType === Node.TEXT_NODE) {
      return { node: container, offset: Math.max(0, Math.min(offset, container.textContent.length)) };
    }
    const children = container.childNodes;
    if (!children || children.length === 0) return null;
    if (preferForward) {
      for (let i = offset; i < children.length; i += 1) {
        const found = findFirstTextNode(children[i]);
        if (found) return { node: found, offset: 0 };
      }
      return null;
    }
    for (let i = Math.min(offset - 1, children.length - 1); i >= 0; i -= 1) {
      const found = findLastTextNode(children[i]);
      if (found) return { node: found, offset: found.textContent.length };
    }
    return null;
  };

  const collectBeforeText = (node, offset, limit) => {
    if (!node || !limit) return "";
    const root = getRootNode();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    walker.currentNode = node;
    let remaining = limit;
    let result = "";
    const initialText = node.textContent || "";
    if (offset > 0) {
      const slice = initialText.slice(0, offset);
      result = slice.slice(Math.max(0, slice.length - remaining));
      remaining -= result.length;
    }
    while (remaining > 0) {
      const prev = walker.previousNode();
      if (!prev) break;
      const text = prev.textContent || "";
      if (!text) continue;
      const slice = text.slice(Math.max(0, text.length - remaining));
      result = slice + result;
      remaining -= slice.length;
    }
    return result;
  };

  const collectAfterText = (node, offset, limit) => {
    if (!node || !limit) return "";
    const root = getRootNode();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    walker.currentNode = node;
    let remaining = limit;
    let result = "";
    const initialText = node.textContent || "";
    if (offset < initialText.length) {
      const slice = initialText.slice(offset, offset + remaining);
      result += slice;
      remaining -= slice.length;
    }
    while (remaining > 0) {
      const next = walker.nextNode();
      if (!next) break;
      const text = next.textContent || "";
      if (!text) continue;
      const slice = text.slice(0, remaining);
      result += slice;
      remaining -= slice.length;
    }
    return result;
  };

  const buildSelectionLocation = (range) => {
    const root = getRootNode();
    const start = resolveRangePoint(range.startContainer, range.startOffset, true);
    const end = resolveRangePoint(range.endContainer, range.endOffset, false);
    if (!start || !end) return null;
    const startPath = getNodePath(start.node, root);
    const endPath = getNodePath(end.node, root);
    if (!startPath || !endPath) return null;
    const before = collectBeforeText(start.node, start.offset, 100);
    const after = collectAfterText(end.node, end.offset, 100);
    return {
      dom: {
        start: { path: startPath, offset: start.offset },
        end: { path: endPath, offset: end.offset }
      },
      context: { before, after }
    };
  };

  const createHighlightSpan = (itemId, color) => {
    const span = document.createElement("span");
    span.className = "tc-highlight";
    span.dataset.tcItemId = itemId;
    if (color) {
      span.style.backgroundColor = color;
    }
    span.style.color = "#000";
    return span;
  };

  const wrapRangeWithHighlights = (range, itemId, color) => {
    const root =
      range.commonAncestorContainer?.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;
    if (!root) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest(".tc-highlight")) return NodeFilter.FILTER_REJECT;
        if (isEditableNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    nodes.forEach((node) => {
      const text = node.textContent || "";
      const startOffset = node === range.startContainer ? range.startOffset : 0;
      const endOffset = node === range.endContainer ? range.endOffset : text.length;
      if (endOffset <= startOffset) return;
      const beforeText = text.slice(0, startOffset);
      const middleText = text.slice(startOffset, endOffset);
      const afterText = text.slice(endOffset);
      const fragment = document.createDocumentFragment();
      if (beforeText) {
        fragment.appendChild(document.createTextNode(beforeText));
      }
      const span = createHighlightSpan(itemId, color);
      span.textContent = middleText;
      fragment.appendChild(span);
      if (afterText) {
        fragment.appendChild(document.createTextNode(afterText));
      }
      node.parentNode.replaceChild(fragment, node);
    });
    return nodes.length > 0;
  };

  const highlightFromLocation = (item, location, color) => {
    if (!location?.dom?.start || !location?.dom?.end) return false;
    const root = getRootNode();
    const startNode = getNodeByPath(root, location.dom.start.path);
    const endNode = getNodeByPath(root, location.dom.end.path);
    const startText = startNode?.nodeType === Node.TEXT_NODE ? startNode : findFirstTextNode(startNode);
    const endText = endNode?.nodeType === Node.TEXT_NODE ? endNode : findLastTextNode(endNode);
    if (!startText || !endText) return false;
    const range = document.createRange();
    const startOffset = Math.max(0, Math.min(location.dom.start.offset, startText.textContent.length));
    const endOffset = Math.max(0, Math.min(location.dom.end.offset, endText.textContent.length));
    range.setStart(startText, startOffset);
    range.setEnd(endText, endOffset);
    const rangeText = sanitizeSelection(range.toString());
    if (!rangeText || sanitizeSelection(item.text || "") !== rangeText) {
      return false;
    }
    return wrapRangeWithHighlights(range, item.id, color);
  };

  const findRangeWhitespaceAgnostic = (item, location) => {
    const needleRaw = sanitizeSelection(item.text || "");
    if (!needleRaw) return null;

    const root = getRootNode();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
       acceptNode: (node) => {
          if (isEditableNode(node)) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT')) {
              return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
       }
    });
    
    const nodes = [];
    let fullText = "";
    while (walker.nextNode()) {
       const node = walker.currentNode;
       const content = node.textContent;
       nodes.push({ node, start: fullText.length, end: fullText.length + content.length, content });
       fullText += content;
    }
    
    const normalize = (str) => str.replace(/\s+/g, '');
    const needleNorm = normalize(needleRaw);
    if (!needleNorm) return null;
    
    const normToFull = [];
    let normStr = "";
    for (let i = 0; i < fullText.length; i++) {
        if (!/\s/.test(fullText[i])) {
            normToFull.push(i);
            normStr += fullText[i];
        }
    }
    
    const occurrences = [];
    let searchPos = 0;
    while (true) {
        const idx = normStr.indexOf(needleNorm, searchPos);
        if (idx === -1) break;
        occurrences.push(idx);
        searchPos = idx + 1;
    }
    
    if (occurrences.length === 0) return null;
    
    let bestOccurrence = occurrences[0];
    
    if (occurrences.length > 1 && location?.context) {
       const beforeNorm = normalize(location.context.before || "");
       const afterNorm = normalize(location.context.after || "");
       let bestScore = -1;
       
       for (const occ of occurrences) {
           let score = 0;
           const textBefore = normStr.slice(Math.max(0, occ - 100), occ);
           const textAfter = normStr.slice(occ + needleNorm.length, occ + needleNorm.length + 100);
           
           if (beforeNorm && textBefore.endsWith(beforeNorm)) score += 10;
           else if (beforeNorm && textBefore.includes(beforeNorm)) score += 5;
           
           if (afterNorm && textAfter.startsWith(afterNorm)) score += 10;
           else if (afterNorm && textAfter.includes(afterNorm)) score += 5;
           
           if (score > bestScore) {
               bestScore = score;
               bestOccurrence = occ;
           }
       }
    }
    
    const startFullIdx = normToFull[bestOccurrence];
    const endFullIdx = normToFull[bestOccurrence + needleNorm.length - 1] + 1;
    
    const startNodeInfo = nodes.find(n => startFullIdx >= n.start && startFullIdx < n.end);
    const endNodeInfo = nodes.find(n => endFullIdx > n.start && endFullIdx <= n.end);
    
    if (startNodeInfo && endNodeInfo) {
        const range = document.createRange();
        range.setStart(startNodeInfo.node, startFullIdx - startNodeInfo.start);
        range.setEnd(endNodeInfo.node, endFullIdx - endNodeInfo.start);
        
        const overlapsHighlight = Array.from(document.querySelectorAll(".tc-highlight")).some((el) =>
            range.intersectsNode(el)
        );
        if (!overlapsHighlight) {
            return range;
        }
    }
    return null;
  };

  const clearHighlights = () => {
    const highlights = Array.from(document.querySelectorAll(".tc-highlight"));
    highlights.forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(el.textContent || ""), el);
      parent.normalize();
    });
  };

  const clearHighlightsForItem = (itemId) => {
    const highlights = Array.from(
      document.querySelectorAll(`.tc-highlight[data-tc-item-id="${itemId}"]`)
    );
    highlights.forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(el.textContent || ""), el);
      parent.normalize();
    });
  };

  const hasHighlightForItem = (itemId) =>
    Boolean(document.querySelector(`.tc-highlight[data-tc-item-id="${itemId}"]`));

  const restoreHighlights = async () => {
    if (restoreInFlight) {
      restoreQueued = true;
      return;
    }
    restoreInFlight = true;
    restoreQueued = false;
    try {
      const itemsResponse = await safeSendMessage({ type: "GET_ITEMS" });
      const collectorsResponse = await safeSendMessage({ type: "GET_COLLECTORS" });
      const items = itemsResponse?.items || [];
      itemCache = new Map(items.map((item) => [item.id, item]));
      const collectors = collectorsResponse?.collectors || [];
      collectorColorCache = new Map(
        collectors.map((collector) => [collector.id, collector.color || "#f1f0ee"])
      );
      const relevant = items.filter((item) => {
        if (!item?.source?.url || item.source.url !== currentUrl) return false;
        if (!item.location) return false;
        if (!item.text) return false;
        return true;
      });
      relevant.forEach((item) => {
        if (hasHighlightForItem(item.id)) return;
        const color = collectorColorCache.get(item.collectorId) || "#f1f0ee";
        const ok = highlightFromLocation(item, item.location, color);
        if (!ok) {
          const range = findRangeWhitespaceAgnostic(item, item.location);
          if (range) {
            wrapRangeWithHighlights(range, item.id, color);
          }
        }
      });
    } catch (error) {
      const msg = error?.message || String(error);
      if (!msg.includes("Extension context invalidated")) {
        console.warn("Restore highlights failed", error);
      }
    } finally {
      restoreInFlight = false;
      if (restoreQueued) {
        restoreQueued = false;
        restoreHighlights();
      }
    }
  };

  const scheduleRestore = (delay = 400) => {
    if (restoreTimer) clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      restoreHighlights();
    }, delay);
  };

  const syncInlineEditorMirror = () => {
    if (!inlineEditorInput || !inlineEditorMirror) return;
    const value = inlineEditorInput.value || " ";
    inlineEditorMirror.textContent = value;
  };

  const closeInlineEditor = async (options = {}) => {
    if (!inlineEditor || !inlineEditorInput) return;
    const shouldSave = options.save !== false;
    const itemId = inlineEditorItemId;
    const item = inlineEditorItem;
    const nextNote = inlineEditorInput.value.trim();
    inlineEditor.style.display = "none";
    inlineEditorItemId = null;
    inlineEditorItem = null;
    if (inlineEditorOutsideHandler) {
      document.removeEventListener("pointerdown", inlineEditorOutsideHandler);
      inlineEditorOutsideHandler = null;
    }
    if (!shouldSave || !itemId || !item) return;
    if ((item.note || "") === nextNote) return;
    try {
      await safeSendMessage({
        type: "UPDATE_ITEM",
        id: itemId,
        updates: { note: nextNote }
      });
      itemCache.set(itemId, { ...item, note: nextNote });
    } catch (error) {
      console.warn("Update note failed", error);
    }
  };

  const handleScrollToHighlight = (item, providedColor) => {
    if (!item?.location) return;
    const color = providedColor || collectorColorCache.get(item.collectorIds?.[0] || item.collectorId) || "#f1f0ee";
    let retryCount = 0;

    const tryHighlight = () => {
      let ok = highlightFromLocation(item, item.location, color, false);
      if (!ok) {
        const range = findRangeWhitespaceAgnostic(item, item.location);
        if (range) {
          wrapRangeWithHighlights(range, item.id, color);
          ok = true;
        }
      }

      if (ok || hasHighlightForItem(item.id)) {
        const marks = document.querySelectorAll(`.tc-highlight[data-tc-item-id="${item.id}"]`);
        if (marks.length > 0) {
          marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
          marks.forEach((m) => m.classList.add("tc-flash-focus"));
          setTimeout(() => {
            marks.forEach((m) => m.classList.remove("tc-flash-focus"));
          }, 3000);
        }
      } else if (retryCount < 3) {
        retryCount++;
        setTimeout(tryHighlight, 500);
      }
    };

    tryHighlight();
  };

  const positionInlineEditor = (rect) => {
    if (!inlineEditor) return;
    inlineEditor.style.display = "flex";
    inlineEditor.style.visibility = "hidden";
    inlineEditor.style.left = "0px";
    inlineEditor.style.top = "0px";
    const editorRect = inlineEditor.getBoundingClientRect();
    const gap = 8;
    const aboveTop = rect.top - editorRect.height - gap;
    const belowTop = rect.bottom + gap;
    const top = aboveTop >= 8 ? aboveTop : belowTop;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - editorRect.width - 8));
    inlineEditor.style.left = `${left}px`;
    inlineEditor.style.top = `${top}px`;
    inlineEditor.style.visibility = "visible";
  };

  const openInlineEditor = async (itemId, anchorRect) => {
    if (!inlineEditor || !inlineEditorInput || !inlineEditorDelete) return;
    await closeInlineEditor({ save: true });
    let item = itemCache.get(itemId);
    if (!item) {
      try {
        const itemsResponse = await safeSendMessage({ type: "GET_ITEMS" });
        const items = itemsResponse?.items || [];
        itemCache = new Map(items.map((entry) => [entry.id, entry]));
        item = itemCache.get(itemId) || null;
      } catch (error) {
        console.warn("Load item failed", error);
      }
    }
    if (!item) return;
    inlineEditorItemId = itemId;
    inlineEditorItem = item;
    inlineEditorInput.value = item.note || "";
    syncInlineEditorMirror();
    positionInlineEditor(anchorRect);
    if (!item.note || item.note.trim() === "") {
      inlineEditorInput.focus();
      inlineEditorInput.select();
    }
    inlineEditorOutsideHandler = (event) => {
      const target = event.target;
      if (target === host || inlineEditor.contains(target)) return;
      closeInlineEditor({ save: true });
    };
    document.addEventListener("pointerdown", inlineEditorOutsideHandler);
  };

  const startRestoreObserver = () => {
    if (restoreObserver) return;
    const root = getRootNode();
    if (!root) return;
    restoreObserver = new MutationObserver(() => {
      scheduleRestore(600);
    });
    restoreObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  const handleUrlChange = () => {
    if (currentUrl !== lastRestoreUrl) {
      lastRestoreUrl = currentUrl;
      clearHighlights();
      scheduleRestore(600);
    }
  };

  const applySidebarMode = () => {
    const mode = settingsState.sidebarOpenMode;
    // Tương thích ngược: 'both' hoặc 'float' đều bật.
    const allowFloat = mode === "float" || mode === "both";
    if (edgeButton) {
      edgeButton.style.display = allowFloat ? "flex" : "none";
    }
    if (!allowFloat) {
      setEdgeSuppressed(true);
    } else {
      setEdgeSuppressed(false);
      checkSidepanelState(false);
    }
  };

  const loadSettings = async () => {
    try {
      const stored = await chrome.storage.local.get(SETTINGS_KEY);
      const next = stored[SETTINGS_KEY] || {};
      settingsState = { ...DEFAULT_SETTINGS, ...next };
      applySidebarMode();
    } catch {
      settingsState = { ...DEFAULT_SETTINGS };
      applySidebarMode();
    }
  };

  const checkSidepanelState = async (showIfClosed) => {
    if (stateCheckInFlight) return;
    const now = Date.now();
    if (!showIfClosed && now - lastStateCheckAt < 800) return;
    lastStateCheckAt = now;
    stateCheckInFlight = true;
    try {
      const response = await safeSendMessage({
        type: "SIDEPANEL_GET_STATE"
      });
      if (response?.ok) {
        const isOpen = Boolean(response.isOpen);
        setEdgeSuppressed(isOpen);
        if (!isOpen && showIfClosed) {
          setEdgeVisible(true);
        }
      }
    } catch {
      // ignore
    } finally {
      stateCheckInFlight = false;
    }
  };

  const scheduleEdgeHide = () => {
    if (edgeHideTimer) {
      clearTimeout(edgeHideTimer);
    }
    if (!edgeDragging) {
      edgeHideTimer = setTimeout(() => {
        setEdgeVisible(false);
      }, 150);
    }
  };

  const clampEdgeTop = (value) => {
    const height = edgeButton?.offsetHeight || 56;
    const maxTop = window.innerHeight - height - 8;
    return Math.max(8, Math.min(value, maxTop));
  };

  const positionPanel = (rect) => {
    if (!panel) return;
    const offset = 8;
    const panelRect = panel.getBoundingClientRect();
    const panelHeight = panelRect.height || 0;
    const panelWidth = panelRect.width || 320;
    const aboveTop = rect.top - offset - panelHeight;
    const belowTop = rect.bottom + offset;
    const top = aboveTop >= 8 ? aboveTop : belowTop;
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - panelWidth - 8)
    );
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  };

  const updateCollectors = async () => {
    if (!collectorButtons) return;
    const dirCheck = await safeSendMessage({ type: "HAS_COLLECTOR_DIR" });
    if (!dirCheck?.hasDir) {
      collectorButtons.textContent = "";
      const pickButton = document.createElement("button");
      pickButton.type = "button";
      pickButton.className = "tc-collector";
      pickButton.textContent = "Chọn thư mục";
      pickButton.style.setProperty("--collector-color", "#f1f0ee");
      pickButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
        await safeSendMessage({ type: "OPEN_MANAGER" });
      });
      collectorButtons.appendChild(pickButton);
      return;
    }
    const response = await safeSendMessage({ type: "GET_COLLECTORS" });
    const collectors = response?.collectors || [];
    collectorColorCache = new Map(
      collectors.map((collector) => [collector.id, collector.color || "#f1f0ee"])
    );
    collectorButtons.textContent = "";
    collectors.forEach((collector) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tc-collector";
      button.textContent = collector.name || "Collector";
      button.style.setProperty("--collector-color", collector.color || "#f1f0ee");
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await saveSelection(collector.id);
      });
      collectorButtons.appendChild(button);
    });
  };

  const openPanel = async () => {
    if (!panel) return;
    if (!lastRect) return;
    panel.style.display = "block";
    await updateCollectors();
    requestAnimationFrame(() => {
      positionPanel(lastRect);
    });
  };

  const closePanel = () => {
    if (!panel) return;
    panel.style.display = "none";
  };

  const saveSelection = async (collectorId) => {
    const text = sanitizeSelection(lastSelection);
    if (!text) return;
    const location = lastRange ? buildSelectionLocation(lastRange) : null;
    const payload = {
      type: "SAVE_ITEM",
      text,
      source: {
        ...(lastSource || resolveSource(window.getSelection())),
        savedAt: new Date().toISOString()
      },
      location: location || undefined,
      collectorId: collectorId || undefined
    };
    const response = await safeSendMessage(payload);
    closePanel();
    if (response?.ok) {
      showToast("Saved");
      const item = response.item;
      if (item?.id) {
        itemCache.set(item.id, item);
      }
      const range = lastRange?.cloneRange ? lastRange.cloneRange() : null;
      if (item?.id && range) {
        let color = collectorColorCache.get(item.collectorId);
        if (!color) {
          const collectorsResponse = await safeSendMessage({ type: "GET_COLLECTORS" });
          const collectors = collectorsResponse?.collectors || [];
          collectorColorCache = new Map(
            collectors.map((collector) => [collector.id, collector.color || "#d97706"])
          );
          color = collectorColorCache.get(item.collectorId) || "#d97706";
        }
        const ok = wrapRangeWithHighlights(range, item.id, color);
        if (!ok) {
          scheduleRestore(0);
        }
      } else {
        scheduleRestore(0);
      }
    } else {
      showToast("Failed");
    }
  };

  const showToast = (message) => {
    const toast = document.createElement("div");
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: 2147483647,
      padding: "10px 14px",
      background: "#111",
      color: "#f5f5f5",
      border: "1px solid #2a2a2a",
      borderRadius: "8px",
      font: "600 14px/1.4 Arial, sans-serif"
    });
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 1600);
  };

  const onSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      closePanel();
      return;
    }
    const text = selection.toString();
    lastSelection = text;
    if (!text.trim()) {
      closePanel();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    lastRect = rect;
    lastSource = resolveSource(selection);
    lastRange = range.cloneRange();
    openPanel();
  };

  createButton();
  patchHistory();
  await loadSettings();
  scheduleRestore(800);
  startRestoreObserver();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!changes[SETTINGS_KEY]) return;
    const next = changes[SETTINGS_KEY].newValue || {};
    settingsState = { ...DEFAULT_SETTINGS, ...next };
    applySidebarMode();
  });

  document.addEventListener("mouseup", () => {
    setTimeout(onSelection, 0);
  });

  document.addEventListener("scroll", () => {
    closeInlineEditor({ save: true });
    closePanel();
  }, true);

  inlineEditorInput?.addEventListener("input", () => {
    syncInlineEditorMirror();
  });

  inlineEditorDelete?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const itemId = inlineEditorItemId;
    if (!itemId) return;
    try {
      await safeSendMessage({ type: "DELETE_ITEMS", ids: [itemId] });
      itemCache.delete(itemId);
      clearHighlightsForItem(itemId);
    } catch (error) {
      console.warn("Delete item failed", error);
    } finally {
      closeInlineEditor({ save: false });
    }
  });

  document.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      await closeInlineEditor({ save: true });
      closePanel();
      return;
    }
  });

  document.addEventListener(
    "click",
    async (event) => {
      const target = event.target?.closest?.(".tc-highlight");
      if (!target) return;
      if (event.detail > 1) return;
      const itemId = target.dataset.tcItemId;
      if (!itemId) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = target.getBoundingClientRect();
      if (highlightClickTimer) {
        clearTimeout(highlightClickTimer);
      }
      highlightClickTimer = setTimeout(() => {
        openInlineEditor(itemId, rect);
        highlightClickTimer = null;
      }, 220);
    },
    true
  );

  document.addEventListener(
    "dblclick",
    (event) => {
      const target = event.target?.closest?.(".tc-highlight");
      if (!target) return;
      if (highlightClickTimer) {
        clearTimeout(highlightClickTimer);
        highlightClickTimer = null;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  window.addEventListener("mousemove", (event) => {
    if (edgeDragging) return;
    if (event.clientX >= window.innerWidth - 6) {
      checkSidepanelState(true);
      if (edgeSuppressed) return;
      setEdgeVisible(true);
      if (edgeHideTimer) {
        clearTimeout(edgeHideTimer);
        edgeHideTimer = null;
      }
    } else if (edgeVisible) {
      scheduleEdgeHide();
    }
  });

  edgeButton?.addEventListener("mouseenter", () => {
    if (edgeSuppressed) return;
    setEdgeVisible(true);
    if (edgeHideTimer) {
      clearTimeout(edgeHideTimer);
      edgeHideTimer = null;
    }
  });

  edgeButton?.addEventListener("mouseleave", () => {
    if (!edgeDragging) {
      scheduleEdgeHide();
    }
  });

  edgeButton?.addEventListener("click", async (event) => {
    if (edgeDragMoved || Date.now() - edgeLastDragAt < 250) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    await safeSendMessage({ type: "OPEN_SIDEPANEL" });
  });

  edgeButton?.addEventListener("pointerdown", (event) => {
    edgeDragging = true;
    edgeDragMoved = false;
    edgeDragStartY = event.clientY;
    edgeButton.setPointerCapture(event.pointerId);
    const rect = edgeButton.getBoundingClientRect();
    edgeDragOffset = event.clientY - rect.top;
  });

  edgeButton?.addEventListener("pointermove", (event) => {
    if (!edgeDragging) return;
    if (Math.abs(event.clientY - edgeDragStartY) > 4) {
      edgeDragMoved = true;
    }
    const nextTop = clampEdgeTop(event.clientY - edgeDragOffset);
    edgeButton.style.top = `${nextTop}px`;
  });

  edgeButton?.addEventListener("pointerup", (event) => {
    edgeDragging = false;
    edgeButton.releasePointerCapture(event.pointerId);
    if (edgeDragMoved) {
      edgeLastDragAt = Date.now();
    }
    scheduleEdgeHide();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "SIDEPANEL_STATE") {
      setEdgeSuppressed(Boolean(message.isOpen));
    } else if (message?.type === "SCROLL_TO_HIGHLIGHT") {
      handleScrollToHighlight(message.item, message.color);
      sendResponse({ ok: true });
    }
  });

  if (isContextValid()) {
    chrome.runtime
      .sendMessage({ type: "SIDEPANEL_GET_STATE" })
      .then((response) => {
        if (response?.ok) {
          setEdgeSuppressed(Boolean(response.isOpen));
        }
      })
      .catch(() => {});
  }
})();
