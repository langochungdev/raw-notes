export const createAnkiExportModal = ({
  modal,
  tabConfigButton,
  tabReviewButton,
  configPanel,
  reviewPanel,
  frontToggle,
  tableBody,
  reviewCard,
  reviewFront,
  reviewBack,
  reviewBackSecondary,
  reviewWrap,
  reviewDots,
  reviewHint,
  reviewPrev,
  reviewNext,
  reviewCounter,
  exportButton,
  cancelButton,
  doc
}) => {
  let resolver = null;
  let isOpen = false;
  let items = [];
  let overrides = new Map();
  let frontSource = "text";
  let backSource = "note";
  let currentIndex = 0;

  const setFooterCount = (count) => {
    if (!exportButton) return;
    exportButton.textContent = `Export ${count} cards`;
  };

  const getToggleValue = (group, fallback) => {
    const active = group?.querySelector(".is-active");
    return active?.dataset.value || fallback;
  };

  const setToggleValue = (group, value) => {
    if (!group) return;
    const buttons = Array.from(group.querySelectorAll("button"));
    buttons.forEach((button) => {
      const isActive = button.dataset.value === value;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const getRawValue = (item, source) => {
    if (source === "note") return item.note || "";
    return item.text || "";
  };

  const getSecondaryValue = (item) => {
    const primarySource = backSource;
    const secondarySource = primarySource === "note" ? "text" : "note";
    const value = getRawValue(item, secondarySource);
    const primaryValue = getRawValue(item, primarySource);
    if (!value || value === primaryValue) return "";
    return value;
  };

  const getOverrideKey = (itemId, side, source) => `${itemId}:${side}:${source}`;

  const getDisplayValue = (item, side, source) => {
    const key = getOverrideKey(item.id, side, source);
    if (overrides.has(key)) return overrides.get(key);
    return getRawValue(item, source);
  };

  const setCellContent = (cell, value) => {
    if (value) {
      cell.textContent = value;
      cell.classList.remove("is-empty");
    } else {
      cell.textContent = "";
      cell.classList.add("is-empty");
    }
  };

  const handleCellInput = (event) => {
    const cell = event.currentTarget;
    const itemId = cell.dataset.itemId;
    const side = cell.dataset.side;
    const source = cell.dataset.source;
    const value = cell.textContent || "";
    overrides.set(getOverrideKey(itemId, side, source), value);
    if (value) {
      cell.classList.remove("is-empty");
    } else {
      cell.classList.add("is-empty");
    }
    if (items[currentIndex]?.id === itemId) {
      renderReview();
    }
  };

  const renderTable = () => {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    items.forEach((item, index) => {
      const row = doc.createElement("div");
      row.className = "anki-row";

      const indexCell = doc.createElement("div");
      indexCell.className = "anki-cell anki-index";
      indexCell.textContent = String(index + 1);

      const frontCell = doc.createElement("div");
      frontCell.className = "anki-cell";
      frontCell.contentEditable = "true";
      frontCell.dataset.itemId = item.id;
      frontCell.dataset.side = "front";
      frontCell.dataset.source = frontSource;
      frontCell.dataset.placeholder = "Nhap noi dung...";
      setCellContent(frontCell, getDisplayValue(item, "front", frontSource));
      frontCell.addEventListener("input", handleCellInput);

      const backCell = doc.createElement("div");
      backCell.className = "anki-cell";
      backCell.contentEditable = "true";
      backCell.dataset.itemId = item.id;
      backCell.dataset.side = "back";
      backCell.dataset.source = backSource;
      backCell.dataset.placeholder = "Nhap noi dung...";
      setCellContent(backCell, getDisplayValue(item, "back", backSource));
      backCell.addEventListener("input", handleCellInput);

      row.appendChild(indexCell);
      row.appendChild(frontCell);
      row.appendChild(backCell);
      tableBody.appendChild(row);
    });
  };

  const renderReview = () => {
    if (!reviewFront || !reviewBack || !reviewCounter) return;
    const total = items.length;
    if (total === 0) {
      reviewFront.textContent = "";
      reviewBack.textContent = "";
      if (reviewBackSecondary) reviewBackSecondary.textContent = "";
      reviewCounter.textContent = "0 / 0";
      if (reviewDots) reviewDots.innerHTML = "";
      return;
    }
    const item = items[currentIndex];
    const frontValue = getDisplayValue(item, "front", frontSource);
    const backValue = getDisplayValue(item, "back", backSource);
    reviewFront.textContent = frontValue || "Nhap noi dung...";
    reviewBack.textContent = backValue || "Nhap noi dung...";
    if (reviewBackSecondary) {
      reviewBackSecondary.textContent = getSecondaryValue(item);
    }
    reviewCounter.textContent = `${currentIndex + 1} / ${total}`;
    if (reviewDots) {
      reviewDots.innerHTML = "";
      for (let i = 0; i < total; i += 1) {
        const dot = doc.createElement("span");
        dot.className = "anki-review-dot";
        if (i === currentIndex) {
          dot.classList.add("is-active");
        }
        reviewDots.appendChild(dot);
      }
    }
    if (reviewPrev) reviewPrev.disabled = currentIndex === 0;
    if (reviewNext) reviewNext.disabled = currentIndex >= total - 1;
  };

  const openTab = (name) => {
    const isConfig = name === "config";
    if (tabConfigButton) {
      tabConfigButton.classList.toggle("is-active", isConfig);
      tabConfigButton.setAttribute("aria-selected", isConfig ? "true" : "false");
    }
    if (tabReviewButton) {
      tabReviewButton.classList.toggle("is-active", !isConfig);
      tabReviewButton.setAttribute("aria-selected", !isConfig ? "true" : "false");
    }
    if (configPanel) configPanel.classList.toggle("hidden", !isConfig);
    if (reviewPanel) reviewPanel.classList.toggle("hidden", isConfig);
    if (!isConfig) {
      renderReview();
    }
  };

  const updateSources = () => {
    frontSource = getToggleValue(frontToggle, "text");
    backSource = frontSource === "text" ? "note" : "text";
    renderTable();
    renderReview();
  };

  const close = (result) => {
    if (!isOpen) return;
    isOpen = false;
    modal.classList.add("hidden");
    const currentResolver = resolver;
    resolver = null;
    if (currentResolver) {
      currentResolver(result || null);
    }
  };

  const buildPayload = () => ({
    items,
    frontSource,
    backSource,
    overrides
  });

  const open = (payload) => {
    if (!modal) return Promise.resolve(null);
    if (isOpen) {
      close(null);
    }
    isOpen = true;
    items = payload.items || [];
    overrides = new Map();
    currentIndex = 0;
    setFooterCount(items.length);
    setToggleValue(frontToggle, "text");
    updateSources();
    openTab("config");
    if (reviewCard) reviewCard.classList.remove("is-flipped");
    if (reviewWrap) reviewWrap.classList.remove("is-flipped");
    if (reviewHint) reviewHint.classList.remove("is-hidden");
    modal.classList.remove("hidden");
    return new Promise((resolve) => {
      resolver = resolve;
    });
  };

  tabConfigButton?.addEventListener("click", () => openTab("config"));
  tabReviewButton?.addEventListener("click", () => openTab("review"));

  frontToggle?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    setToggleValue(frontToggle, button.dataset.value || "text");
    updateSources();
  });

  reviewCard?.addEventListener("click", () => {
    reviewCard.classList.toggle("is-flipped");
    if (reviewWrap) {
      reviewWrap.classList.toggle("is-flipped", reviewCard.classList.contains("is-flipped"));
    }
    if (reviewHint) {
      reviewHint.classList.toggle("is-hidden", reviewCard.classList.contains("is-flipped"));
    }
  });

  reviewPrev?.addEventListener("click", () => {
    if (currentIndex === 0) return;
    currentIndex -= 1;
    if (reviewCard) reviewCard.classList.remove("is-flipped");
    if (reviewWrap) reviewWrap.classList.remove("is-flipped");
    if (reviewHint) reviewHint.classList.remove("is-hidden");
    renderReview();
  });

  reviewNext?.addEventListener("click", () => {
    if (currentIndex >= items.length - 1) return;
    currentIndex += 1;
    if (reviewCard) reviewCard.classList.remove("is-flipped");
    if (reviewWrap) reviewWrap.classList.remove("is-flipped");
    if (reviewHint) reviewHint.classList.remove("is-hidden");
    renderReview();
  });

  exportButton?.addEventListener("click", () => {
    close(buildPayload());
  });

  cancelButton?.addEventListener("click", () => close(null));

  modal?.addEventListener("pointerdown", (event) => {
    if (event.target === modal) {
      close(null);
    }
  });

  doc.addEventListener("keydown", (event) => {
    if (!isOpen) return;
    if (event.key === "Escape") {
      close(null);
    }
  });

  return { open, close };
};
