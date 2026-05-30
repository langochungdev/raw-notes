(async () => {
  let host = null;
  let button = null;
  let backdrop = null;
  let panel = null;
  let collectorSelect = null;
  let saveLinkInput = null;
  let saveButton = null;
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
      .tc-btn {
        position: fixed;
        z-index: 2147483647;
        display: none;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 999px;
        background: #111;
        color: #f5f5f5;
        border: 1px solid #2a2a2a;
        font: 600 14px/1.2 Arial, sans-serif;
        cursor: pointer;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
        pointer-events: auto;
      }
      .tc-backdrop {
        position: fixed;
        inset: 0;
        display: none;
        background: transparent;
        pointer-events: auto;
      }
      .tc-panel {
        position: fixed;
        display: none;
        width: 220px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid #2a2a2a;
        background: #111;
        color: #f5f5f5;
        font: 600 13px/1.4 Arial, sans-serif;
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.35);
        pointer-events: auto;
      }
      .tc-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 10px;
      }
      .tc-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #a3a3a3;
      }
      .tc-select {
        width: 100%;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid #2a2a2a;
        background: #0c0c0c;
        color: #f5f5f5;
        font-size: 13px;
      }
      .tc-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #d4d4d4;
        margin-bottom: 10px;
      }
      .tc-row input {
        width: 14px;
        height: 14px;
      }
      .tc-save {
        width: 100%;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        color: #f5f5f5;
        font-size: 13px;
        cursor: pointer;
      }
      .tc-save:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      @media (hover: hover) {
        .tc-btn:hover {
          background: #1a1a1a;
        }
        .tc-save:hover {
          background: #232323;
        }
      }
    `;
    const root = document.createElement("div");
    root.className = "tc-root";
    button = document.createElement("button");
    button.className = "tc-btn";
    button.textContent = "TC";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPanel();
    });

    backdrop = document.createElement("div");
    backdrop.className = "tc-backdrop";
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) {
        closePanel();
      }
    });

    panel = document.createElement("div");
    panel.className = "tc-panel";
    const collectorField = document.createElement("div");
    collectorField.className = "tc-field";
    const collectorLabel = document.createElement("div");
    collectorLabel.className = "tc-label";
    collectorLabel.textContent = "Collector";
    collectorSelect = document.createElement("select");
    collectorSelect.className = "tc-select";
    collectorField.appendChild(collectorLabel);
    collectorField.appendChild(collectorSelect);

    const linkRow = document.createElement("label");
    linkRow.className = "tc-row";
    saveLinkInput = document.createElement("input");
    saveLinkInput.type = "checkbox";
    saveLinkInput.checked = true;
    const linkText = document.createElement("span");
    linkText.textContent = "Save with link";
    linkRow.appendChild(saveLinkInput);
    linkRow.appendChild(linkText);

    saveButton = document.createElement("button");
    saveButton.className = "tc-save";
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", async () => {
      await saveSelection();
    });

    panel.appendChild(collectorField);
    panel.appendChild(linkRow);
    panel.appendChild(saveButton);

    root.appendChild(button);
    root.appendChild(backdrop);
    root.appendChild(panel);
    shadow.appendChild(style);
    shadow.appendChild(root);
    document.documentElement.appendChild(host);
  };

  const hideButton = () => {
    if (!button) return;
    button.style.display = "none";
  };

  const showButton = (rect) => {
    if (!button) return;
    const top = Math.max(8, rect.top + window.scrollY - 48);
    const left = Math.max(8, rect.left + window.scrollX);
    button.style.display = "flex";
    button.style.top = `${top}px`;
    button.style.left = `${left}px`;
  };

  const positionPanel = (rect) => {
    if (!panel) return;
    const panelHeight = 140;
    const top = Math.max(8, rect.top + window.scrollY - panelHeight - 12);
    const left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 240));
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  };

  const updateCollectors = async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_COLLECTORS" });
    const collectors = response?.collectors || [];
    collectorSelect.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Default";
    collectorSelect.appendChild(defaultOption);
    collectors.forEach((collector) => {
      const option = document.createElement("option");
      option.value = collector.id;
      option.textContent = collector.name;
      collectorSelect.appendChild(option);
    });
    saveButton.disabled = false;
  };

  const openPanel = async () => {
    if (!panel || !backdrop) return;
    if (!lastRect) return;
    backdrop.style.display = "block";
    panel.style.display = "block";
    positionPanel(lastRect);
    saveButton.disabled = true;
    await updateCollectors();
  };

  const closePanel = () => {
    if (!panel || !backdrop) return;
    panel.style.display = "none";
    backdrop.style.display = "none";
  };

  const saveSelection = async () => {
    const text = sanitizeSelection(lastSelection);
    if (!text) return;
    const payload = {
      type: "SAVE_ITEM",
      text,
      source: saveLinkInput.checked
        ? {
            ...(lastSource || resolveSource(window.getSelection())),
            savedAt: new Date().toISOString()
          }
        : null,
      collectorId: collectorSelect.value || undefined
    };
    const response = await chrome.runtime.sendMessage(payload);
    closePanel();
    hideButton();
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
      hideButton();
      closePanel();
      return;
    }
    const text = selection.toString();
    lastSelection = text;
    if (!text.trim()) {
      hideButton();
      closePanel();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    lastRect = rect;
    lastSource = resolveSource(selection);
    showButton(rect);
  };

  createButton();
  patchHistory();

  document.addEventListener("mouseup", () => {
    setTimeout(onSelection, 0);
  });

  document.addEventListener("scroll", () => {
    hideButton();
    closePanel();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideButton();
      closePanel();
    }
  });
})();
