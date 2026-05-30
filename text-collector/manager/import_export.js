export const attachImportExport = ({
  importButton,
  exportButton,
  storage,
  logger,
  getActiveCollectorId,
  getCollectors,
  loadCollectors,
  loadItems,
  showNotice,
  doc
}) => {
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

  exportButton.addEventListener("click", async () => {
    try {
      const activeCollectorId = getActiveCollectorId();
      if (!activeCollectorId) {
        showNotice(doc, "Select a collector first");
        return;
      }
      if (!window.showSaveFilePicker) {
        showNotice(doc, "File picker not supported");
        return;
      }
      const collector = getCollectors().find(
        (entry) => entry.id === activeCollectorId
      );
      if (!collector) {
        showNotice(doc, "Collector not found");
        return;
      }
      const data = await storage.exportCollector(activeCollectorId);
      const handle = await window.showSaveFilePicker({
        suggestedName: `${collector.name}.json`,
        types: [
          {
            description: "JSON",
            accept: { "application/json": [".json"] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      showNotice(doc, "Export complete");
    } catch (error) {
      await logger.log("ERROR", "export", error.message || "Export failed", {
        stack: error.stack || null
      });
      showNotice(doc, "Export failed");
    }
  });
};
