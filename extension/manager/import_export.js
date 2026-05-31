export const attachImportExport = ({
  importButton,
  exportButton,
  exportMenu,
  exportJsonButton,
  exportAnkiButton,
  exportBadge,
  storage,
  logger,
  getActiveCollectorId,
  isCollectorSelectMode,
  getSelectedCollectorIds,
  getSelectedItemIds,
  getCollectors,
  getAllItems,
  openAnkiExport,
  loadCollectors,
  loadItems,
  showNotice,
  doc
}) => {
  const exportMenuWrap = exportButton?.closest(".export-menu-wrap");

  const closeExportMenu = () => {
    if (!exportMenu || !exportButton) return;
    exportMenu.classList.add("hidden");
    exportMenu.classList.remove("open-up");
    exportButton.setAttribute("aria-expanded", "false");
  };

  const toggleExportMenu = () => {
    if (!exportMenu || !exportButton) return;
    const isHidden = exportMenu.classList.contains("hidden");
    exportMenu.classList.toggle("hidden", !isHidden);
    exportButton.setAttribute("aria-expanded", isHidden ? "true" : "false");
    if (isHidden) {
      requestAnimationFrame(() => {
        const rect = exportMenu.getBoundingClientRect();
        const buttonRect = exportButton.getBoundingClientRect();
        const spaceBelow = window.innerHeight - buttonRect.bottom - 12;
        const spaceAbove = buttonRect.top - 12;
        const shouldOpenUp = rect.height > spaceBelow && spaceAbove > spaceBelow;
        exportMenu.classList.toggle("open-up", shouldOpenUp);
      });
    } else {
      exportMenu.classList.remove("open-up");
    }
  };

  const formatDate = () => new Date().toISOString().slice(0, 10);

  const normalizeFileName = (value) => {
    const cleaned = String(value || "selection")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_");
    return cleaned || "selection";
  };

  const getItemsForExport = () => {
    const selectedIds = getSelectedItemIds ? getSelectedItemIds() : [];
    const items = getAllItems ? getAllItems() : [];
    if (selectedIds.length > 0) {
      const selectedSet = new Set(selectedIds);
      return items.filter((item) => selectedSet.has(item.id));
    }
    const activeCollectorId = getActiveCollectorId?.();
    if (!activeCollectorId) return [];
    return items.filter((item) => {
      const ids = Array.isArray(item.collectorIds) && item.collectorIds.length > 0
        ? item.collectorIds
        : item.collectorId
          ? [item.collectorId]
          : [];
      return ids.includes(activeCollectorId);
    });
  };

  const resolveCollector = (items) => {
    const collectors = getCollectors();
    const activeId = getActiveCollectorId?.();
    const active = collectors.find((entry) => entry.id === activeId);
    if (active) return active;
    const fallbackId = items?.[0]?.collectorId;
    if (fallbackId) {
      return collectors.find((entry) => entry.id === fallbackId) || null;
    }
    return collectors[0] || null;
  };

  const writeFile = async (suggestedName, types, content) => {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types
    });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  const sanitizeTsv = (value) =>
    String(value || "")
      .replace(/\t/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\n/g, "\\n");

  const getOverrideKey = (itemId, side, source) => `${itemId}:${side}:${source}`;
  const getVocabKey = (itemId, field) => `${itemId}:vocab:${field}`;

  const getAnkiValue = (item, side, source, overrides) => {
    const key = getOverrideKey(item.id, side, source);
    if (overrides?.has(key)) return overrides.get(key) || "";
    if (source === "note") return item.note || "";
    return item.text || "";
  };

  const getVocabDefaultValue = (item, field) => {
    if (field === "keyword") return item.text || "";
    if (field === "short_vi") return item.note || "";
    return "";
  };

  const getVocabValue = (item, field, overrides) => {
    const key = getVocabKey(item.id, field);
    if (overrides?.has(key)) return overrides.get(key) || "";
    return getVocabDefaultValue(item, field);
  };

  const handleJsonExport = async () => {
    if (!window.showSaveFilePicker) {
      showNotice(doc, "File picker not supported");
      return;
    }
    const items = getItemsForExport();
    if (items.length === 0) {
      showNotice(doc, "Select a collector first");
      return;
    }
    const collector = resolveCollector(items);
    if (!collector) {
      showNotice(doc, "Collector not found");
      return;
    }
    const selectedIds = getSelectedItemIds ? getSelectedItemIds() : [];
    let data = null;
    if (selectedIds.length > 0) {
      data = {
        schemaVersion: 3,
        exportedAt: new Date().toISOString(),
        collector,
        items
      };
    } else {
      data = await storage.exportCollector(collector.id);
    }
    await writeFile(
      `${normalizeFileName(collector.name)}.json`,
      [
        {
          description: "JSON",
          accept: { "application/json": [".json"] }
        }
      ],
      JSON.stringify(data, null, 2)
    );
    showNotice(doc, "Export complete");
  };

  const handleAnkiExport = async () => {
    if (!window.showSaveFilePicker) {
      showNotice(doc, "File picker not supported");
      return;
    }
    const items = getItemsForExport();
    if (items.length === 0) {
      showNotice(doc, "Select a collector first");
      return;
    }
    const collector = resolveCollector(items);
    if (!collector) {
      showNotice(doc, "Collector not found");
      return;
    }
    const payload = await openAnkiExport?.({ items, collectorName: collector.name });
    if (!payload) return;
    const { frontSource, backSource, overrides, template } = payload;
    let fileName = `${normalizeFileName(collector.name)}_anki_${formatDate()}.txt`;
    let rows = [];
    if (template === "vocab") {
      fileName = `${normalizeFileName(collector.name)}_vocab_anki_${formatDate()}.txt`;
      rows.push("#notetype:Cloze");
      rows = rows.concat(items.map((item) => {
        const fields = [
          "keyword",
          "suggestion",
          "explanation",
          "transcription",
          "short_vi",
          "full_vi",
          "image",
          "keyword_sound",
          "meaning_sound",
          "example_sound"
        ];
        const values = fields.map((field) =>
          sanitizeTsv(getVocabValue(item, field, overrides))
        );
        return values.join("\t");
      }));
    } else {
      rows = items.map((item) => {
        const front = sanitizeTsv(getAnkiValue(item, "front", frontSource, overrides));
        const back = sanitizeTsv(getAnkiValue(item, "back", backSource, overrides));
        return `${front}\t${back}`;
      });
    }
    await writeFile(
      fileName,
      [
        {
          description: "TSV",
          accept: { "text/plain": [".txt"] }
        }
      ],
      rows.join("\n")
    );
    showNotice(doc, "Export complete");
  };

  importButton.addEventListener("click", async () => {
    try {
      if (!window.showOpenFilePicker) {
        showNotice(doc, "File picker not supported");
        return;
      }
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "JSON",
            accept: { "application/json": [".json"] }
          }
        ]
      });
      const file = await handle.getFile();
      const content = await file.text();
      const data = JSON.parse(content);
      const modeInput = window.prompt(
        "Conflict mode: overwrite | skip | duplicate",
        "overwrite"
      );
      const mode =
        modeInput === "skip" || modeInput === "duplicate"
          ? modeInput
          : "overwrite";
      await storage.importCollector(data, mode);
      await loadCollectors();
      await loadItems();
      showNotice(doc, "Import complete");
    } catch (error) {
      await logger.log("ERROR", "import", error.message || "Import failed", {
        stack: error.stack || null
      });
      showNotice(doc, "Import failed");
    }
  });

  exportButton.addEventListener("click", (event) => {
    event.preventDefault();
    toggleExportMenu();
  });

  exportJsonButton?.addEventListener("click", async () => {
    closeExportMenu();
    try {
      await handleJsonExport();
    } catch (error) {
      await logger.log("ERROR", "export", error.message || "Export failed", {
        stack: error.stack || null
      });
      showNotice(doc, "Export failed");
    }
  });

  exportAnkiButton?.addEventListener("click", async () => {
    closeExportMenu();
    try {
      await handleAnkiExport();
    } catch (error) {
      await logger.log("ERROR", "export", error.message || "Export failed", {
        stack: error.stack || null
      });
      showNotice(doc, "Export failed");
    }
  });

  doc.addEventListener("pointerdown", (event) => {
    if (!exportMenuWrap || !exportMenu) return;
    if (!exportMenuWrap.contains(event.target)) {
      closeExportMenu();
    }
  });
};
