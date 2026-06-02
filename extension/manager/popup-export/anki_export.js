export const createAnkiExportModal = ({
  modal,
  panel,
  exportTitle,
  tabGroup,
  tabConfigButton,
  tabReviewButton,
  contentFrame,
  configPanel,
  reviewPanel,
  templateSelect,
  templateDeleteButton,
  templateEditButton,
  customSummary,
  customPanel,
  customNameInput,
  customTextMap,
  customNoteMap,
  customFields,
  customAddField,
  customDeleteButton,
  customError,
  frontToggle,
  table,
  tableHeader,
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
  primaryButton,
  primaryText,
  primaryIcon,
  cancelButton,
  getCustomTemplates,
  saveCustomTemplates,
  getSettings,
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
  const TEMPLATE_BASIC = "basic";
  const TEMPLATE_CUSTOM = "custom";
  const TEMPLATE_CUSTOM_ADD = "custom-add";
  const CUSTOM_PREFIX = "custom:";


  const updatePrimaryButton = () => {
    if (!primaryButton || !primaryText || !primaryIcon) return;
    
    if (primaryButton && typeof getSettings === "function") {
      const settings = getSettings();
      if (settings?.defaultCollectorColor) {
        primaryButton.style.backgroundColor = settings.defaultCollectorColor;
      }
    }
    
    if (isCustomPanelOpen) {
      primaryText.textContent = "Lưu Template";
      primaryIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      `;
    } else {
      primaryText.textContent = `Export ${items.length} cards`;
      primaryIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      `;
    }
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
    
    if (exportTitle) exportTitle.textContent = isCustomPanelOpen ? "Custom Template" : "Export Anki";
    if (tabGroup) tabGroup.classList.toggle("hidden", isCustomPanelOpen);
    if (customNameInput) customNameInput.parentElement.classList.toggle("hidden", !isCustomPanelOpen);
    
    const templateWrap = modal?.querySelector(".anki-template");
    if (templateWrap) templateWrap.classList.toggle("hidden", isCustomPanelOpen);
    
    if (customPanel) customPanel.classList.toggle("hidden", !isCustomPanelOpen);
    if (configPanel) configPanel.classList.toggle("hidden", isCustomPanelOpen || currentTab !== "config");
    if (reviewPanel) reviewPanel.classList.toggle("hidden", isCustomPanelOpen || currentTab === "config");
    
    if (panel) {
      panel.classList.toggle("is-custom", isCustomPanelOpen);
      panel.classList.toggle("is-review", !isCustomPanelOpen && currentTab === "review");
    }
    
    updatePrimaryButton();
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
      row.setAttribute("draggable", "false");
      row.dataset.index = String(index);

      const handle = doc.createElement("span");
      handle.className = "anki-custom-handle";
      handle.textContent = "⠿";
      handle.addEventListener("mousedown", () => row.setAttribute("draggable", "true"));
      handle.addEventListener("mouseup", () => row.setAttribute("draggable", "false"));
      handle.addEventListener("mouseleave", () => row.setAttribute("draggable", "false"));

      const input = doc.createElement("input");
      input.type = "text";
      input.className = "anki-custom-field-input";
      input.value = fieldName;
      input.addEventListener("input", (event) => {
        customDraft.fields[index] = normalizeFieldName(event.target.value);
        renderCustomMapOptions();
        
        const badgeType = customDraft.fields[index] === customDraft.textField
          ? "text"
          : customDraft.fields[index] === customDraft.noteField
            ? "note"
            : "empty";
        badge.className = "anki-custom-badge";
        if (badgeType === "text") {
          badge.textContent = "text";
          badge.classList.add("is-text");
        } else if (badgeType === "note") {
          badge.textContent = "note";
          badge.classList.add("is-note");
        } else {
          badge.textContent = "trong";
        }
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
      row.addEventListener("dragend", () => {
        row.setAttribute("draggable", "false");
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
    template = TEMPLATE_BASIC;
    renderCustomSummary(null);
    setTemplateDeleteState();
    setTemplateEditState();
  };

  const getToggleValue = (group, fallback) => {
    const switchBtn = group?.querySelector(".anki-switch-btn");
    if (switchBtn) return switchBtn.dataset.value || fallback;
    const active = group?.querySelector(".is-active");
    return active?.dataset.value || fallback;
  };

  const setToggleValue = (group, value) => {
    if (!group) return;
    const switchBtn = group.querySelector(".anki-switch-btn");
    if (switchBtn) {
      switchBtn.dataset.value = value;
      switchBtn.textContent = `switch: ${value}`;
      return;
    }
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
  const getCustomKey = (itemId, field) => `${itemId}:custom:${field}`;

  const getDisplayValue = (item, side, source) => {
    const key = getOverrideKey(item.id, side, source);
    if (overrides.has(key)) return overrides.get(key);
    return getRawValue(item, source);
  };

  const getCustomValue = (item, field) => {
    const key = getCustomKey(item.id, field);
    if (overrides.has(key)) return overrides.get(key);
    if (selectedCustomTemplate?.textField === field) return item.text || "";
    if (selectedCustomTemplate?.noteField === field) return item.note || "";
    return "";
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

  const renderHeader = () => {
    if (!tableHeader) return;
    tableHeader.textContent = "";
    const row = doc.createElement("div");
    row.className = "anki-row";
    if (template === TEMPLATE_CUSTOM) {
      const fields = selectedCustomTemplate?.fields || [];
      row.style.gridTemplateColumns = `repeat(${fields.length || 1}, 240px)`;
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
    }
    tableHeader.appendChild(row);
  };

  const renderTable = () => {
    if (!tableBody) return;
    tableBody.textContent = "";
    if (template === TEMPLATE_CUSTOM) {
      const fields = selectedCustomTemplate?.fields || [];
      items.forEach((item) => {
        const row = doc.createElement("div");
        row.className = "anki-row";
        row.style.gridTemplateColumns = `repeat(${fields.length || 1}, 240px)`;
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
    if (!reviewFront || !reviewBack) return;
    const total = items.length;
    if (total === 0 || template === TEMPLATE_CUSTOM) {
      reviewFront.textContent = "";
      reviewBack.textContent = "";
      if (reviewBackSecondary) reviewBackSecondary.textContent = "";
      if (reviewCounter) reviewCounter.textContent = "0 / 0";
      if (reviewDots) reviewDots.textContent = "";
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
    if (reviewCounter) {
      reviewCounter.textContent = `${currentIndex + 1} / ${total}`;
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
    if (configPanel) configPanel.classList.toggle("hidden", !isConfig && !isCustomPanelOpen);
    if (reviewPanel) reviewPanel.classList.toggle("hidden", isConfig && !isCustomPanelOpen);
    if (panel) {
      panel.classList.toggle("is-review", !isConfig && !isCustomPanelOpen);
    }
    if (!isConfig) {
      renderReview();
    }
  };

  const updateSources = () => {
    const isCustom = template === TEMPLATE_CUSTOM;
    if (frontToggle) {
      frontToggle.classList.toggle("hidden", isCustom);
    }
    if (panel) {
      panel.classList.toggle("is-custom-template", isCustom);
    }
    if (table) {
      table.classList.remove("hidden");
      table.classList.toggle("is-custom", isCustom);
    }
    if (contentFrame) {
      contentFrame.classList.toggle("is-custom-template", isCustom);
    }
    frontSource = isCustom ? "text" : getToggleValue(frontToggle, "text");
    backSource = frontSource === "text" ? "note" : "text";
    renderCustomSummary(isCustom ? selectedCustomTemplate : null);
    renderHeader();
    renderTable();
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

  let currentOnExport = null;

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
    currentOnExport = payload.onExport || null;
    items = payload.items || [];
    overrides = new Map();
    currentIndex = 0;
    currentTab = "config";
    updatePrimaryButton();
    setToggleValue(frontToggle, "text");
    loadCustomTemplates();
    renderTemplateOptions();
    templateValue = TEMPLATE_BASIC;
    selectTemplateValue(templateValue);
    setTemplateFromValue(templateValue);
    closeCustomPanel();
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
    updateSources();
    openTab("config");
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
    openTab("config");
  });

  templateEditButton?.addEventListener("click", () => {
    if (!selectedCustomTemplate) return;
    openCustomPanel(selectedCustomTemplate);
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
    openTab("config");
  });

  customAddField?.addEventListener("click", () => {
    customDraft.fields.push("");
    renderCustomMapOptions();
    renderCustomFieldList();
    if (customFields) {
      const inputs = customFields.querySelectorAll(".anki-custom-field-input");
      const lastInput = inputs[inputs.length - 1];
      if (lastInput) {
        lastInput.focus();
        lastInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  });

  customTextMap?.addEventListener("change", (event) => {
    customDraft.textField = event.target.value || "";
    renderCustomFieldList();
  });

  customNoteMap?.addEventListener("change", (event) => {
    customDraft.noteField = event.target.value || "";
    renderCustomFieldList();
  });

  const saveCustomTemplate = async () => {
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
  };



  frontToggle?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.classList.contains("anki-switch-btn")) {
      const currentValue = button.dataset.value || "text";
      const nextValue = currentValue === "text" ? "note" : "text";
      setToggleValue(frontToggle, nextValue);
      updateSources();
      return;
    }
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

  primaryButton?.addEventListener("click", () => {
    if (isCustomPanelOpen) {
      saveCustomTemplate();
    } else {
      const payload = buildPayload();
      close(payload);
      if (currentOnExport) {
        currentOnExport(payload);
      }
    }
  });

  cancelButton?.addEventListener("click", () => {
    if (isCustomPanelOpen) {
      closeCustomPanel();
      selectTemplateValue(customPrevTemplateValue);
      setTemplateFromValue(customPrevTemplateValue);
      updateSources();
    } else {
      close(null);
    }
  });

  modal?.addEventListener("pointerdown", (event) => {
    if (event.target === modal || event.target === panel) {
      if (cancelButton) {
        cancelButton.click();
      } else {
        close(null);
      }
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
