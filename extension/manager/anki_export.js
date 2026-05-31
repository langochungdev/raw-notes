export const createAnkiExportModal = ({
  modal,
  panel,
  tabConfigButton,
  tabReviewButton,
  configPanel,
  reviewPanel,
  templateSelect,
  vocabControls,
  vocabMode,
  vocabNav,
  vocabPrev,
  vocabNext,
  vocabCounter,
  frontToggle,
  table,
  tableHeader,
  tableBody,
  vocabForm,
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
  let template = "basic";
  let currentIndex = 0;
  let vocabEditMode = "table";
  let currentTab = "config";
  const audioPlayer = new Audio();

  const TEMPLATE_BASIC = "basic";
  const TEMPLATE_VOCAB = "vocab";

  const vocabFields = [
    { key: "keyword", label: "Keyword", type: "text" },
    { key: "suggestion", label: "Suggestion", type: "text" },
    {
      key: "explanation",
      label: "Explanation",
      type: "cloze",
      hint: "Dung {{c1::tu}} de tao cloze"
    },
    { key: "transcription", label: "Transcription", type: "text" },
    { key: "short_vi", label: "Short Vietnamese", type: "text" },
    { key: "full_vi", label: "Full Vietnamese", type: "text" },
    { key: "image", label: "Image", type: "image" },
    { key: "keyword_sound", label: "Keyword_Sound", type: "audio" },
    { key: "meaning_sound", label: "Meaning_Sound", type: "audio" },
    { key: "example_sound", label: "Example_Sound", type: "audio" }
  ];

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

  const getVocabDefaultValue = (item, field) => {
    if (field === "keyword") return item.text || "";
    if (field === "short_vi") return item.note || "";
    return "";
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
  const getVocabKey = (itemId, field) => `${itemId}:vocab:${field}`;

  const getDisplayValue = (item, side, source) => {
    const key = getOverrideKey(item.id, side, source);
    if (overrides.has(key)) return overrides.get(key);
    return getRawValue(item, source);
  };

  const getVocabValue = (item, field) => {
    const key = getVocabKey(item.id, field);
    if (overrides.has(key)) return overrides.get(key);
    return getVocabDefaultValue(item, field);
  };

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const renderCloze = (value, mode) => {
    const safe = escapeHtml(value);
    return safe.replace(/\{\{c\d+::(.*?)\}\}/gi, (_match, inner) => {
      if (mode === "front") {
        return "<span class=\"anki-cloze-mask\">[...]</span>";
      }
      return `<span class=\"anki-cloze-reveal\">${inner}</span>`;
    });
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

  const resolveAudioSource = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const match = raw.match(/\[sound:(.+?)\]/i);
    if (match) return match[1];
    return raw;
  };

  const playAudio = (value) => {
    const source = resolveAudioSource(value);
    if (!source) return;
    audioPlayer.src = source;
    audioPlayer.currentTime = 0;
    audioPlayer.play().catch(() => {});
  };

  const renderAudioChips = (item) => {
    const chips = [
      { key: "keyword_sound", label: "Keyword" },
      { key: "meaning_sound", label: "Meaning" },
      { key: "example_sound", label: "Example" }
    ];
    return chips
      .map((chip) => {
        const rawValue = getVocabValue(item, chip.key);
        const source = resolveAudioSource(rawValue);
        const isDisabled = !source;
        return `
          <button
            type="button"
            class="anki-audio-chip${isDisabled ? " is-disabled" : ""}"
            data-audio-key="${chip.key}"
            data-audio-src="${escapeHtml(source)}"
            aria-disabled="${isDisabled ? "true" : "false"}"
            ${isDisabled ? "disabled" : ""}
          >
            <span class="anki-audio-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                <path d="M4 10h4l5-4v12l-5-4H4z" fill="currentColor" />
                <path d="M16 9c1.1 1.2 1.1 4.8 0 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
            </span>
            <span class="anki-audio-label">${chip.label}</span>
          </button>
        `;
      })
      .join("");
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

  const renderHeader = () => {
    if (!tableHeader) return;
    tableHeader.innerHTML = "";
    const row = doc.createElement("div");
    row.className = "anki-row anki-header";
    if (template === TEMPLATE_BASIC) {
      const indexCell = doc.createElement("div");
      indexCell.className = "anki-cell anki-index";
      indexCell.textContent = "#";
      row.appendChild(indexCell);

      const frontCell = doc.createElement("div");
      frontCell.className = "anki-cell";
      frontCell.textContent = "Mat truoc";
      row.appendChild(frontCell);

      const backCell = doc.createElement("div");
      backCell.className = "anki-cell";
      backCell.textContent = "Mat sau";
      row.appendChild(backCell);
    } else {
      vocabFields.forEach((field) => {
        const cell = doc.createElement("div");
        cell.className = "anki-cell";
        const label = doc.createElement("div");
        label.textContent = field.label;
        cell.appendChild(label);
        if (field.hint) {
          const hint = doc.createElement("span");
          hint.className = "anki-header-hint";
          hint.textContent = field.hint;
          cell.appendChild(hint);
        }
        row.appendChild(cell);
      });
    }
    tableHeader.appendChild(row);
  };

  const renderTable = () => {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    if (template === TEMPLATE_VOCAB) {
      if (vocabEditMode !== "table") return;
      items.forEach((item) => {
        const row = doc.createElement("div");
        row.className = "anki-row";
        vocabFields.forEach((field) => {
          const cell = doc.createElement("div");
          cell.className = "anki-cell";
          cell.contentEditable = "true";
          cell.dataset.itemId = item.id;
          cell.dataset.field = field.key;
          cell.dataset.placeholder = "Nhap noi dung...";
          setCellContent(cell, getVocabValue(item, field.key));
          cell.addEventListener("input", (event) => {
            const target = event.currentTarget;
            const value = target.textContent || "";
            overrides.set(getVocabKey(item.id, field.key), value);
            if (value) {
              target.classList.remove("is-empty");
            } else {
              target.classList.add("is-empty");
            }
            if (items[currentIndex]?.id === item.id) {
              renderReview();
            }
          });
          row.appendChild(cell);
        });
        tableBody.appendChild(row);
      });
      return;
    }
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

  const renderVocabForm = () => {
    if (!vocabForm) return;
    vocabForm.innerHTML = "";
    if (template !== TEMPLATE_VOCAB || vocabEditMode !== "single") return;
    const total = items.length;
    if (vocabCounter) vocabCounter.textContent = total ? `${currentIndex + 1} / ${total}` : "0 / 0";
    if (vocabPrev) vocabPrev.disabled = currentIndex === 0;
    if (vocabNext) vocabNext.disabled = currentIndex >= total - 1;
    const item = items[currentIndex];
    if (!item) return;
    vocabFields.forEach((field) => {
      const row = doc.createElement("div");
      row.className = "anki-vocab-field";

      const label = doc.createElement("div");
      label.className = "anki-vocab-field-label";
      label.textContent = field.label;
      row.appendChild(label);

      const input = field.type === "cloze" || field.key === "full_vi"
        ? doc.createElement("textarea")
        : doc.createElement("input");
      input.className = "anki-vocab-input";
      input.value = getVocabValue(item, field.key);
      input.setAttribute("data-item-id", item.id);
      input.setAttribute("data-field", field.key);
      if (field.hint) input.setAttribute("placeholder", field.hint);
      if (input.tagName === "TEXTAREA") {
        input.rows = 3;
      }
      input.addEventListener("input", (event) => {
        const target = event.currentTarget;
        const value = target.value || "";
        overrides.set(getVocabKey(item.id, field.key), value);
        if (items[currentIndex]?.id === item.id) {
          renderReview();
        }
      });

      row.appendChild(input);
      vocabForm.appendChild(row);
    });
  };

  const renderReview = () => {
    if (!reviewFront || !reviewBack) return;
    const total = items.length;
    if (total === 0) {
      reviewFront.textContent = "";
      reviewBack.textContent = "";
      if (reviewBackSecondary) reviewBackSecondary.textContent = "";
      if (reviewCounter) reviewCounter.textContent = "0 / 0";
      if (vocabCounter) vocabCounter.textContent = "0 / 0";
      if (reviewDots) reviewDots.innerHTML = "";
      return;
    }
    const item = items[currentIndex];
    if (template === TEMPLATE_VOCAB) {
      const suggestion = getVocabValue(item, "suggestion");
      const explanation = getVocabValue(item, "explanation");
      const transcription = getVocabValue(item, "transcription");
      const keyword = getVocabValue(item, "keyword");
      const shortVi = getVocabValue(item, "short_vi");
      reviewFront.innerHTML = `
        <div class="anki-vocab-suggestion">${escapeHtml(suggestion)}</div>
        <div class="anki-vocab-explanation">${renderCloze(explanation, "front")}</div>
        <div class="anki-vocab-short">${escapeHtml(shortVi)}</div>
      `;
      reviewBack.innerHTML = `
        <div class="anki-vocab-transcription">${escapeHtml(transcription)}</div>
        <div class="anki-vocab-explanation">${renderCloze(explanation, "back")}</div>
        <div class="anki-vocab-divider"></div>
        <div class="anki-vocab-keyword">${escapeHtml(keyword)}</div>
        <div class="anki-vocab-short">${escapeHtml(shortVi)}</div>
        <div class="anki-audio-chips">${renderAudioChips(item)}</div>
      `;
      if (reviewBackSecondary) {
        reviewBackSecondary.textContent = "";
      }
    } else {
      const frontValue = getDisplayValue(item, "front", frontSource);
      const backValue = getDisplayValue(item, "back", backSource);
      reviewFront.textContent = frontValue || "Nhap noi dung...";
      reviewBack.textContent = backValue || "Nhap noi dung...";
      if (reviewBackSecondary) {
        reviewBackSecondary.textContent = getSecondaryValue(item);
      }
    }
    if (reviewCounter) {
      reviewCounter.textContent = `${currentIndex + 1} / ${total}`;
    }
    if (template === TEMPLATE_VOCAB && vocabCounter) {
      vocabCounter.textContent = `${currentIndex + 1} / ${total}`;
    }
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
    currentTab = isConfig ? "config" : "review";
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
    const isVocab = template === TEMPLATE_VOCAB;
    if (frontToggle) {
      frontToggle.classList.toggle("hidden", isVocab);
    }
    if (vocabControls) {
      vocabControls.classList.toggle("hidden", !isVocab);
    }
    if (vocabNav) {
      vocabNav.classList.toggle(
        "hidden",
        !isVocab || vocabEditMode !== "single" || currentTab !== "config"
      );
    }
    if (vocabMode) {
      const buttons = Array.from(vocabMode.querySelectorAll("button"));
      buttons.forEach((button) => {
        const mode = button.dataset.mode;
        const isActive = currentTab === "review"
          ? mode === "review"
          : mode === vocabEditMode;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }
    if (panel) {
      panel.classList.toggle("is-vocab-table", isVocab && vocabEditMode === "table");
    }
    if (table) {
      table.classList.toggle("hidden", isVocab && vocabEditMode !== "table");
    }
    if (vocabForm) {
      vocabForm.classList.toggle("hidden", !isVocab || vocabEditMode !== "single");
    }
    if (reviewCard) {
      reviewCard.classList.toggle("is-vocab", isVocab);
    }
    frontSource = isVocab ? "text" : getToggleValue(frontToggle, "text");
    backSource = frontSource === "text" ? "note" : "text";
    renderHeader();
    renderTable();
    renderVocabForm();
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
    template,
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
    vocabEditMode = "table";
    currentTab = "config";
    setFooterCount(items.length);
    setToggleValue(frontToggle, "text");
    if (templateSelect) templateSelect.value = template;
    if (panel) {
      panel.classList.toggle("is-vocab", template === TEMPLATE_VOCAB);
    }
    if (table) {
      table.classList.toggle("is-vocab", template === TEMPLATE_VOCAB);
    }
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

  templateSelect?.addEventListener("change", (event) => {
    const value = event.target.value === TEMPLATE_VOCAB ? TEMPLATE_VOCAB : TEMPLATE_BASIC;
    template = value;
    if (panel) {
      panel.classList.toggle("is-vocab", template === TEMPLATE_VOCAB);
    }
    if (table) {
      table.classList.toggle("is-vocab", template === TEMPLATE_VOCAB);
    }
    updateSources();
  });

  vocabMode?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const mode = button.dataset.mode;
    if (mode === "review") {
      openTab("review");
      updateSources();
      return;
    }
    vocabEditMode = mode === "single" ? "single" : "table";
    openTab("config");
    updateSources();
  });

  frontToggle?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    setToggleValue(frontToggle, button.dataset.value || "text");
    updateSources();
  });

  reviewCard?.addEventListener("click", (event) => {
    if (event.target.closest(".anki-audio-chip")) return;
    reviewCard.classList.toggle("is-flipped");
    if (reviewWrap) {
      reviewWrap.classList.toggle("is-flipped", reviewCard.classList.contains("is-flipped"));
    }
    if (reviewHint) {
      reviewHint.classList.toggle("is-hidden", reviewCard.classList.contains("is-flipped"));
    }
  });

  reviewPrev?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (currentIndex === 0) return;
    currentIndex -= 1;
    if (reviewCard) reviewCard.classList.remove("is-flipped");
    if (reviewWrap) reviewWrap.classList.remove("is-flipped");
    if (reviewHint) reviewHint.classList.remove("is-hidden");
    renderReview();
  });

  reviewNext?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (currentIndex >= items.length - 1) return;
    currentIndex += 1;
    if (reviewCard) reviewCard.classList.remove("is-flipped");
    if (reviewWrap) reviewWrap.classList.remove("is-flipped");
    if (reviewHint) reviewHint.classList.remove("is-hidden");
    renderReview();
  });

  vocabPrev?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (currentIndex === 0) return;
    currentIndex -= 1;
    renderVocabForm();
    renderReview();
  });

  vocabNext?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (currentIndex >= items.length - 1) return;
    currentIndex += 1;
    renderVocabForm();
    renderReview();
  });

  reviewBack?.addEventListener("click", (event) => {
    const chip = event.target.closest(".anki-audio-chip");
    if (!chip) return;
    event.stopPropagation();
    if (chip.classList.contains("is-disabled")) return;
    playAudio(chip.dataset.audioSrc || "");
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
