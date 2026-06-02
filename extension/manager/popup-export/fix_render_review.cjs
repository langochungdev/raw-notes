const fs = require('fs');
const file = 'd:/store/note/extension/manager/popup-export/anki_export.js';
let content = fs.readFileSync(file, 'utf8');

const splitPoint = "  const renderVocabForm = () => {};";
const before = content.split(splitPoint)[0];

const restOfFile = `  const renderVocabForm = () => {};

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
      reviewCounter.textContent = \`\${currentIndex + 1} / \${total}\`;
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
    
    frontSource = isCustom ? "text" : getToggleValue(frontToggle, "text");
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
  });

  templateDeleteButton?.addEventListener("click", async () => {
    if (!selectedCustomTemplate) return;
    const ok = window.confirm(\`Xoa template \${selectedCustomTemplate.name}?\`);
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



  customDeleteButton?.addEventListener("click", async () => {
    if (!editingTemplateId) return;
    const target = customTemplates.find((item) => item.id === editingTemplateId);
    if (!target) return;
    const ok = window.confirm(\`Xoa template \${target.name}?\`);
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
        selectTemplateValue(\`\${CUSTOM_PREFIX}\${selectedCustomTemplate.id}\`);
        setTemplateFromValue(\`\${CUSTOM_PREFIX}\${selectedCustomTemplate.id}\`);
      } else {
        selectTemplateValue(TEMPLATE_BASIC);
        setTemplateFromValue(TEMPLATE_BASIC);
      }
      closeCustomPanel();
      updateSources();
      return;
    }
    const templateId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);
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
    selectTemplateValue(\`\${CUSTOM_PREFIX}\${templateId}\`);
    setTemplateFromValue(\`\${CUSTOM_PREFIX}\${templateId}\`);
    closeCustomPanel();
    updateSources();
  };

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
`;

const finalContent = before + restOfFile;
fs.writeFileSync(file, finalContent, 'utf8');
console.log('Fixed file');
