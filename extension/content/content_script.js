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
  const SETTINGS_KEY = "tc_settings";
  const DEFAULT_SETTINGS = {
    sidebarOpenMode: "float",
    sidebarShortcut: ""
  };
  let settingsState = { ...DEFAULT_SETTINGS };
  let resolveSource = () => ({
    url: currentUrl,
    title: document.title || "",
    type: "unknown"
  });

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
  } catch (error) {
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
        color: #f5f5f5;
        padding: 6px 10px;
        border-radius: 10px;
        font: 600 12px/1.2 Arial, sans-serif;
        cursor: pointer;
      }
      .tc-collector:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .tc-highlight {
        background: #d9a441;
        color: inherit;
        border-radius: 3px;
        padding: 0 1px;
        cursor: pointer;
        box-decoration-break: clone;
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

    edgeButton = document.createElement("button");
    edgeButton.className = "tc-edge";
    edgeButton.type = "button";
    edgeButton.textContent = "Notes";

    root.appendChild(panel);
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

  const normalizeShortcutKey = (key) => {
    if (key === " ") return "Space";
    if (key === "Escape") return "Esc";
    if (key.length === 1) return key.toUpperCase();
    return key;
  };

  const formatShortcutEvent = (event) => {
    const key = event.key || "";
    const isModifier = ["Control", "Shift", "Alt", "Meta"].includes(key);
    if (isModifier) return "";
    const parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    parts.push(normalizeShortcutKey(key));
    return parts.join("+");
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
    return span;
  };

  const wrapRangeWithHighlights = (range, itemId, color) => {
    const root = range.commonAncestorContainer;
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

  const buildTextIndex = () => {
    const root = getRootNode();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const entries = [];
    let text = "";
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent) continue;
      const start = text.length;
      text += node.textContent;
      const end = text.length;
      entries.push({ node, start, end });
      text += "\n";
    }
    return { text, entries };
  };

  const findRangeByContext = (item, location) => {
    const needle = sanitizeSelection(item.text || "");
    if (!needle) return null;
    const index = buildTextIndex();
    const text = index.text;
    let offset = 0;
    while (true) {
      const found = text.indexOf(needle, offset);
      if (found === -1) return null;
      const before = location?.context?.before || "";
      const after = location?.context?.after || "";
      const beforeStart = Math.max(0, found - before.length);
      const beforeText = text.slice(beforeStart, found);
      const afterText = text.slice(found + needle.length, found + needle.length + after.length);
      const beforeOk = !before || beforeText.endsWith(before);
      const afterOk = !after || afterText.startsWith(after);
      if (beforeOk && afterOk) {
        const startInfo = index.entries.find((entry) => found >= entry.start && found <= entry.end);
        const endPos = found + needle.length;
        const endInfo = index.entries.find((entry) => endPos >= entry.start && endPos <= entry.end);
        if (startInfo && endInfo) {
          const range = document.createRange();
          const startOffset = Math.max(0, Math.min(found - startInfo.start, startInfo.node.textContent.length));
          const endOffset = Math.max(0, Math.min(endPos - endInfo.start, endInfo.node.textContent.length));
          range.setStart(startInfo.node, startOffset);
          range.setEnd(endInfo.node, endOffset);
          return range;
        }
      }
      offset = found + needle.length;
    }
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
      const itemsResponse = await chrome.runtime.sendMessage({ type: "GET_ITEMS" });
      const collectorsResponse = await chrome.runtime.sendMessage({ type: "GET_COLLECTORS" });
      const items = itemsResponse?.items || [];
      const collectors = collectorsResponse?.collectors || [];
      const collectorColors = new Map(
        collectors.map((collector) => [collector.id, collector.color || "#d97706"])
      );
      const relevant = items.filter((item) => {
        if (!item?.source?.url || item.source.url !== currentUrl) return false;
        if (!item.location) return false;
        if (!item.text) return false;
        return true;
      });
      relevant.forEach((item) => {
        if (hasHighlightForItem(item.id)) return;
        const color = collectorColors.get(item.collectorId) || "#d97706";
        const ok = highlightFromLocation(item, item.location, color);
        if (!ok) {
          const range = findRangeByContext(item, item.location);
          if (range) {
            wrapRangeWithHighlights(range, item.id, color);
          }
        }
      });
    } catch (error) {
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
    } catch (error) {
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
      const response = await chrome.runtime.sendMessage({
        type: "SIDEPANEL_GET_STATE"
      });
      if (response?.ok) {
        const isOpen = Boolean(response.isOpen);
        setEdgeSuppressed(isOpen);
        if (!isOpen && showIfClosed) {
          setEdgeVisible(true);
        }
      }
    } catch (error) {
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
    const aboveTop = rect.top + window.scrollY - offset - panelHeight;
    const belowTop = rect.bottom + window.scrollY + offset;
    const top = aboveTop >= 8 ? aboveTop : belowTop;
    const left = Math.max(
      8,
      Math.min(rect.left + window.scrollX, window.innerWidth - panelWidth - 8)
    );
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  };

  const updateCollectors = async () => {
    if (!collectorButtons) return;
    const dirCheck = await chrome.runtime.sendMessage({ type: "HAS_COLLECTOR_DIR" });
    if (!dirCheck?.hasDir) {
      collectorButtons.innerHTML = "";
      const pickButton = document.createElement("button");
      pickButton.type = "button";
      pickButton.className = "tc-collector";
      pickButton.textContent = "Chọn thư mục";
      pickButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
        await chrome.runtime.sendMessage({ type: "OPEN_MANAGER" });
      });
      collectorButtons.appendChild(pickButton);
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: "GET_COLLECTORS" });
    const collectors = response?.collectors || [];
    collectorButtons.innerHTML = "";
    collectors.forEach((collector) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tc-collector";
      button.textContent = collector.name || "Collector";
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
    const response = await chrome.runtime.sendMessage(payload);
    closePanel();
    if (response?.ok) {
      showToast("Saved");
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
    closePanel();
  }, true);

  document.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      closePanel();
      return;
    }
    if (isEditableTarget(event.target)) return;
    const mode = settingsState.sidebarOpenMode;
    if (mode !== "shortcut" && mode !== "both") return;
    if (!settingsState.sidebarShortcut) return;
    const pressed = formatShortcutEvent(event);
    if (!pressed) return;
    if (pressed !== settingsState.sidebarShortcut) return;
    event.preventDefault();
    event.stopPropagation();
    await chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
  });

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target?.closest?.(".tc-highlight");
      if (!target) return;
      const itemId = target.dataset.tcItemId;
      if (!itemId) return;
      event.preventDefault();
      event.stopPropagation();
      chrome.runtime.sendMessage({ type: "OPEN_ITEM_DETAIL", itemId });
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
    await chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
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

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SIDEPANEL_STATE") {
      setEdgeSuppressed(Boolean(message.isOpen));
    }
  });

  chrome.runtime
    .sendMessage({ type: "SIDEPANEL_GET_STATE" })
    .then((response) => {
      if (response?.ok) {
        setEdgeSuppressed(Boolean(response.isOpen));
      }
    })
    .catch(() => {});
})();
