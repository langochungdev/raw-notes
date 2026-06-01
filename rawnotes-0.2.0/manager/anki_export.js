export const createAnkiExportModal = ({
  modal,
  panel,
  tabRow,
  tabConfigButton,
  tabReviewButton,
  configPanel,
  reviewPanel,
  templateSelect,
  templateDeleteButton,
  templateEditButton,
  customSummary,
  customPanel,
  customBackButton,
  customNameInput,
  customTextMap,
  customNoteMap,
  customFields,
  customAddField,
  customCancelButton,
  customDeleteButton,
  customSaveButton,
  customError,
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
  footer,
  getCustomTemplates,
  saveCustomTemplates,
  doc
}) => {
  let resolver = null;
  let isOpen = false;
  let items = [];
  let overrides = new Map();
  let frontSource = "text";
  let backSource = "note";
  let template = "basic";
  let templateValue = "basic";
  let currentIndex = 0;
  let vocabEditMode = "table";
  let currentTab = "config";
  let customTemplates = [];
  let selectedCustomTemplate = null;
  let customDraft = {
    name: "",
    textField: "",
    noteField: "",
    fields: []
  };
  let customPrevTemplateValue = "basic";
  let isCustomPanelOpen = false;
  let editingTemplateId = "";
  const audioPlayer = new Audio();

  const TEMPLATE_BASIC = "basic";
  const TEMPLATE_VOCAB = "vocab";
  const TEMPLATE_CUSTOM = "custom";
  const TEMPLATE_CUSTOM_ADD = "custom-add";
  const CUSTOM_PREFIX = "custom:";

  const vocabFields = [
    { key: "keyword", label: "Keyword", type: "text" },
    { key: "suggestion", label: "Suggestion", type: "text" },
    { key: "short_vi", label: "Short Vietnamese", type: "text" },
    { key: "keyword_sound", label: "Keyword_Sound", type: "audio" },
    { key: "image", label: "Image", type: "image" },
    { key: "transcription", label: "Transcription", type: "text" },
    {
      key: "explanation",
      label: "Explanation",
      type: "cloze",
      hint: "Dung {{c1::tu}} de tao cloze"
    },
    { key: "meaning_sound", label: "Meaning_Sound", type: "audio" },
    { key: "example_sound", label: "Example_Sound", type: "audio" },
    { key: "full_vi", label: "Full Vietnamese", type: "text" }
  ];

  const setFooterCount = (count) => {
    if (!exportButton) return;
    exportButton.textContent = `Export ${count} cards`;
  };

  const escapeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const normalizeFieldName = (value) => String(value || "").trim();

  const normalizeCustomTemplate = (raw) => {
    if (!raw || !raw.id || !raw.name) return null;
    const fields = Array.isArray(raw.fields)
      ? raw.fields.map(normalizeFieldName).filter(Boolean)
      : [];
    return {
      id: String(raw.id),
      name: String(raw.name),
      isCustom: true,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
      textField: raw.textField ? String(raw.textField) : "",
      noteField: raw.noteField ? String(raw.noteField) : "",
      fields
    };
  };

  const loadCustomTemplates = () => {
    const raw = typeof getCustomTemplates === "function" ? getCustomTemplates() : [];
    customTemplates = Array.isArray(raw)
      ? raw.map(normalizeCustomTemplate).filter(Boolean)
      : [];
  };

  const renderTemplateOptions = () => {
    if (!templateSelect) return;
    templateSelect.textContent = "";
    const buildOption = (value, label) => {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    };
    templateSelect.appendChild(buildOption(TEMPLATE_BASIC, "Basic"));
    templateSelect.appendChild(buildOption(TEMPLATE_VOCAB, "Vocabulary"));
    customTemplates.forEach((item) => {
      templateSelect.appendChild(buildOption(`${CUSTOM_PREFIX}${item.id}`, item.name));
    });
    templateSelect.appendChild(buildOption(TEMPLATE_CUSTOM_ADD, "Custom +"));
  };

  const selectTemplateValue = (value) => {
    if (!templateSelect) return;
    templateValue = value;
    templateSelect.value = value;
  };

  const setTemplateDeleteState = () => {
    if (!templateDeleteButton) return;
    const canDelete = Boolean(selectedCustomTemplate);
    templateDeleteButton.classList.toggle("hidden", !canDelete);
    templateDeleteButton.disabled = !canDelete;
  };

  const setTemplateEditState = () => {
    if (!templateEditButton) return;
    const canEdit = Boolean(selectedCustomTemplate);
    templateEditButton.classList.toggle("hidden", !canEdit);
    templateEditButton.disabled = !canEdit;
  };

  const setCustomPanelOpen = (value) => {
    isCustomPanelOpen = Boolean(value);
    if (customPanel) customPanel.classList.toggle("hidden", !isCustomPanelOpen);
    if (tabRow) tabRow.classList.toggle("hidden", isCustomPanelOpen);
    if (footer) footer.classList.toggle("hidden", isCustomPanelOpen);
    if (configPanel) configPanel.classList.toggle("hidden", isCustomPanelOpen || currentTab !== "config");
    if (reviewPanel) reviewPanel.classList.toggle("hidden", isCustomPanelOpen || currentTab === "config");
    if (panel) panel.classList.toggle("is-custom", isCustomPanelOpen);
  };

  const setCustomError = (message) => {
    if (!customError) return;
    if (!message) {
      customError.textContent = "";
      customError.classList.add("hidden");
      return;
    }
    customError.textContent = message;
    customError.classList.remove("hidden");
  };

  const resetCustomDraft = (templateData = null) => {
    if (templateData) {
      editingTemplateId = templateData.id;
      customDraft = {
        id: templateData.id,
        name: templateData.name,
        isCustom: true,
        createdAt: templateData.createdAt || new Date().toISOString(),
        updatedAt: templateData.updatedAt || new Date().toISOString(),
        textField: templateData.textField || "",
        noteField: templateData.noteField || "",
        fields: Array.isArray(templateData.fields) ? [...templateData.fields] : []
      };
      return;
    }
    editingTemplateId = "";
    customDraft = {
      id: crypto.randomUUID(),
      name: "",
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      textField: "Word",
      noteField: "Definition",
      fields: ["Word", "Definition"]
    };
  };

  const renderCustomMapOptions = () => {
    if (!customDraft) return;
    const fieldOptions = customDraft.fields.map(normalizeFieldName).filter(Boolean);
    const buildOptions = (selectEl, selectedValue) => {
      if (!selectEl) return;
      selectEl.textContent = "";
      fieldOptions.forEach((field) => {
        const option = doc.createElement("option");
        option.value = field;
        option.textContent = field;
        selectEl.appendChild(option);
      });
      const emptyOption = doc.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "— khong map —";
      selectEl.appendChild(emptyOption);
      selectEl.value = fieldOptions.includes(selectedValue) ? selectedValue : "";
      return selectEl.value;
    };
    customDraft.textField = buildOptions(customTextMap, customDraft.textField);
    customDraft.noteField = buildOptions(customNoteMap, customDraft.noteField);
  };

  const renderCustomFieldList = () => {
    if (!customFields || !customDraft) return;
    customFields.textContent = "";
    customDraft.fields.forEach((fieldName, index) => {
      const row = doc.createElement("div");
      row.className = "anki-custom-field";
      row.setAttribute("draggable", "true");
      row.dataset.index = String(index);

      const handle = doc.createElement("span");
      handle.className = "anki-custom-handle";
      handle.textContent = "⠿";

      const input = doc.createElement("input");
      input.type = "text";
      input.className = "anki-custom-field-input";
      input.value = fieldName;
      input.addEventListener("input", (event) => {
        customDraft.fields[index] = normalizeFieldName(event.target.value);
        renderCustomMapOptions();
        renderCustomFieldList();
      });

      const badge = doc.createElement("span");
      badge.className = "anki-custom-badge";
      const badgeType = fieldName === customDraft.textField
        ? "text"
        : fieldName === customDraft.noteField
          ? "note"
          : "empty";
      if (badgeType === "text") {
        badge.textContent = "text";
        badge.classList.add("is-text");
      } else if (badgeType === "note") {
        badge.textContent = "note";
        badge.classList.add("is-note");
      } else {
        badge.textContent = "trong";
      }

      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "anki-custom-remove";
      remove.textContent = "✕";
      remove.addEventListener("click", () => {
        customDraft.fields.splice(index, 1);
        renderCustomMapOptions();
        renderCustomFieldList();
      });

      row.appendChild(handle);
      row.appendChild(input);
      row.appendChild(badge);
      row.appendChild(remove);
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", String(index));
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const fromIndex = Number(event.dataTransfer.getData("text/plain"));
        if (!Number.isFinite(fromIndex) || fromIndex === index) return;
        const [moved] = customDraft.fields.splice(fromIndex, 1);
        customDraft.fields.splice(index, 0, moved);
        renderCustomFieldList();
      });
      customFields.appendChild(row);
    });
  };

  const renderCustomPanel = () => {
    if (!customDraft) return;
    if (customNameInput) customNameInput.value = customDraft.name || "";
    renderCustomMapOptions();
    renderCustomFieldList();
    setCustomError("");
    if (customDeleteButton) {
      const canDelete = Boolean(editingTemplateId);
      customDeleteButton.classList.toggle("hidden", !canDelete);
      customDeleteButton.disabled = !canDelete;
    }
  };

  const renderCustomSummary = (templateData) => {
    if (!customSummary) return;
    if (!templateData) {
      customSummary.textContent = "";
      customSummary.classList.add("hidden");
      return;
    }
    const parts = [
      `Template: ${templateData.name}`,
      `Text → ${templateData.textField || "(khong map)"}`,
      `Note → ${templateData.noteField || "(khong map)"}`,
      `Fields: ${templateData.fields.join(", ") || "(none)"}`
    ];
    customSummary.textContent = parts.join(" · ");
    customSummary.classList.remove("hidden");
  };

  const openCustomPanel = (templateData = null) => {
    customPrevTemplateValue = templateValue === TEMPLATE_CUSTOM_ADD
      ? TEMPLATE_BASIC
      : templateValue;
    currentTab = "config";
    resetCustomDraft(templateData);
    renderCustomPanel();
    setCustomPanelOpen(true);
  };

  const closeCustomPanel = () => {
    setCustomPanelOpen(false);
  };

  const setTemplateFromValue = (value) => {
    if (value === TEMPLATE_CUSTOM_ADD) {
      openCustomPanel();
      return;
    }
    if (value.startsWith(CUSTOM_PREFIX)) {
      const templateId = value.slice(CUSTOM_PREFIX.length);
      selectedCustomTemplate = customTemplates.find((item) => item.id === templateId) || null;
      if (!selectedCustomTemplate) {
        template = TEMPLATE_BASIC;
        renderCustomSummary(null);
        setTemplateDeleteState();
        setTemplateEditState();
        return;
      }
      template = TEMPLATE_CUSTOM;
      renderCustomSummary(selectedCustomTemplate);
      setTemplateDeleteState();
      setTemplateEditState();
      return;
    }
    selectedCustomTemplate = null;
    template = value === TEMPLATE_VOCAB ? TEMPLATE_VOCAB : TEMPLATE_BASIC;
    renderCustomSummary(null);
    setTemplateDeleteState();
    setTemplateEditState();
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
  const getCustomKey = (itemId, field) => `${itemId}:custom:${field}`;

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

  const getCustomValue = (item, field) => {
    const key = getCustomKey(item.id, field);
    if (overrides.has(key)) return overrides.get(key);
    if (selectedCustomTemplate?.textField === field) return item.text || "";
    if (selectedCustomTemplate?.noteField === field) return item.note || "";
    return "";
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
    tableHeader.textContent = "";
    const row = doc.createElement("div");
    row.className = "anki-row anki-header";
    if (template === TEMPLATE_CUSTOM) {
      const fields = selectedCustomTemplate?.fields || [];
      row.style.gridTemplateColumns = `repeat(${fields.length || 1}, minmax(160px, 1fr))`;
      fields.forEach((field) => {
        const cell = doc.createElement("div");
        cell.className = "anki-cell";
        cell.textContent = field;
        row.appendChild(cell);
      });
    } else if (template === TEMPLATE_BASIC) {
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
    tableBody.textContent = "";
    if (template === TEMPLATE_CUSTOM) {
      if (vocabEditMode !== "table") return;
      const fields = selectedCustomTemplate?.fields || [];
      items.forEach((item) => {
        const row = doc.createElement("div");
        row.className = "anki-row";
        row.style.gridTemplateColumns = `repeat(${fields.length || 1}, minmax(160px, 1fr))`;
        fields.forEach((field) => {
          const cell = doc.createElement("div");
          cell.className = "anki-cell";
          cell.contentEditable = "true";
          cell.dataset.itemId = item.id;
          cell.dataset.field = field;
          cell.dataset.placeholder = "Nhap noi dung...";
          setCellContent(cell, getCustomValue(item, field));
          cell.addEventListener("input", (event) => {
            const target = event.currentTarget;
            const value = target.textContent || "";
            overrides.set(getCustomKey(item.id, field), value);
            if (value) {
              target.classList.remove("is-empty");
            } else {
              target.classList.add("is-empty");
            }
          });
          row.appendChild(cell);
        });
        tableBody.appendChild(row);
      });
      return;
    }
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
    vocabForm.textContent = "";
    if (template === TEMPLATE_CUSTOM && vocabEditMode === "single") {
      const total = items.length;
      if (vocabCounter) vocabCounter.textContent = total ? `${currentIndex + 1} / ${total}` : "0 / 0";
      if (vocabPrev) vocabPrev.disabled = currentIndex === 0;
      if (vocabNext) vocabNext.disabled = currentIndex >= total - 1;
      const item = items[currentIndex];
      if (!item) return;
      const fields = selectedCustomTemplate?.fields || [];
      fields.forEach((field) => {
        const row = doc.createElement("div");
        row.className = "anki-vocab-field";

        const label = doc.createElement("div");
        label.className = "anki-vocab-field-label";
        label.textContent = field;
        row.appendChild(label);

        const input = doc.createElement("textarea");
        input.className = "anki-vocab-input";
        input.value = getCustomValue(item, field);
        input.setAttribute("data-item-id", item.id);
        input.setAttribute("data-field", field);
        input.rows = 3;
        input.addEventListener("input", (event) => {
          const target = event.currentTarget;
          const value = target.value || "";
          overrides.set(getCustomKey(item.id, field), value);
        });

        row.appendChild(input);
        vocabForm.appendChild(row);
      });
      return;
    }
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
      if (reviewDots) reviewDots.textContent = "";
      return;
    }
    if (template === TEMPLATE_CUSTOM) {
      reviewFront.textContent = "";
      reviewBack.textContent = "";
      if (reviewBackSecondary) reviewBackSecondary.textContent = "";
      if (reviewCounter) reviewCounter.textContent = "0 / 0";
      if (reviewDots) reviewDots.textContent = "";
      return;
    }
    const item = items[currentIndex];
    if (template === TEMPLATE_VOCAB) {
      const suggestion = getVocabValue(item, "suggestion");
      const explanation = getVocabValue(item, "explanation");
      const transcription = getVocabValue(item, "transcription");
      const keyword = getVocabValue(item, "keyword");
      const shortVi = getVocabValue(item, "short_vi");
      reviewFront.replaceChildren(...new DOMParser().parseFromString(`
        <div class="anki-vocab-suggestion">${escapeHtml(suggestion)}</div>
        <div class="anki-vocab-explanation">${renderCloze(explanation, "front")}</div>
        <div class="anki-vocab-short">${escapeHtml(shortVi)}</div>
      `, "text/html").body.childNodes);
      reviewBack.replaceChildren(...new DOMParser().parseFromString(`
        <div class="anki-vocab-transcription">${escapeHtml(transcription)}</div>
        <div class="anki-vocab-explanation">${renderCloze(explanation, "back")}</div>
        <div class="anki-vocab-divider"></div>
        <div class="anki-vocab-keyword">${escapeHtml(keyword)}</div>
        <div class="anki-vocab-short">${escapeHtml(shortVi)}</div>
        <div class="anki-audio-chips">${renderAudioChips(item)}</div>
      `, "text/html").body.childNodes);
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
      reviewDots.textContent = "";
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
    const isCustom = template === TEMPLATE_CUSTOM;
    const isConfig = name === "config" || isCustom || isCustomPanelOpen;
    currentTab = isConfig ? "config" : "review";
    if (tabConfigButton) {
      tabConfigButton.classList.toggle("is-active", isConfig);
      tabConfigButton.setAttribute("aria-selected", isConfig ? "true" : "false");
    }
    if (tabReviewButton) {
      tabReviewButton.classList.toggle("is-active", !isConfig);
      tabReviewButton.setAttribute("aria-selected", !isConfig ? "true" : "false");
      tabReviewButton.disabled = isCustom || isCustomPanelOpen;
    }
    if (tabConfigButton) {
      tabConfigButton.disabled = isCustom || isCustomPanelOpen;
    }
    if (configPanel) configPanel.classList.toggle("hidden", !isConfig);
    if (reviewPanel) reviewPanel.classList.toggle("hidden", isConfig);
    if (!isConfig) {
      renderReview();
    }
  };

  const updateSources = () => {
    const isVocab = template === TEMPLATE_VOCAB;
    const isCustom = template === TEMPLATE_CUSTOM;
    if (frontToggle) {
      frontToggle.classList.toggle("hidden", isVocab || isCustom);
    }
    if (vocabControls) {
      vocabControls.classList.toggle("hidden", !(isVocab || isCustom));
    }
    if (vocabNav) {
      vocabNav.classList.toggle(
        "hidden",
        !(isVocab || isCustom) || vocabEditMode !== "single" || currentTab !== "config"
      );
    }
    if (vocabMode) {
      const buttons = Array.from(vocabMode.querySelectorAll("button"));
      buttons.forEach((button) => {
        const mode = button.dataset.mode;
        if (mode === "review") {
          button.classList.toggle("hidden", isCustom);
        }
        const isActive = currentTab === "review"
          ? mode === "review"
          : mode === vocabEditMode;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }
    if (panel) {
      panel.classList.toggle("is-vocab-table", isVocab && vocabEditMode === "table");
      panel.classList.toggle("is-vocab-single", isVocab && vocabEditMode === "single");
      panel.classList.toggle("is-custom-template", isCustom);
    }
    if (table) {
      table.classList.toggle("hidden", (isVocab || isCustom) && vocabEditMode !== "table");
    }
    if (vocabForm) {
      vocabForm.classList.toggle("hidden", !(isVocab || isCustom) || vocabEditMode !== "single");
    }
    if (reviewCard) {
      reviewCard.classList.toggle("is-vocab", isVocab);
    }
    frontSource = isVocab || isCustom ? "text" : getToggleValue(frontToggle, "text");
    backSource = frontSource === "text" ? "note" : "text";
    renderCustomSummary(isCustom ? selectedCustomTemplate : null);
    renderHeader();
    renderTable();
    renderVocabForm();
    if (!isCustom) {
      renderReview();
    }
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
    overrides,
    customTemplate: selectedCustomTemplate
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
    loadCustomTemplates();
    renderTemplateOptions();
    templateValue = TEMPLATE_BASIC;
    selectTemplateValue(templateValue);
    setTemplateFromValue(templateValue);
    closeCustomPanel();
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
    const value = event.target.value || TEMPLATE_BASIC;
    if (value === TEMPLATE_CUSTOM_ADD) {
      selectTemplateValue(value);
      openCustomPanel();
      return;
    }
    closeCustomPanel();
    selectTemplateValue(value);
    setTemplateFromValue(value);
    if (panel) {
      panel.classList.toggle("is-vocab", template === TEMPLATE_VOCAB);
    }
    if (table) {
      table.classList.toggle("is-vocab", template === TEMPLATE_VOCAB);
    }
    updateSources();
  });

  templateDeleteButton?.addEventListener("click", async () => {
    if (!selectedCustomTemplate) return;
    const ok = window.confirm(`Xoa template ${selectedCustomTemplate.name}?`);
    if (!ok) return;
    const nextTemplates = customTemplates.filter((item) => item.id !== selectedCustomTemplate.id);
    await saveCustomTemplates?.(nextTemplates);
    customTemplates = nextTemplates;
    selectedCustomTemplate = null;
    renderTemplateOptions();
    selectTemplateValue(TEMPLATE_BASIC);
    setTemplateFromValue(TEMPLATE_BASIC);
    updateSources();
  });

  templateEditButton?.addEventListener("click", () => {
    if (!selectedCustomTemplate) return;
    openCustomPanel(selectedCustomTemplate);
  });

  customBackButton?.addEventListener("click", () => {
    closeCustomPanel();
    selectTemplateValue(customPrevTemplateValue);
    setTemplateFromValue(customPrevTemplateValue);
    updateSources();
  });

  customCancelButton?.addEventListener("click", () => {
    closeCustomPanel();
    selectTemplateValue(customPrevTemplateValue);
    setTemplateFromValue(customPrevTemplateValue);
    updateSources();
  });

  customDeleteButton?.addEventListener("click", async () => {
    if (!editingTemplateId) return;
    const target = customTemplates.find((item) => item.id === editingTemplateId);
    if (!target) return;
    const ok = window.confirm(`Xoa template ${target.name}?`);
    if (!ok) return;
    const nextTemplates = customTemplates.filter((item) => item.id !== editingTemplateId);
    await saveCustomTemplates?.(nextTemplates);
    customTemplates = nextTemplates;
    selectedCustomTemplate = null;
    editingTemplateId = "";
    renderTemplateOptions();
    closeCustomPanel();
    selectTemplateValue(TEMPLATE_BASIC);
    setTemplateFromValue(TEMPLATE_BASIC);
    updateSources();
  });

  customAddField?.addEventListener("click", () => {
    customDraft.fields.push("");
    renderCustomMapOptions();
    renderCustomFieldList();
    const inputs = customFields?.querySelectorAll(".anki-custom-field-input");
    const lastInput = inputs ? inputs[inputs.length - 1] : null;
    lastInput?.focus();
  });

  customTextMap?.addEventListener("change", (event) => {
    customDraft.textField = event.target.value || "";
    renderCustomFieldList();
  });

  customNoteMap?.addEventListener("change", (event) => {
    customDraft.noteField = event.target.value || "";
    renderCustomFieldList();
  });

  customSaveButton?.addEventListener("click", async () => {
    const name = escapeText(customNameInput?.value || "");
    const fields = customDraft.fields
      .map((field) => normalizeFieldName(field))
      .filter(Boolean);
    const uniqueSet = new Set(fields.map((field) => field.toLowerCase()));
    let errorMessage = "";
    if (!name) {
      errorMessage = "Ten template khong duoc rong";
    } else if (fields.length === 0) {
      errorMessage = "Can it nhat 1 field";
    } else if (uniqueSet.size !== fields.length) {
      errorMessage = "Ten field khong duoc trung nhau";
    } else if (fields.some((field) => !field)) {
      errorMessage = "Ten field khong duoc rong";
    }
    if (errorMessage) {
      setCustomError(errorMessage);
      return;
    }
    setCustomError("");
    const now = new Date().toISOString();
    if (editingTemplateId) {
      const nextTemplates = customTemplates.map((item) => {
        if (item.id !== editingTemplateId) return item;
        return {
          ...item,
          name,
          textField: customDraft.textField,
          noteField: customDraft.noteField,
          fields,
          updatedAt: now
        };
      });
      await saveCustomTemplates?.(nextTemplates);
      customTemplates = nextTemplates;
      selectedCustomTemplate = customTemplates.find((item) => item.id === editingTemplateId) || null;
      renderTemplateOptions();
      if (selectedCustomTemplate) {
        selectTemplateValue(`${CUSTOM_PREFIX}${selectedCustomTemplate.id}`);
        setTemplateFromValue(`${CUSTOM_PREFIX}${selectedCustomTemplate.id}`);
      } else {
        selectTemplateValue(TEMPLATE_BASIC);
        setTemplateFromValue(TEMPLATE_BASIC);
      }
      closeCustomPanel();
      updateSources();
      return;
    }
    const templateId = crypto.randomUUID();
    const nextTemplate = {
      id: templateId,
      name,
      isCustom: true,
      createdAt: now,
      updatedAt: now,
      textField: customDraft.textField,
      noteField: customDraft.noteField,
      fields
    };
    const nextTemplates = [...customTemplates, nextTemplate];
    await saveCustomTemplates?.(nextTemplates);
    customTemplates = nextTemplates;
    selectedCustomTemplate = nextTemplate;
    renderTemplateOptions();
    selectTemplateValue(`${CUSTOM_PREFIX}${templateId}`);
    setTemplateFromValue(`${CUSTOM_PREFIX}${templateId}`);
    closeCustomPanel();
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
