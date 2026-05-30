export const attachManualEntry = ({
  form,
  entryText,
  entryNote,
  entryTags,
  entryCollector,
  storage,
  searchService,
  getActiveCollectorId,
  getAllItems,
  setAllItems,
  getAllCollectors,
  setAllCollectors,
  recalcCollectorCounts,
  renderCollectors,
  refreshItems,
  showNotice,
  doc
}) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = entryText.value.trim();
    if (!text) {
      showNotice(doc, "Text is required");
      return;
    }
    const collectorId = entryCollector.value || getActiveCollectorId();
    if (!collectorId) {
      showNotice(doc, "Select a collector");
      return;
    }
    const note = entryNote.value.trim();
    const tags = entryTags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const tempId = `temp-${crypto.randomUUID()}`;
    const snapshot = {
      items: [...getAllItems()],
      collectors: [...getAllCollectors()]
    };
    const optimisticItem = {
      id: tempId,
      collectorId,
      text,
      note,
      tags,
      source: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const optimisticItems = [...getAllItems(), optimisticItem];
    setAllItems(optimisticItems);
    setAllCollectors(recalcCollectorCounts(optimisticItems, getAllCollectors()));
    await searchService.index(optimisticItems);
    renderCollectors();
    refreshItems();
    entryText.value = "";
    entryNote.value = "";
    entryTags.value = "";

    try {
      const saved = await storage.saveItem({
        collectorId,
        text,
        note,
        tags,
        source: null
      });
      const updatedItems = getAllItems()
        .filter((item) => item.id !== tempId)
        .concat(saved);
      setAllItems(updatedItems);
      setAllCollectors(recalcCollectorCounts(updatedItems, getAllCollectors()));
      await searchService.index(updatedItems);
      renderCollectors();
      refreshItems();
    } catch (error) {
      setAllItems(snapshot.items);
      setAllCollectors(snapshot.collectors);
      await searchService.index(snapshot.items);
      renderCollectors();
      refreshItems();
      showNotice(doc, "Save failed");
    }
  });
};
