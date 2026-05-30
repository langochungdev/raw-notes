(async () => {
  let host = null;
  let panel = null;
  let collectorButtons = null;
  let lastSelection = "";
  let lastSource = null;
  let lastRect = null;
  let currentUrl = window.location.href;
  let resolveSource = () => ({
    url: currentUrl,
    title: document.title || "",
    type: "unknown"
  });

  const updateUrl = () => {
    currentUrl = window.location.href;
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

    root.appendChild(panel);
    shadow.appendChild(style);
    shadow.appendChild(root);
    document.documentElement.appendChild(host);
  };

  const positionPanel = (rect) => {
    if (!panel) return;
    const offset = 6;
    const top = Math.max(8, rect.top + window.scrollY - offset - 40);
    const left = Math.max(
      8,
      Math.min(rect.left + window.scrollX, window.innerWidth - 320)
    );
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  };

  const updateCollectors = async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_COLLECTORS" });
    const collectors = response?.collectors || [];
    if (!collectorButtons) return;
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
    positionPanel(lastRect);
    await updateCollectors();
  };

  const closePanel = () => {
    if (!panel) return;
    panel.style.display = "none";
  };

  const saveSelection = async (collectorId) => {
    const text = sanitizeSelection(lastSelection);
    if (!text) return;
    const payload = {
      type: "SAVE_ITEM",
      text,
      source: {
        ...(lastSource || resolveSource(window.getSelection())),
        savedAt: new Date().toISOString()
      },
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
    openPanel();
  };

  createButton();
  patchHistory();

  document.addEventListener("mouseup", () => {
    setTimeout(onSelection, 0);
  });

  document.addEventListener("scroll", () => {
    closePanel();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePanel();
    }
  });
})();
